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
import type { BetNegotiation, MatchStatus } from "./online";

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
    const roundNo = state ? state.roundsWon[0] + state.roundsWon[1] + 1 : 1;

    const writeState = async (next: GameState, status: MatchStatus) => {
      const { error } = await supabaseAdmin
        .from("matches")
        .update({ state: next as never, status })
        .eq("id", matchId);
      if (error) throw error;
    };
    const writeSettings = async (next: Record<string, unknown>) => {
      const { error } = await supabaseAdmin
        .from("matches")
        .update({ settings: next as never })
        .eq("id", matchId);
      if (error) throw error;
    };

    if (data.type === "propose_bet" || data.type === "accept_bet") {
      const bet = settings["bet"] as BetNegotiation | undefined;
      let nextBet: BetNegotiation;
      if (data.type === "propose_bet") {
        if (!BET_STEPS.includes(data.amount as (typeof BET_STEPS)[number]))
          throw new Error("Mise invalide.");
        nextBet = { amount: data.amount, by: seat, status: "pending", round: roundNo };
      } else {
        if (!bet || bet.round !== roundNo) throw new Error("Aucune mise à accepter.");
        if (bet.by === seat) throw new Error("Vous ne pouvez pas accepter votre propre mise.");
        nextBet = { ...bet, status: "accepted", round: roundNo };
      }
      const nextSettings = { ...settings, bet: nextBet };
      await writeSettings(nextSettings);
      return { state, settings: nextSettings };
    }

    if (data.type === "new_round") {
      if (me !== 0) throw new Error("Seul l'hôte distribue la donne.");
      if (!row.guest_name) throw new Error("En attente du second joueur.");
      const bet = settings["bet"] as BetNegotiation | undefined;
      const betReady = !!bet && bet.status === "accepted" && bet.round === roundNo;
      if (!betReady) throw new Error("La mise n'est pas encore validée.");
      if (state && state.phase !== "roundEnd") throw new Error("Le tour est encore en cours.");
      const dealer: PlayerIndex = state
        ? ((state.lastTrickWinner ?? state.dealer) as PlayerIndex)
        : 1;
      const roundsWon = state ? state.roundsWon : ([0, 0] as [number, number]);
      const next = newRound(dealer, roundsWon);
      await writeState(next, "playing");
      return { state: next, settings };
    }

    if (data.type === "forfeit") {
      if (!state || state.phase === "gameEnd") throw new Error("Partie déjà terminée.");
      let loser: PlayerIndex = me;
      if (data.reason === "timeout") {
        // Le joueur qui observe le dépassement de temps le déclare : on ne se
        // fie pas à sa seule horloge et on vérifie côté serveur que l'état
        // n'a effectivement pas bougé depuis au moins la durée du délai
        // (30s côté client, marge de sécurité incluse ici).
        const ageMs = Date.now() - new Date(row.updated_at).getTime();
        if (ageMs < 25_000) throw new Error("Délai non écoulé.");
        loser = me === 0 ? 1 : 0;
      } else if (data.reason === "disconnect") {
        // Limitation connue : la présence en temps réel n'est pas persistée
        // côté serveur, donc cette déclaration ne peut pas être vérifiée ici
        // aussi strictement que le timeout — seule l'appartenance à la
        // partie est garantie. Une vérification robuste nécessiterait de
        // suivre la présence côté serveur (hors périmètre de ce correctif).
        loser = me === 0 ? 1 : 0;
      }
      const next: GameState = {
        ...state,
        phase: "gameEnd",
        champWinner: (loser === 0 ? 1 : 0) as PlayerIndex,
        forfeit: { loser, reason: data.reason },
      };
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
