import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SUIT_NAME,
  SUIT_SYMBOL,
  availableMelds,
  isBonne,
  stealsBonne,
  legalCards,
  resolveTrick,
  trickCapturesPile,
  type Card,
  type GameState,
  type PlayerIndex,
  type Suit,
} from "@/lib/azteque/engine";
import {
  CapturedPile,
  GainsPanel,
  HandRow,
  StockPile,
  TrickPosition,
  TurnBar,
} from "@/components/azteque/table";
import {
  CoinBurst,
  CollectCard,
  DrawCard,
  FlyingCard,
  SweepCard,
} from "@/components/azteque/animations";
import { sfx, setSoundContext } from "@/lib/azteque/sfx";
import { MatchChat } from "@/components/azteque/MatchChat";
import { BetPanel } from "@/components/azteque/BetPanel";
import { Recap } from "@/components/azteque/panels";
import {
  ensureOnlineIdentity,
  getMatch,
  trackPresence,
  type MatchRow,
  type NextRoundReady,
} from "@/lib/azteque/online";
import { applyMatchAction, type MatchAction } from "@/lib/azteque/match-actions";
import { isTransientError, withRetry } from "@/lib/azteque/net";
import { estRejouable, peutEtreRenvoye, positionSignature } from "@/lib/azteque/replay";
import { announceFreed, registerGameSession } from "@/lib/azteque/game-session";
import { useMatchSync } from "@/hooks/useMatchSync";
import { useTurnCountdown } from "@/hooks/useTurnTimer";
import { useBetNegotiation } from "@/hooks/useBetNegotiation";
import {
  getMyProfile,
  getPublicProfile,
  listPurchases,
  headToHead,
  friendshipStatus,
  requestFriend,
  type FriendshipStatus,
  type HeadToHead,
  type PublicProfile,
} from "@/lib/azteque/account";
import { RankBadge, RankOutcome } from "@/components/azteque/rank";
import { PlayerAvatar } from "@/components/azteque/avatar";
import { DealCeremony, useDealCeremony } from "@/components/azteque/dealing";

export const Route = createFileRoute("/match/$id")({
  validateSearch: (search: Record<string, unknown>): { seat?: "host" | "guest" } =>
    search["seat"] === "guest" ? { seat: "guest" } : { seat: "host" },
  head: () => ({
    meta: [
      { title: "Table en ligne — Aztèque à deux joueurs" },
      {
        name: "description",
        content:
          "Table Aztèque synchronisée en temps réel : posez vos cartes, annoncez vos comptes et remportez le champ face à un ami.",
      },
      { property: "og:title", content: "Table en ligne — Aztèque" },
      {
        property: "og:description",
        content: "Partie Aztèque à deux joueurs, synchronisée en temps réel.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OnlineTable,
});

const TRICK_DELAY = 1000;
/**
 * Temps maximum pour jouer son coup (secondes).
 *
 * C'est un temps de RÉFLEXION : il ne court que lorsque la liaison des deux
 * joueurs est saine. Une coupure le suspend (voir `waitingOnLink`), elle ne le
 * consomme pas.
 */
const TURN_LIMIT = 30;
/**
 * Temps d'attente accordé à la CONNEXION, indépendant du temps de réflexion
 * (secondes).
 *
 * Confondre les deux revenait à faire perdre son tour à un joueur pour une
 * coupure de réseau. Une minute entière est donc accordée au lien pour se
 * rétablir — pendant laquelle la réflexion est gelée — avant que l'absence ne
 * soit tenue pour un abandon.
 */
const LINK_WAIT_LIMIT = 60;

function OnlineTable() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { seat } = Route.useSearch();
  const [verifiedSeat, setVerifiedSeat] = useState<"host" | "guest" | null>(null);
  const me: PlayerIndex = verifiedSeat === "guest" ? 1 : 0;
  const opp: PlayerIndex = me === 0 ? 1 : 0;
  const isHost = me === 0;

  const [row, setRow] = useState<MatchRow | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Un échec de CHARGEMENT dû au réseau n'est pas une fin de non-recevoir :
  // il se réessaie, alors qu'une partie disparue ou un siège usurpé, non.
  const [errorRetryable, setErrorRetryable] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [choosingTrump, setChoosingTrump] = useState(false);
  const [showMyGains, setShowMyGains] = useState(false);
  const [showMyBonnes, setShowMyBonnes] = useState(false);
  const [confirmQuit, setConfirmQuit] = useState(false);

  // --- Animations de déplacement des cartes -----------------------------
  // Le serveur reste seul maître du résultat (voir match-actions.ts) : ces
  // refs et cet état ne servent qu'à faire VOYAGER les cartes à l'écran
  // entre les positions déjà affichées, jamais à décider quoi que ce soit.
  const tableRef = useRef<HTMLDivElement | null>(null);
  const stockRef = useRef<HTMLDivElement | null>(null);
  // Indexées par PlayerIndex (0|1), comme les tableaux de `state` lui-même.
  // Mémorisées : les refs elles-mêmes sont déjà stables (useRef), seul le
  // tableau qui les regroupe ne doit pas changer d'identité à chaque rendu.
  const handRef0 = useRef<HTMLDivElement | null>(null);
  const handRef1 = useRef<HTMLDivElement | null>(null);
  const handRefs = useMemo(() => [handRef0, handRef1] as const, []);
  const trickSlotRef0 = useRef<HTMLDivElement | null>(null);
  const trickSlotRef1 = useRef<HTMLDivElement | null>(null);
  const trickSlotRefs = useMemo(() => [trickSlotRef0, trickSlotRef1] as const, []);
  const pileRef0 = useRef<HTMLDivElement | null>(null);
  const pileRef1 = useRef<HTMLDivElement | null>(null);
  const pileRefs = useMemo(() => [pileRef0, pileRef1] as const, []);
  // Série de bonnes prises sans que l'adversaire n'en reprenne une : remise à
  // zéro au premier pli d'un tour (tas des deux joueurs encore vides).
  const bonneStreak = useRef<{ player: PlayerIndex | null; count: number }>({
    player: null,
    count: 0,
  });

  const [flying, setFlying] = useState<{ card: Card; from: { x: number; y: number } } | null>(null);
  const [collect, setCollect] = useState<
    {
      id: number;
      card: Card;
      from: { x: number; y: number };
      to: { x: number; y: number };
      delay: number;
    }[]
  >([]);
  const [drawFlights, setDrawFlights] = useState<
    {
      id: number;
      player: PlayerIndex;
      from: { x: number; y: number };
      to: { x: number; y: number };
      delay: number;
    }[]
  >([]);
  const [sweepFlights, setSweepFlights] = useState<
    { id: number; from: { x: number; y: number }; to: { x: number; y: number }; delay: number }[]
  >([]);
  // Pendant la résolution d'un pli (ramassage puis éventuel transfert « atout
  // 10 »), le serveur a déjà avancé l'état bien avant que l'animation locale
  // n'ait fini de jouer (l'aller-retour réseau est plus rapide que le vol des
  // cartes). On fige donc l'AFFICHAGE du pli et des tas sur leur valeur d'avant
  // résolution le temps de l'animation, pendant que `state` — la vérité —
  // continue d'avancer normalement en arrière-plan.
  const [frozenTable, setFrozenTable] = useState<{
    trick: GameState["trick"];
    gains: [Card[], Card[]];
  } | null>(null);
  // Empêche la pioche et l'annonce de compte de s'afficher avant la fin de
  // cette même animation.
  const [animating, setAnimating] = useState(false);

  const center = (el: HTMLElement | null | undefined) => {
    const r = el?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  };

  const applyRow = useCallback((next: MatchRow) => {
    setRow(next);
    setState((next.state as GameState | null) ?? null);
  }, []);

  // Cet écran est exclusivement le jeu en ligne : ses sons ne doivent jamais
  // puiser dans les réglages du profil « contre l'IA ».
  useEffect(() => {
    setSoundContext("en_ligne");
  }, []);

  useEffect(() => {
    let alive = true;
    ensureOnlineIdentity()
      .then(async (user) => {
        // Le premier chargement est le moment le plus fragile sur un réseau
        // lent : on réessaie plutôt que d'afficher « chargement impossible ».
        const match = await withRetry(() => getMatch(id), { attempts: 4, deadlineMs: 12_000 });
        return { match, userId: user.id };
      })
      .then(({ match: r, userId }) => {
        if (!alive) return;
        if (!r) {
          setError("Cette partie n'existe plus.");
          return;
        }
        if (r.host_id === userId) setVerifiedSeat("host");
        else if (r.guest_id === userId) setVerifiedSeat("guest");
        else {
          setError("Vous ne participez pas à cette partie.");
          return;
        }
        applyRow(r);
      })
      .catch((e) => {
        if (!alive) return;
        if (isTransientError(e)) {
          setErrorRetryable(true);
          setError("La table n'a pas pu être chargée : la connexion n'a pas répondu.");
          return;
        }
        setErrorRetryable(false);
        setError(e instanceof Error ? e.message : "Chargement impossible.");
      });
    return () => {
      alive = false;
    };
  }, [id, applyRow, seat, reloadKey]);

  // Chargement échoué faute de réseau : on retente de nous-mêmes dès qu'il
  // revient, et régulièrement en attendant. Sans cela, revenir à la table
  // demandait de quitter l'écran et d'y rentrer à nouveau.
  useEffect(() => {
    if (!errorRetryable) return;
    const retenter = () => {
      setError(null);
      setErrorRetryable(false);
      setReloadKey((n) => n + 1);
    };
    const t = setInterval(retenter, 6_000);
    window.addEventListener("online", retenter);
    return () => {
      clearInterval(t);
      window.removeEventListener("online", retenter);
    };
  }, [errorRetryable]);

  // Temps réel + rattrapage périodique : sur connexion faible le websocket
  // tombe sans prévenir, la relecture régulière évite la table figée.
  const sync = useMatchSync(id, !!verifiedSeat, applyRow);

  // Sur réseau faible, c'est souvent NOTRE liaison qui flanche, pas celle de
  // l'adversaire : tant qu'elle n'est pas saine, on ne déclare aucun abandon —
  // ni dépassement de temps (son coup peut être en route), ni déconnexion (la
  // présence passe par le même canal que nous avons perdu).
  const linkHealthy = sync.live && !sync.offline && !sync.stale;

  // Envoi d'action en cours (affiché discrètement) et file d'attente : sur un
  // lien lent, deux actions envoyées coup sur coup ne doivent pas se croiser.
  const [sending, setSending] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  // Le coup que le réseau n'a pas réussi à transmettre (voir REJOUABLES), avec
  // la position dans laquelle il a été voulu.
  const pending = useRef<{ action: MatchAction; position: string } | null>(null);
  const [pendingReplay, setPendingReplay] = useState(false);
  // Position courante, lisible depuis les fonctions qui ne la reçoivent pas.
  const positionRef = useRef("");
  positionRef.current = positionSignature(state);

  // Envoie une action au serveur, qui la rejoue et la valide avant de
  // l'appliquer — le client ne calcule plus lui-même le résultat.
  // `silent` couvre les actions déclenchées automatiquement (résolution de
  // pli, pioche) où un rejet est une course normale, pas une erreur à
  // afficher (l'autre joueur a déjà résolu l'action entre-temps).
  const runAction = useCallback(
    async (action: MatchAction, opts: { silent?: boolean } = {}) => {
      const positionAuDepart = positionRef.current;
      const task = queue.current.then(async () => {
        setSending((n) => n + 1);
        try {
          const result = await withRetry(
            () => applyMatchAction({ data: { matchId: id, action } }),
            {
              // Volontairement moins obstiné qu'avant : les actions partent
              // l'une après l'autre, et une tentative qui s'acharne bloque
              // toutes les suivantes — le joueur tape une carte et rien ne
              // bouge. Mieux vaut renoncer plus tôt et laisser le renvoi
              // différé (REJOUABLES) faire son travail au retour du réseau.
              attempts: 3,
              deadlineMs: 10_000,
              onRetry: () => setRetrying(true),
            },
          );
          setRetrying(false);
          if (pending.current?.action === action) {
            pending.current = null;
            setPendingReplay(false);
          }
          setState(result.state);
          setRow((r) => (r ? { ...r, settings: result.settings } : r));
        } catch (e) {
          setRetrying(false);
          // Coupure franche : l'état sera rattrapé par la relecture; inutile
          // d'alarmer avec un message d'action refusée.
          if (isTransientError(e)) {
            if (estRejouable(action)) {
              pending.current = { action, position: positionAuDepart };
              setPendingReplay(true);
            }
            sync.refresh();
            return;
          }
          if (!opts.silent) setError(e instanceof Error ? e.message : "Action impossible.");
        } finally {
          setSending((n) => Math.max(0, n - 1));
        }
      });
      queue.current = task.catch(() => undefined);
      return task;
    },
    [id, sync],
  );

  // Retour du réseau : le coup mis de côté repart aussitôt. En `silent`, car
  // s'il est devenu caduc entre-temps (l'adversaire a joué, le tour a tourné),
  // le refus du serveur n'apprendrait rien au joueur — la relecture de l'état
  // lui montre déjà la table telle qu'elle est.
  useEffect(() => {
    if (!linkHealthy) return;
    const attendu = pending.current;
    if (!attendu) return;
    pending.current = null;
    setPendingReplay(false);
    // La position a bougé : l'intention n'est plus la même, on la laisse
    // tomber plutôt que de jouer à la place du joueur.
    if (!peutEtreRenvoye(attendu, positionRef.current)) return;
    void runAction(attendu.action, { silent: true });
  }, [linkHealthy, runAction]);

  /* ---------- Mise de jetons ---------- */
  // Mise remportée : les jetons volent vers le nom du joueur, qui tient lieu
  // de compte dans l'en-tête d'une table en ligne.
  const monNomRef = useRef<HTMLParagraphElement | null>(null);
  const [coinFlight, setCoinFlight] = useState<{
    from: { x: number; y: number };
    to: { x: number; y: number };
    amount: number;
  } | null>(null);

  const { bet, betReady, balance, proposeBet, acceptBet } = useBetNegotiation({
    matchId: id,
    row,
    state,
    me,
    runAction,
  });

  // L'hôte distribue la PREMIÈRE donne dès que la mise du champ est acceptée :
  // cet accord vaut lancement de la partie. Les tours suivants ne s'enchaînent
  // qu'une fois que les deux joueurs ont demandé à rejouer (`ready_next_round`).
  // La mise gagnée rejoint le compte : sans ce vol, un solde change dans un
  // panneau que personne n'a ouvert.
  const gainEnvole = useRef(false);
  useEffect(() => {
    if (gainEnvole.current) return;
    if (!state || state.phase !== "gameEnd" || state.champWinner !== me) return;
    if (bet?.status !== "accepted" || bet.amount <= 0) return;
    const cible = monNomRef.current?.getBoundingClientRect();
    if (!cible) return;
    gainEnvole.current = true;
    setCoinFlight({
      // Le vol doit se voir : sur l'accueil, l'avatar est lui aussi au milieu de
      // l'écran, et partir du centre ne laisserait aux jetons que quelques pixels
      // à parcourir. On les fait donc toujours monter depuis le bas.
      from: {
        x: window.innerWidth / 2,
        y: Math.max(window.innerHeight * 0.62, cible.bottom + 200),
      },
      to: { x: cible.left + cible.width / 2, y: cible.top + cible.height / 2 },
      amount: bet.amount,
    });
  }, [state, me, bet]);

  useEffect(() => {
    if (!isHost || !row?.guest_name || !betReady || state) return;
    void runAction({ type: "new_round" }, { silent: true });
  }, [isHost, row?.guest_name, state, betReady, runAction]);

  // Bilan des champs déjà joués contre cet adversaire. Chargé seulement à la
  // fin du champ, quand il devient une information utile — et une fois le
  // résultat de CETTE partie enregistré par le règlement des jetons.
  const [record, setRecord] = useState<HeadToHead | null>(null);
  const oppUserId = row ? (me === 0 ? row.guest_id : row.host_id) : null;
  useEffect(() => {
    if (!state || state.phase !== "gameEnd" || !oppUserId) return;
    const t = setTimeout(() => {
      headToHead(oppUserId)
        .then(setRecord)
        .catch(() => setRecord(null));
    }, 900);
    return () => clearTimeout(t);
  }, [state, oppUserId]);

  /**
   * Se retrouver après le champ.
   *
   * Les deux adversaires ont passé un moment ensemble et s'apprêtent chacun
   * de leur côté à quitter la table : c'est le moment de leur proposer de
   * s'ajouter en ami, plutôt que de les laisser se recroiser une prochaine
   * fois sans moyen de se retrouver. Rien ne s'affiche s'ils le sont déjà,
   * si une demande est déjà en cours, ou si l'un des deux a supprimé son
   * compte entre-temps.
   */
  const [friendState, setFriendState] = useState<FriendshipStatus | null>(null);
  useEffect(() => {
    if (!state || state.phase !== "gameEnd" || !oppUserId) return;
    let alive = true;
    friendshipStatus(oppUserId)
      .then((s) => alive && setFriendState(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [state, oppUserId]);

  const [addingFriend, setAddingFriend] = useState(false);
  const addOppAsFriend = () => {
    if (!oppUserId) return;
    setAddingFriend(true);
    requestFriend(oppUserId)
      .then(() => setFriendState("pending-sent"))
      .catch(() => {
        // Rien à afficher : au pire la proposition reste offerte, et un
        // second essai suffit — ce n'est pas une action assez cruciale pour
        // mériter un message d'erreur au sortir d'un champ.
      })
      .finally(() => setAddingFriend(false));
  };

  // Grades des deux joueurs. Celui de l'adversaire s'affiche dès l'entrée à la
  // table : c'est ce qui permet de savoir contre qui l'on mise. Les deux sont
  // relus en fin de champ, une fois le classement appliqué par le serveur.
  // Stickers et lots de messages achetés, pour la discussion.
  const [owned, setOwned] = useState<Set<string>>(new Set());
  useEffect(() => {
    listPurchases()
      .then((ids) => setOwned(new Set(ids)))
      .catch(() => {});
  }, []);

  const [myRank, setMyRank] = useState<number | null>(null);
  const [oppProfile, setOppProfile] = useState<PublicProfile | null>(null);
  const oppRank = oppProfile?.rating ?? null;
  const ended = state?.phase === "gameEnd";
  useEffect(() => {
    let alive = true;
    const read = () => {
      getMyProfile()
        .then((p) => alive && setMyRank(p?.rating ?? null))
        .catch(() => {});
      if (oppUserId) {
        getPublicProfile(oppUserId)
          .then((p) => alive && setOppProfile(p))
          .catch(() => {});
      }
    };
    // En fin de champ, le temps que le règlement ait déplacé les cotes.
    const t = setTimeout(read, ended ? 1000 : 0);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [oppUserId, ended]);

  // Ce que ce champ a rapporté ou coûté, tel que le serveur l'a inscrit.
  const myDelta = row ? ((isHost ? row.rating_delta_host : row.rating_delta_guest) ?? null) : null;

  // Accord d'enchaînement du tour suivant, remis à zéro à chaque donne.
  const nextReady = ((row?.settings as Record<string, unknown> | undefined)?.["nextRound"] ??
    null) as NextRoundReady | null;
  const iAmReady = !!nextReady?.[isHost ? "host" : "guest"];
  const oppIsReady = !!nextReady?.[isHost ? "guest" : "host"];

  // Détecte la carte que l'ADVERSAIRE vient de jouer (celle du joueur local
  // est animée directement au clic, voir playMyCard) pour la faire voyager de
  // sa main vers le tapis, qu'elle arrive par la réponse de notre propre appel
  // serveur ou par la souscription temps réel (les deux mettent `state` à jour
  // de la même façon).
  const prevTrickRef = useRef<GameState["trick"]>([]);
  const sawStateRef = useRef(false);
  useEffect(() => {
    if (!state) {
      prevTrickRef.current = [];
      sawStateRef.current = false;
      return;
    }
    const already = prevTrickRef.current.some((entry) => entry.player === opp);
    const oppEntry = state.trick.find((entry) => entry.player === opp);
    if (oppEntry && !already && sawStateRef.current) {
      const from = center(handRefs[opp].current);
      if (from) {
        setFlying({ card: oppEntry.card, from });
        setTimeout(() => setFlying(null), 380);
      }
      sfx.place();
    }
    prevTrickRef.current = state.trick;
    sawStateRef.current = true;
  }, [state, opp, handRefs]);

  // L'hôte arbitre : résolution du pli puis pioches.
  // Repli : si l'hôte ne répond pas, l'invité tranche pour ne pas bloquer la table.
  // Les deux appels sont validés par le serveur : si l'un des deux arrive
  // après coup (l'autre a déjà résolu), il est simplement rejeté (silencieux).
  //
  // Le résultat qui compte est toujours celui renvoyé par le serveur — voir
  // match-actions.ts. Mais l'aller-retour réseau est presque toujours plus
  // rapide que le temps de vol des cartes à l'écran : sans précaution, `state`
  // afficherait déjà le pli vide et les tas mis à jour avant même que
  // l'animation n'ait commencé à bouger quoi que ce soit. On calcule donc ICI,
  // sur les mêmes fonctions pures que celles rejouées côté serveur, le
  // résultat probable (vainqueur, transfert « atout 10 ») à seule fin
  // d'afficher le bon mouvement ; l'affichage reste figé sur l'état d'avant
  // résolution (`frozenTable`) le temps que l'animation joue, pendant que
  // `state` continue d'avancer normalement en arrière-plan.
  useEffect(() => {
    if (!state || state.phase !== "playing" || state.trick.length < 2) return;
    if (animating) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(
      setTimeout(
        () => {
          void runAction({ type: "resolve_trick" }, { silent: true });

          const preTrick = state;
          const predicted = resolveTrick(preTrick, { atout10: true });
          const winner = predicted.lastTrickWinner;
          if (winner === null) return;
          const loser: PlayerIndex = winner === 0 ? 1 : 0;
          const first = preTrick.trick[0]!;
          const second = preTrick.trick[1]!;
          const fromFirst = center(trickSlotRefs[first.player].current);
          const fromSecond = center(trickSlotRefs[second.player].current);
          const winnerPile = center(pileRefs[winner].current);
          if (!fromFirst || !fromSecond || !winnerPile) return;

          setAnimating(true);
          setFrozenTable({ trick: preTrick.trick, gains: preTrick.gains });

          const lastDelay = 140;
          setCollect([
            { id: 1, card: first.card, from: fromFirst, to: winnerPile, delay: 0 },
            { id: 2, card: second.card, from: fromSecond, to: winnerPile, delay: lastDelay },
          ]);
          timers.push(setTimeout(() => sfx.collect(), lastDelay + 120));
          // Le rire salue la bonne PRISE À L'ADVERSAIRE, pas la sienne : il ne
          // peut se juger qu'une fois le vainqueur du pli connu.
          if (stealsBonne(preTrick.trick, winner))
            timers.push(setTimeout(() => sfx.snicker(), lastDelay + 240));

          // Série de bonnes : au premier pli du tour (aucun tas encore
          // entamé), on repart de zéro — y compris après un Pont rejoué.
          if (preTrick.gains[0].length === 0 && preTrick.gains[1].length === 0) {
            bonneStreak.current = { player: null, count: 0 };
          }
          if (preTrick.trick.some((e) => isBonne(e.card))) {
            const precedent = bonneStreak.current;
            const compte = precedent.player === winner ? precedent.count + 1 : 1;
            bonneStreak.current = { player: winner, count: compte };
            // Trois, quatre, cinq bonnes ou plus d'affilée : un rire de plus
            // en plus franc, tant que l'adversaire n'en reprend aucune.
            const rireDeSerie =
              compte === 3 ? sfx.streakLaugh : compte === 4 ? sfx.streakLaugh4 : sfx.streakLaugh5;
            if (compte >= 3) timers.push(setTimeout(() => rireDeSerie(), lastDelay + 420));
          }

          const sweeps = trickCapturesPile(preTrick, { atout10: true })
            ? preTrick.gains[loser].length
            : 0;
          const loserPile = center(pileRefs[loser].current);

          timers.push(
            setTimeout(() => {
              setCollect([]);
              if (sweeps > 0 && loserPile) {
                const layers = Math.min(6, sweeps);
                sfx.sweep();
                sfx.sweepLaugh();
                setSweepFlights(
                  Array.from({ length: layers }, (_, i) => ({
                    id: i,
                    from: loserPile,
                    to: winnerPile,
                    delay: i * 90,
                  })),
                );
                timers.push(
                  setTimeout(
                    () => {
                      setSweepFlights([]);
                      setFrozenTable(null);
                      setAnimating(false);
                    },
                    layers * 90 + 620,
                  ),
                );
                return;
              }
              setFrozenTable(null);
              setAnimating(false);
            }, lastDelay + 560),
          );
        },
        isHost ? TRICK_DELAY : TRICK_DELAY + 4000,
      ),
    );
    return () => timers.forEach(clearTimeout);
  }, [isHost, state, animating, runAction, pileRefs, trickSlotRefs]);

  useEffect(() => {
    if (animating) return;
    if (!state || state.phase !== "playing") return;
    if (state.drawPending.length === 0 || state.stock.length === 0) return;
    const player = state.drawPending[0]!;
    // Le vainqueur peut annoncer avant de piocher (5 cartes en main)
    if (state.canAnnounce === player && availableMelds(state, player).length > 0) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(
      setTimeout(
        () => {
          const from = center(stockRef.current);
          const to = center(handRefs[player].current);
          if (from && to) {
            setDrawFlights([{ id: Date.now(), player, from, to, delay: 0 }]);
            timers.push(
              setTimeout(() => {
                setDrawFlights([]);
                void runAction({ type: "draw_next" }, { silent: true }).then(() => sfx.draw());
              }, 580),
            );
            return;
          }
          void runAction({ type: "draw_next" }, { silent: true }).then(() => sfx.draw());
        },
        isHost ? 700 : 4700,
      ),
    );
    return () => timers.forEach(clearTimeout);
  }, [isHost, state, animating, runAction, handRefs, stockRef]);

  // Acclamations / rire moqueur en fin de tour
  const phaseKey = state ? `${state.phase}-${state.roundsWon[0]}-${state.roundsWon[1]}` : "";
  useEffect(() => {
    if (!state) return;
    if (state.phase !== "roundEnd" && state.phase !== "gameEnd") return;
    const won = state.phase === "gameEnd" ? state.champWinner === me : state.roundWinner === me;
    const lost = state.phase === "gameEnd" ? state.champWinner === opp : state.roundWinner === opp;
    const t = setTimeout(() => {
      if (won) sfx.cheer();
      else if (lost) sfx.taunt();
    }, 350);
    // Treize bonnes ou plus en un tour : un rire à part, qui suit l'acclamation
    // ou la moquerie plutôt que de s'y mélanger.
    const t2 = state.instantWin ? setTimeout(() => sfx.landslideLaugh(), 1000) : null;
    return () => {
      clearTimeout(t);
      if (t2) clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseKey, me, opp]);

  // Rire léger lorsque l'adversaire annonce un compte ; un rire différent la
  // première fois, quand cette annonce fixe aussi la couleur d'atout.
  const oppMeldCount = state ? state.melds[opp].length : 0;
  const prevOppMelds = useRef(0);
  const prevTrump = useRef<Suit | null>(null);
  useEffect(() => {
    if (oppMeldCount > prevOppMelds.current) {
      if (prevTrump.current === null && state?.trump) sfx.trumpLaugh();
      else sfx.chuckle();
    }
    prevOppMelds.current = oppMeldCount;
    prevTrump.current = state?.trump ?? null;
  }, [oppMeldCount, state?.trump]);

  // --- Chronomètre du tour et surveillance de la connexion ---
  // "quit" se déclare contre soi-même ; "timeout"/"disconnect" contre
  // l'adversaire observé — le serveur en déduit le perdant et vérifie le
  // délai avant d'accepter (voir match-actions.ts).
  const declareForfeit = useCallback(
    (reason: "timeout" | "disconnect" | "quit") => {
      void runAction({ type: "forfeit", reason }, { silent: reason !== "quit" });
    },
    [runAction],
  );

  // Annonce au gestionnaire global d'invitations qu'une partie est en cours :
  // accepter une invitation ailleurs devra d'abord déclarer forfait ici, avec
  // l'avertissement qui va avec.
  useEffect(() => {
    if (!state || state.phase === "gameEnd") return;
    return registerGameSession("online", () => declareForfeit("quit"));
  }, [state, declareForfeit]);

  // Fin de tour ou de partie : une invitation mise de côté avec « Plus tard »
  // peut réapparaître.
  useEffect(() => {
    if (state?.phase === "roundEnd" || state?.phase === "gameEnd") announceFreed();
  }, [state?.phase]);

  // Battage et distribution. Chaque joueur regarde la sienne, et le compte à
  // rebours ne court pour personne pendant ce temps : le délai s'ajoute
  // toujours au temps de réflexion, il n'en retire jamais. C'est l'observateur
  // qui déclare le dépassement de son adversaire, donc c'est bien lui qui doit
  // suspendre son propre décompte.
  const dealing = useDealCeremony(state, !!state);

  const [oppOnline, setOppOnline] = useState(true);
  useEffect(() => {
    if (!verifiedSeat) return;
    return trackPresence(id, verifiedSeat, setOppOnline);
  }, [id, verifiedSeat]);

  /**
   * La partie attend le réseau, d'un côté ou de l'autre.
   *
   * C'est le seul état où le temps de réflexion cesse de courir. Les deux
   * causes se valent pour le joueur qui regarde une table figée : que ce soit
   * sa propre liaison ou celle de l'adversaire qui ait lâché, personne ne
   * réfléchit pendant ce temps-là, donc personne ne doit le payer.
   */
  const waitingOnLink = !linkHealthy || !oppOnline;

  // Le compte à rebours redémarre à chaque changement de tour
  const oppMustAct =
    !dealing &&
    !!state &&
    state.phase === "playing" &&
    state.turn === opp &&
    state.trick.length < 2 &&
    state.drawPending.length === 0;
  const turnKey = state
    ? `${state.turn}-${state.trick.length}-${state.drawPending.length}-${state.phase}-${String(oppMustAct)}`
    : "";
  // Le décompte de réflexion est SUSPENDU dès que la liaison de l'un ou
  // l'autre est en difficulté : le coup de l'adversaire est peut-être déjà
  // parti et cherche son chemin.
  const turnLeft = useTurnCountdown(oppMustAct, turnKey, TURN_LIMIT, waitingOnLink);

  // Barre de temps du joueur local
  const myMustAct =
    !dealing &&
    !!state &&
    state.phase === "playing" &&
    state.turn === me &&
    state.trick.length < 2 &&
    state.drawPending.length === 0;

  // Seul l'observateur déclare : si l'adversaire dépasse son temps de
  // RÉFLEXION, il perd. Jamais pendant une attente réseau : le décompte y est
  // gelé, mais on refuse en plus de déclarer quoi que ce soit sur la foi d'un
  // lien qu'on sait douteux.
  useEffect(() => {
    if (!state || state.phase !== "playing" || !oppMustAct) return;
    if (turnLeft > 0 || waitingOnLink) return;
    declareForfeit("timeout");
  }, [turnLeft, state, opp, oppMustAct, declareForfeit, waitingOnLink]);

  /**
   * Le délai d'attente de la CONNEXION, décompté à part.
   *
   * Il court dès que la liaison est en difficulté, d'un côté ou de l'autre, et
   * pendant tout ce temps la réflexion est suspendue. À son terme, l'abandon
   * n'est déclaré que si c'est bien l'adversaire qui manque et que notre
   * propre lien est sain : si c'est le nôtre qui est tombé, nous ne sommes en
   * état d'accuser personne — on continue d'attendre et de réessayer, pendant
   * que l'adversaire décompte de son côté le même délai contre nous.
   */
  const [linkWaitLeft, setLinkWaitLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!waitingOnLink || !state || state.phase !== "playing") {
      setLinkWaitLeft(null);
      return;
    }
    const start = Date.now();
    setLinkWaitLeft(LINK_WAIT_LIMIT);
    const t = setInterval(() => {
      const left = Math.max(0, LINK_WAIT_LIMIT - Math.round((Date.now() - start) / 1000));
      setLinkWaitLeft(left);
      if (left === 0 && linkHealthy && !oppOnline) declareForfeit("disconnect");
    }, 1000);
    return () => clearInterval(t);
  }, [waitingOnLink, linkHealthy, oppOnline, state, declareForfeit]);

  const myMelds = useMemo(() => (state ? availableMelds(state, me) : []), [state, me]);
  const legalIds = useMemo(() => {
    if (!state) return new Set<string>();
    const ok =
      state.turn === me &&
      state.phase === "playing" &&
      state.trick.length < 2 &&
      state.drawPending.length === 0;
    return new Set(ok ? legalCards(state, me).map((c) => c.id) : []);
  }, [state, me]);

  const meldDecisionPending =
    !!state &&
    !animating &&
    state.phase === "playing" &&
    state.canAnnounce === me &&
    state.drawPending[0] === me &&
    state.hands[me].length === 5 &&
    myMelds.length > 0 &&
    state.stock.length > 0;

  // Affichage figé du pli et des tas pendant le ramassage/transfert animé
  // (voir la déclaration de `frozenTable` plus haut) : le reste de l'état
  // (mains, tour, pioche…) continue de refléter la vérité serveur normalement.
  const displayTrick = frozenTable?.trick ?? state?.trick ?? [];
  const displayGains = frozenTable?.gains ?? state?.gains ?? ([[], []] as [Card[], Card[]]);

  const playMyCard = (card: Card, el: HTMLElement) => {
    if (!state || meldDecisionPending) return;
    const from = center(el);
    if (from) {
      setFlying({ card, from });
      setTimeout(() => setFlying(null), 380);
    }
    sfx.place();
    void runAction({ type: "play_card", cardId: card.id });
  };

  // Un compte s'annonce en bloc : tous ceux que la main permet, d'un seul clic
  // — c'est toujours l'intérêt du joueur, chacun valant des points. L'atout
  // n'est à désigner que s'il est réellement ambigu : plusieurs comptes
  // annonçables alors qu'il n'est pas encore fixé.
  const needsTrumpChoice = !!state && state.trump === null && myMelds.length > 1;
  const meldSummary = myMelds
    .map((m) => `${SUIT_SYMBOL[m.suit]} ${m.type === "triple" ? "trio" : "simple"}`)
    .join(" + ");

  const doAnnounce = (trumpChoice: Suit | null) => {
    if (!state) return;
    // L'atout se fixe sur cette annonce précisément quand il n'était pas
    // encore choisi : un rire différent salue ce moment-là.
    if (state.trump === null) sfx.trumpLaugh();
    else sfx.chuckle();
    void runAction({
      type: "announce",
      suits: myMelds.map((m) => m.suit),
      trump: trumpChoice,
    });
    setChoosingTrump(false);
  };

  const announceMelds = () => {
    if (!state) return;
    if (needsTrumpChoice) {
      setChoosingTrump(true);
      return;
    }
    doAnnounce(state.trump === null ? (myMelds[0]?.suit ?? null) : null);
  };

  const skipAnnounce = () => {
    setChoosingTrump(false);
    void runAction({ type: "skip_announce" });
  };

  const readyNextRound = () => {
    void runAction({ type: "ready_next_round" });
  };

  if (error) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm text-destructive">{error}</p>
        {errorRetryable && (
          <>
            <p className="text-xs text-muted-foreground">
              Nouvelle tentative en cours… La partie vous attend, rien n'est perdu.
            </p>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setErrorRetryable(false);
                setReloadKey((n) => n + 1);
              }}
              className="gold-tag rounded-full border border-gold/50 px-5 py-2 text-xs font-semibold text-gold"
            >
              Réessayer maintenant
            </button>
          </>
        )}
        <Link to="/online" className="text-xs text-gold underline">
          Retour au salon
        </Link>
      </main>
    );
  }

  if (!row || !state || !verifiedSeat) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="gold-text text-3xl">Table en préparation…</h1>
        <p className="text-sm text-muted-foreground">
          {!row?.guest_name
            ? "En attente du second joueur."
            : betReady
              ? "Distribution des cartes en cours."
              : "Accordez-vous sur la mise pour lancer le tour."}
        </p>
        <Link to="/online" className="text-xs text-gold underline">
          Retour au salon
        </Link>
        {row?.guest_name && verifiedSeat && !betReady && (
          <BetPanel
            bet={bet}
            mySeat={verifiedSeat}
            oppName={me === 0 ? (row.guest_name ?? "Invité") : row.host_name}
            balance={balance}
            onPropose={proposeBet}
            onAccept={acceptBet}
            onQuit={() => navigate({ to: "/online" })}
          />
        )}
      </main>
    );
  }

  const myName = me === 0 ? row.host_name : (row.guest_name ?? "Invité");
  const oppName = me === 0 ? (row.guest_name ?? "Invité") : row.host_name;
  const myBonnes = displayGains[me].filter(isBonne).length;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-4 px-3 py-4 sm:px-6 sm:py-6">
      <header className="panel grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-3 py-2 sm:px-5">
        <p ref={monNomRef} className="truncate text-left text-xs font-semibold text-foreground">
          {myName}
        </p>
        <div className="min-w-16 text-center">
          <h1 className="gold-text font-black text-lg leading-none sm:text-2xl">Aztèque</h1>
          <p className="mt-1 whitespace-nowrap text-xs font-semibold text-foreground">
            {state.roundsWon[me]} <span className="text-muted-foreground">—</span>{" "}
            {state.roundsWon[opp]}
          </p>
          <p className="mt-0.5 text-[0.6rem] uppercase tracking-widest text-gold">
            Code {row.code}
          </p>
          {bet?.status === "accepted" && (
            <p className="mt-0.5 whitespace-nowrap text-[0.6rem] font-semibold text-gold">
              🪙 {bet.amount}
            </p>
          )}
        </div>
        <div className="flex min-w-0 items-center justify-end gap-2">
          <div className="min-w-0 text-right">
            <p className="truncate text-xs font-semibold text-foreground">{oppName}</p>
            {oppRank !== null && (
              <RankBadge rating={oppRank} compact className="mt-0.5 text-[0.65rem]" />
            )}
          </div>
          <PlayerAvatar className="h-8 w-8" profile={oppProfile} />
        </div>
      </header>

      {/* Main adverse */}
      <section>
        <div ref={handRefs[opp]} style={{ opacity: dealing ? 0 : 1 }}>
          <HandRow
            cards={state.hands[opp]}
            exposedIds={state.exposed[opp]}
            faceDown={(c) => !state.exposed[opp].includes(c.id)}
            interactive={false}
            keepSlots={state.stock.length > 0}
          />
        </div>
        <TurnBar total={TURN_LIMIT} active={oppMustAct} resetKey={turnKey} paused={waitingOnLink} />
      </section>

      {/* Tapis */}
      <section
        ref={tableRef}
        className="panel relative flex min-h-44 max-h-[46dvh] flex-1 flex-col items-center justify-center gap-3 p-4"
      >
        <div className="sunstone" aria-hidden="true" />
        <div className="absolute left-3 top-3" ref={pileRefs[opp]}>
          <CapturedPile cards={displayGains[opp]} owner="opponent" />
        </div>
        <div className="absolute bottom-3 right-3" ref={pileRefs[me]}>
          <CapturedPile
            cards={displayGains[me]}
            owner="player"
            onOpen={() => setShowMyGains(true)}
          />
        </div>

        {/* Aligné sur les mêmes conditions que la barre de temps, pour que
            l'annonce du tour et le compte à rebours apparaissent ensemble. */}
        {state.trick.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {state.phase !== "playing"
              ? "Tour terminé."
              : myMustAct
                ? "À vous de jouer."
                : oppMustAct
                  ? `${oppName} réfléchit…`
                  : "\u00a0"}
          </p>
        )}

        <div className="grid grid-cols-[4.5rem_3.75rem_4.5rem] items-center gap-2 sm:gap-4">
          <div ref={trickSlotRefs[opp]}>
            <TrickPosition trick={displayTrick} player={opp} me={me} hidden={collect.length > 0} />
          </div>
          <div className="flex min-h-20 flex-col items-center justify-center gap-1" ref={stockRef}>
            {state.stock.length > 0 ? (
              <>
                <StockPile count={state.stock.length} />
                <span className="gold-tag rounded-full border border-gold/40 bg-felt-deep/90 px-2 py-0.5 text-[0.62rem] font-semibold text-gold">
                  {state.stock.length}
                </span>
              </>
            ) : (
              <div className="flex h-14 w-10 items-center justify-center rounded-[3px] border border-dashed border-gold/30 text-[0.6rem] text-muted-foreground">
                Vide
              </div>
            )}
          </div>
          <div ref={trickSlotRefs[me]}>
            <TrickPosition trick={displayTrick} player={me} me={me} hidden={collect.length > 0} />
          </div>
        </div>

        {(sync.offline || sync.stale || retrying || sending > 0 || pendingReplay) && (
          <span className="gold-tag absolute left-1/2 top-2 -translate-x-1/2 rounded-full border border-gold/50 bg-felt-deep/95 px-2 py-0.5 text-[0.58rem] font-semibold text-gold">
            {sync.offline
              ? "Hors ligne · reprise automatique"
              : pendingReplay
                ? "Coup en attente · il partira au retour du réseau"
                : retrying || sync.stale
                  ? "Connexion lente · nouvelle tentative…"
                  : "Envoi…"}
          </span>
        )}

        {/* Attente de la connexion : le temps de réflexion est gelé pendant ce
            décompte, et le joueur doit voir que ce n'est PAS son tour qui
            s'épuise. */}
        {linkWaitLeft !== null && (
          <span className="absolute left-1/2 top-8 -translate-x-1/2 rounded-full border border-destructive/60 bg-felt-deep/95 px-2 py-0.5 text-[0.58rem] font-semibold text-destructive">
            {oppOnline ? "Connexion perdue" : `${oppName} est hors ligne`} · attente {linkWaitLeft}s
            · réflexion en pause
          </span>
        )}

        {state.trump && (
          <span className="gold-tag absolute right-2 top-2 rounded border border-gold/45 bg-felt-deep/90 px-2 py-1 text-[0.58rem] font-semibold text-gold">
            Atout · {SUIT_SYMBOL[state.trump]} {SUIT_NAME[state.trump]}
          </span>
        )}

        {/* Annonce de comptes : un seul clic dans le cas courant, le choix de
            l'atout n'étant demandé que lorsqu'il est réellement ambigu. */}
        {meldDecisionPending && (
          <div className="absolute bottom-2 left-2 z-30 max-w-[calc(100%_-_7rem)] rounded border border-gold/35 bg-felt-deep/95 p-2">
            {choosingTrump ? (
              <>
                <p className="mb-1 text-[0.62rem] font-semibold leading-tight text-gold">
                  Quel compte fixe l'atout ?
                </p>
                <div className="flex flex-wrap gap-1">
                  {myMelds.map((m) => (
                    <button
                      key={m.suit}
                      onClick={() => doAnnounce(m.suit)}
                      className="rounded bg-[image:var(--gradient-gold)] px-2 py-1 text-[0.6rem] font-semibold leading-none text-primary-foreground"
                    >
                      {SUIT_SYMBOL[m.suit]} {SUIT_NAME[m.suit]}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p className="mb-1 text-[0.62rem] font-semibold leading-tight text-gold">
                  Annoncer {meldSummary} ?
                </p>
                <div className="flex flex-wrap gap-1">
                  <button
                    onClick={announceMelds}
                    className="rounded bg-[image:var(--gradient-gold)] px-2 py-1 text-[0.6rem] font-semibold leading-none text-primary-foreground"
                  >
                    Annoncer
                  </button>
                  <button
                    onClick={skipAnnounce}
                    className="rounded border border-border px-2 py-1 text-[0.6rem] leading-none text-muted-foreground"
                  >
                    Passer
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {/* Votre main */}
      <section className="flex flex-col gap-2">
        <TurnBar total={TURN_LIMIT} active={myMustAct} resetKey={turnKey} paused={waitingOnLink} />
        {/* Pendant la donne, la main garde sa place — ses cases servent de
            cibles aux cartes qui arrivent — mais reste invisible : on ne
            distribue pas des cartes déjà posées. */}
        <div ref={handRefs[me]} style={{ opacity: dealing ? 0 : 1 }}>
          <HandRow
            cards={state.hands[me]}
            exposedIds={state.exposed[me]}
            keepSlots={state.stock.length > 0}
            isDisabled={(c) =>
              meldDecisionPending ||
              animating ||
              state.turn !== me ||
              state.phase !== "playing" ||
              state.trick.length >= 2 ||
              state.drawPending.length > 0 ||
              !legalIds.has(c.id)
            }
            onPlay={(card, el) => playMyCard(card, el)}
          />
        </div>
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setShowMyBonnes(true)}
            className="gold-tag rounded-full border border-gold/40 bg-felt-deep/60 px-3 py-1 text-[0.68rem] font-semibold text-gold"
          >
            Bonnes · {myBonnes}
          </button>
          {state.phase !== "gameEnd" && (
            <button
              type="button"
              onClick={() => setConfirmQuit(true)}
              className="rounded-full border border-destructive/50 bg-felt-deep/95 px-3 py-1 text-[0.68rem] font-semibold text-destructive"
            >
              Quitter la table
            </button>
          )}
        </div>
      </section>

      {(state.phase === "roundEnd" || state.phase === "gameEnd") && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-6">
          <div className="panel w-full max-w-md p-6 text-center">
            <h2 className="gold-text text-3xl">
              {state.phase === "gameEnd"
                ? state.champWinner === me
                  ? "Champ remporté !"
                  : "Champ perdu"
                : state.roundWinner === null
                  ? "Pont !"
                  : state.roundWinner === me
                    ? "Tour gagné"
                    : "Tour perdu"}
            </h2>
            {state.forfeit && (
              <p className="mt-2 text-xs text-gold">
                {state.forfeit.loser === me
                  ? state.forfeit.reason === "timeout"
                    ? "Temps écoulé : vous avez tardé à jouer."
                    : state.forfeit.reason === "quit"
                      ? "Vous avez quitté la table."
                      : "Connexion perdue trop longtemps de votre côté."
                  : state.forfeit.reason === "timeout"
                    ? `${oppName} a dépassé le temps de jeu.`
                    : state.forfeit.reason === "quit"
                      ? `${oppName} a quitté la table.`
                      : `${oppName} a perdu la connexion.`}
              </p>
            )}
            {state.pont && state.phase === "roundEnd" && (
              <p className="mt-1 text-xs text-accent">
                Égalité parfaite : aucun tour marqué, on rejoue le tour.
              </p>
            )}
            {state.roundScore && (
              <div className="mt-5 grid grid-cols-2 gap-3 text-left text-sm">
                <Recap title={myName} s={state.roundScore[me]} />
                <Recap title={oppName} s={state.roundScore[opp]} />
              </div>
            )}
            <p className="mt-4 text-xs text-muted-foreground">
              Tours gagnés — {myName} {state.roundsWon[me]} · {oppName} {state.roundsWon[opp]}
            </p>
            {state.phase === "gameEnd" && record && (
              <p className="mt-1 text-xs text-muted-foreground">
                Face à {oppName} : {record.wins} victoire{record.wins > 1 ? "s" : ""} ·{" "}
                {record.losses} défaite{record.losses > 1 ? "s" : ""}
              </p>
            )}
            {state.phase === "gameEnd" && myRank !== null && myDelta !== null && (
              <RankOutcome rating={myRank} delta={myDelta} />
            )}
            {bet?.status === "accepted" && (
              <p className="mt-1 text-xs text-gold">
                {state.phase === "gameEnd"
                  ? state.champWinner === me
                    ? `🪙 +${bet.amount} jetons remportés`
                    : `🪙 −${bet.amount} jetons perdus`
                  : `Mise du champ : 🪙 ${bet.amount} jetons — réglée à la fin de la partie.`}
              </p>
            )}

            {state.phase === "gameEnd" && friendState === "none" && (
              <div className="mt-4 rounded-lg border border-gold/30 bg-gold/5 px-4 py-3 text-left">
                <p className="text-xs text-foreground">
                  Envie de retrouver {oppName} plus facilement la prochaine fois ?
                </p>
                <button
                  type="button"
                  disabled={addingFriend}
                  onClick={addOppAsFriend}
                  className="mt-2 w-full rounded-full bg-[image:var(--gradient-gold)] px-4 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                >
                  Ajouter {oppName} en ami
                </button>
              </div>
            )}
            {state.phase === "gameEnd" && friendState === "pending-sent" && (
              <p className="mt-4 text-xs text-gold">Demande d'ami envoyée à {oppName}.</p>
            )}

            {state.phase === "roundEnd" ? (
              iAmReady ? (
                <p className="mt-5 text-xs text-muted-foreground">
                  En attente de {oppName} pour {state.pont ? "rejouer le tour" : "le tour suivant"}…
                </p>
              ) : (
                <>
                  {oppIsReady && (
                    <p className="mt-5 text-xs text-gold">
                      {oppName} est prêt à {state.pont ? "rejouer le tour" : "enchaîner"}.
                    </p>
                  )}
                  <button
                    onClick={readyNextRound}
                    className={
                      "rounded-full bg-[image:var(--gradient-gold)] px-6 py-2.5 font-display text-sm font-semibold text-primary-foreground " +
                      (oppIsReady ? "mt-3" : "mt-5")
                    }
                  >
                    {state.pont ? "Rejouer le tour" : "Jouer le tour suivant"}
                  </button>
                </>
              )
            ) : (
              <Link
                to="/online"
                className="mt-5 inline-block rounded-full bg-[image:var(--gradient-gold)] px-6 py-2.5 font-display text-sm font-semibold text-primary-foreground"
              >
                Retour au salon
              </Link>
            )}
            {/* En fin de tour le champ n'est pas joué : partir revient à
                abandonner, on passe donc par la confirmation qui déclare le
                forfait. En fin de champ il n'y a plus rien à abandonner. */}
            {state.phase === "roundEnd" ? (
              <button
                type="button"
                onClick={() => setConfirmQuit(true)}
                className="mt-3 block w-full rounded-full border border-destructive/50 px-6 py-2.5 font-display text-sm font-semibold text-destructive"
              >
                Quitter
              </button>
            ) : (
              <Link
                to="/online"
                className="mt-3 block w-full rounded-full border border-destructive/50 px-6 py-2.5 font-display text-sm font-semibold text-destructive"
              >
                Quitter
              </Link>
            )}
          </div>
        </div>
      )}

      {confirmQuit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
          <div className="panel w-full max-w-sm p-6 text-center">
            <h2 className="gold-text text-2xl">Quitter la table ?</h2>
            <p className="mt-3 text-xs text-muted-foreground">
              Si la partie est en cours, quitter la table vous déclare perdant du champ.
            </p>
            <div className="mt-5 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setConfirmQuit(false)}
                className="rounded-full border border-border px-5 py-2 text-sm text-muted-foreground"
              >
                Rester
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmQuit(false);
                  declareForfeit("quit");
                  navigate({ to: "/online" });
                }}
                className="rounded-full bg-destructive-solid px-5 py-2 text-sm font-semibold text-destructive-foreground"
              >
                Quitter
              </button>
            </div>
          </div>
        </div>
      )}

      {showMyGains && <GainsPanel cards={state.gains[me]} onClose={() => setShowMyGains(false)} />}
      {showMyBonnes && (
        <GainsPanel
          cards={state.gains[me].filter(isBonne)}
          title="Vos bonnes"
          subtitle={`${myBonnes} bonnes remportées — treize bonnes gagnent le tour`}
          onClose={() => setShowMyBonnes(false)}
        />
      )}

      {/* Carte en vol vers le tapis (la mienne au clic, celle de l'adversaire
          détectée dès qu'elle apparaît dans le pli) */}
      {flying && (
        <FlyingCard
          card={flying.card}
          from={flying.from}
          to={(() => {
            const r = tableRef.current?.getBoundingClientRect();
            return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : flying.from;
          })()}
        />
      )}

      {/* Cartes piochées */}
      {drawFlights.map((flight) => (
        <DrawCard key={flight.id} {...flight} />
      ))}

      {/* Ramassage du pli vers le tas du vainqueur */}
      {collect.map((flight) => (
        <CollectCard key={flight.id} {...flight} />
      ))}

      {coinFlight && (
        <CoinBurst
          from={coinFlight.from}
          to={coinFlight.to}
          amount={coinFlight.amount}
          onDone={() => setCoinFlight(null)}
        />
      )}

      {/* Atout 10 : transfert du tas adverse */}
      {sweepFlights.map((flight) => (
        <SweepCard key={flight.id} {...flight} />
      ))}

      <MatchChat matchId={id} seat={verifiedSeat} myName={myName} owned={owned} />

      {dealing && (
        <DealCeremony stockRef={stockRef} myHandRef={handRefs[me]} oppHandRef={handRefs[opp]} />
      )}
    </main>
  );
}
