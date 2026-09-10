import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  announce,
  drawNext,
  newRound,
  playCard,
  resolveTrick,
  type GameState,
  type PlayerIndex,
} from "./engine";
import { BET_STEPS } from "./tokens";
import type { BetNegotiation, MatchStatus, NextRoundReady } from "./online";

/**
 * Arbitre serveur des parties en ligne.
 *
 * Le client ne calcule et n'écrit plus jamais lui-même l'état d'une partie
 * (`matches.state`) ni les paramètres de mise (`matches.settings`) : il ne
 * fait qu'envoyer l'ACTION qu'il souhaite jouer. Cette fonction recharge
 * l'état stocké, la rejoue avec exactement la même logique que le jeu local
 * (`engine.ts`), et rejette toute action illégale avant d'écrire quoi que ce
 * soit — un client modifié ne peut donc plus s'attribuer une main, un atout
 * ou une mise arbitrairement. Une migration (`protect_match_mutable_columns`)
 * fait respecter cette règle même en cas de bogue ici : seul le rôle
 * `service_role` peut modifier ces deux colonnes.
 */

const suitSchema = z.enum(["S", "H", "D", "C"]);

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("play_card"), cardId: z.string() }),
  z.object({ type: z.literal("resolve_trick") }),
  z.object({ type: z.literal("draw_next") }),
  z.object({
    type: z.literal("announce"),
    suits: z.array(suitSchema),
    trump: suitSchema.nullable(),
  }),
  z.object({ type: z.literal("skip_announce") }),
  z.object({ type: z.literal("new_round") }),
  z.object({ type: z.literal("ready_next_round") }),
  z.object({ type: z.literal("propose_bet"), amount: z.number().int().positive() }),
  z.object({ type: z.literal("accept_bet") }),
  z.object({
    type: z.literal("forfeit"),
    reason: z.enum(["quit", "timeout", "disconnect"]),
  }),
]);

/** L'action à jouer, telle que construite par le client (sans l'identifiant de partie). */
export type MatchAction = z.infer<typeof actionSchema>;

const requestSchema = z.object({
  matchId: z.string().uuid(),
  action: actionSchema,
});

export interface MatchActionResult {
  state: GameState | null;
  settings: Record<string, unknown>;
}

interface ReadyRoundRow {
  updated_at: string;
  state: unknown;
  settings: unknown;
}

interface ReadyRoundIO {
  /** Relit la ligne depuis la base après un conflit d'écriture. */
  reload: () => Promise<ReadyRoundRow>;
  /**
   * Tente l'écriture, sous condition que `updated_at` n'ait pas bougé depuis
   * la lecture passée en paramètre. Renvoie `null` en cas de conflit (ligne
   * modifiée entre-temps), la ligne écrite sinon.
   */
  tryWrite: (
    patch: Record<string, unknown>,
    expectedUpdatedAt: string,
  ) => Promise<ReadyRoundRow | null>;
}

/**
 * Accord des deux joueurs pour enchaîner le tour suivant, une fois le
 * précédent terminé (`phase === "roundEnd"`).
 *
 * En fin de tour les deux joueurs cliquent souvent en même temps. Un simple
 * lire-modifier-écrire perdrait alors la marque du plus lent — le second
 * écrasant l'objet `nextRound` entier — et la table resterait bloquée, les
 * deux joueurs s'attendant mutuellement. On écrit donc en concurrence
 * optimiste : la mise à jour n'est appliquée que si `updated_at` n'a pas
 * bougé depuis la lecture (le déclencheur `matches_touch_updated_at` le
 * rafraîchit à chaque écriture), et on rejoue la décision sur la ligne
 * relue en cas de conflit.
 *
 * Extraite du handler pour rester testable sans dépendre de Supabase — voir
 * match-actions.race.test.ts, qui simule deux appels concurrents.
 */
export async function resolveReadyNextRound(
  seat: "host" | "guest",
  initialRow: ReadyRoundRow,
  io: ReadyRoundIO,
): Promise<MatchActionResult> {
  let current = initialRow;
  for (let attempt = 0; ; attempt++) {
    const curState = (current.state as GameState | null) ?? null;
    const curSettings = (current.settings ?? {}) as Record<string, unknown>;

    if (!curState || curState.phase !== "roundEnd") {
      // Au premier essai, c'est une demande invalide. Après un conflit, c'est
      // que l'adversaire a fait aboutir la donne entre-temps : la demande a
      // bien produit son effet, on renvoie l'état à jour.
      if (attempt === 0)
        throw new Error(curState ? "Le tour est encore en cours." : "Aucune partie en cours.");
      return { state: curState, settings: curSettings };
    }

    const previous = (curSettings["nextRound"] as NextRoundReady | undefined) ?? {
      host: false,
      guest: false,
    };
    const ready: NextRoundReady = { ...previous, [seat]: true };
    const bothReady = ready.host && ready.guest;

    // La marque d'accord est remise à zéro avec la donne : elle ne vaut que
    // pour le tour qui vient de s'achever.
    const nextSettings = {
      ...curSettings,
      nextRound: bothReady ? { host: false, guest: false } : ready,
    };
    const patch: Record<string, unknown> = { settings: nextSettings };
    if (bothReady) {
      const dealer = (curState.lastTrickWinner ?? curState.dealer) as PlayerIndex;
      patch["state"] = newRound(dealer, curState.roundsWon);
      patch["status"] = "playing" satisfies MatchStatus;
    }

    const written = await io.tryWrite(patch, current.updated_at);
    if (written)
      return {
        state: (written.state as GameState | null) ?? null,
        settings: (written.settings ?? {}) as Record<string, unknown>,
      };

    if (attempt >= 3) throw new Error("Table occupée, réessayez.");
    current = await io.reload();
  }
}

/** Motif d'abandon, tel qu'envoyé par le client. */
export type ForfeitReason = NonNullable<GameState["forfeit"]>["reason"];

/**
 * Qui perd un abandon, et l'état de fin de champ qui en résulte.
 *
 * "quit" se déclare contre SOI-MÊME (`me` perd) : c'est le joueur qui
 * abandonne qui envoie l'action. "timeout"/"disconnect" se déclarent contre
 * l'ADVERSAIRE observé — c'est l'autre joueur qui perd, mais seulement si le
 * délai qu'il prétend écoulé (`ageMs`, l'âge de la ligne côté serveur) l'est
 * réellement : on ne se fie jamais à la seule horloge du client qui le
 * déclare, elle pourrait avancer.
 *
 * Extraite du handler pour rester testable sans dépendre de Supabase — voir
 * match-actions.forfeit.test.ts — sur le modèle de `resolveReadyNextRound`
 * ci-dessus.
 */
export function resolveForfeit(
  state: GameState | null,
  me: PlayerIndex,
  reason: ForfeitReason,
  ageMs: number,
): GameState {
  if (!state || state.phase === "gameEnd") throw new Error("Partie déjà terminée.");
  let loser: PlayerIndex = me;
  if (reason === "timeout") {
    // 30 s côté client, marge de sécurité incluse ici : voir declareForfeit
    // dans match.$id.tsx pour le délai qui déclenche l'appel.
    if (ageMs < 25_000) throw new Error("Délai non écoulé.");
    loser = me === 0 ? 1 : 0;
  } else if (reason === "disconnect") {
    // Limitation connue : la présence en temps réel n'est pas persistée côté
    // serveur, donc cette déclaration ne peut pas être vérifiée ici aussi
    // strictement que le timeout — seule l'appartenance à la partie est
    // garantie. Une vérification robuste nécessiterait de suivre la présence
    // côté serveur (hors périmètre de ce correctif).
    loser = me === 0 ? 1 : 0;
  }
  return {
    ...state,
    phase: "gameEnd",
    champWinner: (loser === 0 ? 1 : 0) as PlayerIndex,
    forfeit: { loser, reason },
  };
}

export const applyMatchAction = createServerFn({ method: "POST", strict: { output: false } })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => requestSchema.parse(data))
  .handler(async ({ data: request, context }): Promise<MatchActionResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { matchId, action: data } = request;

    const { data: row, error: loadError } = await supabaseAdmin
      .from("matches")
      .select("*")
      .eq("id", matchId)
      .maybeSingle();
    if (loadError) throw loadError;
    if (!row) throw new Error("Cette partie n'existe plus.");

    const userId = context.userId;
    const me: PlayerIndex | null = row.host_id === userId ? 0 : row.guest_id === userId ? 1 : null;
    if (me === null) throw new Error("Vous ne participez pas à cette partie.");
    const seat: "host" | "guest" = me === 0 ? "host" : "guest";

    const state = (row.state as GameState | null) ?? null;
    const settings = (row.settings ?? {}) as Record<string, unknown>;

    // Règle la mise (déplacement des jetons, classement) dès que le champ se
    // termine, sans dépendre d'un navigateur resté ouvert pour le déclencher.
    //
    // useBetNegotiation.ts appelle aussi `settle_match` dès qu'il voit
    // `state.phase === "gameEnd"` — mais seulement tant que l'écran de partie
    // reste monté pour le voir. Ça tient pour une victoire ordinaire (le
    // joueur reste sur l'écran de fin de champ) mais casse pour un abandon :
    // "Quitter la table" déclare le forfait puis navigue IMMÉDIATEMENT
    // ailleurs, avant même que la réponse ne fasse passer l'état local à
    // "gameEnd" chez celui qui abandonne. Si l'adversaire a lui aussi déjà
    // quitté l'écran au même moment, plus personne n'appelle jamais
    // `settle_match` : la base sait pourtant déjà, correctement, qui a gagné.
    //
    // On règle donc ICI, dans le même aller-retour que l'action qui termine
    // le champ — voir `settle_match_as_server` (SQL), réservée à la clé de
    // service. L'appel client reste un filet de sécurité idempotent
    // (`settled_at` empêche un double règlement), inoffensif à conserver.
    const settleIfEnded = async (next: GameState) => {
      if (next.phase !== "gameEnd") return;
      try {
        // `settle_match_as_server` est trop récente pour figurer dans
        // `types.ts` (régénéré à part, voir account.ts) : même échappatoire
        // que `rpc()` là-bas, pour ne pas figer cet appel sur la forme
        // actuelle du fichier de types généré.
        const admin = supabaseAdmin as unknown as {
          rpc: (n: string, a: Record<string, unknown>) => PromiseLike<{ error: unknown }>;
        };
        const { error } = await admin.rpc("settle_match_as_server", { _match_id: matchId });
        if (error) throw error;
      } catch (e) {
        // Un échec ici ne doit JAMAIS faire échouer l'action elle-même — le
        // forfait ou le coup qui termine le champ a déjà été écrit avec
        // succès juste au-dessus, et c'est de ça que dépend le joueur qui
        // vient d'agir. Le règlement a un filet de sécurité (voir
        // useBetNegotiation.ts, toujours en place, idempotent grâce à
        // `settled_at`) : un blocage réseau passager ici se rattrape de là,
        // au lieu de faire échouer un abandon qui a pourtant bien eu lieu.
        console.error("settle_match_as_server", e);
      }
    };

    const writeState = async (next: GameState, status: MatchStatus) => {
      const { error } = await supabaseAdmin
        .from("matches")
        .update({ state: next as never, status })
        .eq("id", matchId);
      if (error) throw error;
      await settleIfEnded(next);
    };
    const writeSettings = async (next: Record<string, unknown>) => {
      const { error } = await supabaseAdmin
        .from("matches")
        .update({ settings: next as never })
        .eq("id", matchId);
      if (error) throw error;
    };
    const betAccepted = () =>
      (settings["bet"] as BetNegotiation | undefined)?.status === "accepted";

    // La mise est celle du CHAMP entier : elle se négocie avant la première
    // donne et se règle à la fin du champ. Une fois acceptée elle est figée —
    // sans quoi un joueur en mauvaise posture pourrait la revoir à la baisse
    // entre deux tours.
    if (data.type === "propose_bet" || data.type === "accept_bet") {
      if (state) throw new Error("La mise se fixe avant le début du champ.");
      const bet = settings["bet"] as BetNegotiation | undefined;
      if (bet?.status === "accepted") throw new Error("La mise du champ est déjà fixée.");

      // Une mise n'engage que si les DEUX joueurs peuvent la couvrir.
      //
      // Sans ce contrôle, un compte vide pouvait miser n'importe quoi : le
      // règlement de fin de champ (`settle_match`) ne prélève jamais plus que
      // ce que le perdant possède, si bien qu'un joueur sans jetons empochait
      // la mise entière en cas de victoire sans jamais rien risquer. Le pari
      // n'en était plus un.
      const soldeDe = async (id: string | null): Promise<number> => {
        if (!id) return 0;
        const { data: profil, error } = await supabaseAdmin
          .from("profiles")
          .select("tokens")
          .eq("id", id)
          .maybeSingle();
        if (error) throw error;
        return Math.max(0, Number(profil?.tokens ?? 0));
      };

      let nextBet: BetNegotiation;
      if (data.type === "propose_bet") {
        if (!BET_STEPS.includes(data.amount as (typeof BET_STEPS)[number]))
          throw new Error("Mise invalide.");
        if ((await soldeDe(userId)) < data.amount)
          throw new Error("Solde insuffisant : vous ne pouvez pas miser plus que vos jetons.");
        nextBet = { amount: data.amount, by: seat, status: "pending" };
      } else {
        if (!bet) throw new Error("Aucune mise à accepter.");
        if (bet.by === seat) throw new Error("Vous ne pouvez pas accepter votre propre mise.");
        // Les deux soldes sont relus À L'ACCEPTATION : celui du proposant a pu
        // fondre entre sa proposition et cette réponse.
        if ((await soldeDe(userId)) < bet.amount)
          throw new Error("Solde insuffisant : proposez une mise plus basse.");
        const idAdverse = seat === "host" ? row.guest_id : row.host_id;
        if ((await soldeDe(idAdverse)) < bet.amount)
          throw new Error("Votre adversaire n'a plus de quoi couvrir cette mise.");
        nextBet = { ...bet, status: "accepted" };
      }
      const nextSettings = { ...settings, bet: nextBet };
      await writeSettings(nextSettings);
      return { state, settings: nextSettings };
    }

    // Première donne du champ : l'hôte la déclenche dès que la mise est
    // acceptée — cet accord vaut lancement de la partie.
    if (data.type === "new_round") {
      if (me !== 0) throw new Error("Seul l'hôte distribue la donne.");
      if (!row.guest_name) throw new Error("En attente du second joueur.");
      if (state) throw new Error("Le champ a déjà commencé.");
      if (!betAccepted()) throw new Error("La mise n'est pas encore validée.");
      const next = newRound(1, [0, 0]);
      await writeState(next, "playing");
      return { state: next, settings };
    }

    // Donnes suivantes : les DEUX joueurs doivent accepter d'enchaîner — voir
    // resolveReadyNextRound ci-dessous (logique extraite pour rester testable
    // indépendamment de Supabase).
    if (data.type === "ready_next_round") {
      return resolveReadyNextRound(seat, row, {
        reload: async () => {
          const { data: again, error } = await supabaseAdmin
            .from("matches")
            .select("*")
            .eq("id", matchId)
            .maybeSingle();
          if (error) throw error;
          if (!again) throw new Error("Cette partie n'existe plus.");
          return again;
        },
        tryWrite: async (patch, expectedUpdatedAt) => {
          const { data: written, error } = await supabaseAdmin
            .from("matches")
            .update(patch as never)
            .eq("id", matchId)
            .eq("updated_at", expectedUpdatedAt)
            .select()
            .maybeSingle();
          if (error) throw error;
          return written ?? null;
        },
      });
    }

    if (data.type === "forfeit") {
      // Le joueur qui observe le dépassement de temps déclare l'adversaire
      // perdant : on ne se fie pas à sa seule horloge, resolveForfeit
      // vérifie côté serveur que l'état n'a effectivement pas bougé depuis
      // au moins la durée du délai (30s côté client, marge incluse ici).
      const ageMs = Date.now() - new Date(row.updated_at).getTime();
      const next = resolveForfeit(state, me, data.reason, ageMs);
      await writeState(next, "finished");
      return { state: next, settings };
    }

    // --- Actions de jeu : nécessitent une partie en cours ---
    if (!state) throw new Error("Aucune partie en cours.");
    let next: GameState;
    switch (data.type) {
      case "play_card":
        next = playCard(state, me, data.cardId);
        if (next === state) throw new Error("Ce coup n'est pas autorisé.");
        break;
      case "announce":
        next = announce(state, me, data.suits, data.trump);
        if (next === state) throw new Error("Cette annonce n'est pas possible.");
        break;
      case "skip_announce":
        if (state.phase !== "playing" || state.canAnnounce !== me)
          throw new Error("Rien à décliner.");
        next = { ...state, canAnnounce: null };
        break;
      case "resolve_trick":
        next = resolveTrick(state, { atout10: true });
        if (next === state) throw new Error("Aucun pli à résoudre.");
        break;
      case "draw_next":
        next = drawNext(state);
        if (next === state) throw new Error("Aucune pioche en attente.");
        break;
    }
    await writeState(next, next.phase === "gameEnd" ? "finished" : "playing");
    return { state: next, settings };
  });
