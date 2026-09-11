import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DIFFICULTY_LABEL,
  SUIT_NAME,
  SUIT_SYMBOL,
  aiAnnounceAt,
  aiChooseCardAt,
  aiWantsRedeal,
  announce,
  anticipate,
  availableMelds,
  drawNext,
  hasMainBlanche,
  isBonne,
  stealsBonne,
  legalCards,
  meldPoints,
  newRound,
  playCard,
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
import { RulesPanel } from "@/components/azteque/RulesPanel";
import { InstallPrompt } from "@/components/azteque/install-prompt";
import { cn } from "@/lib/utils";
import { sfx, setSoundContext, setSoundEnabled } from "@/lib/azteque/sfx";
import { amIAdmin, touchLastSeen } from "@/lib/azteque/admin";
import {
  awardAiWin,
  claimDailyBonus,
  claimLocalTokens,
  getMyProfile,
  syncGooglePhoto,
  syncGoogleIdentity,
  type Profile,
} from "@/lib/azteque/account";
import {
  DAILY_BONUS,
  claimLocalDailyBonus,
  getTokens as getLocalTokens,
  localBonusDay,
  todayKey,
} from "@/lib/azteque/tokens";
import { useTurnCountdown } from "@/hooks/useTurnTimer";
import { announceFreed, registerGameSession } from "@/lib/azteque/game-session";
import {
  CoinBurst,
  CollectCard,
  DUREE_PIOCHE,
  DrawCard,
  angleOf,
  FlyingCard,
  SweepCard,
  useCardFlight,
} from "@/components/azteque/animations";
import { DealCeremony, useDealCeremony } from "@/components/azteque/dealing";
import { useTapisSurface } from "@/lib/azteque/tapis";
import {
  AiProfilePanel,
  DEFAULT_SETTINGS,
  DailyBonusPanel,
  MeldHistoryPanel,
  PlayerProfilePanel,
  ProfileButton,
  Recap,
  TOKEN_REWARDS,
  type Settings,
} from "@/components/azteque/panels";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Aztèque — Jeu de cartes traditionnel ouest-africain" },
      {
        name: "description",
        content:
          "Jouez à Aztèque en ligne : plis, bonnes, comptes et atout. Règlement officiel v1.0, partie en 3 tours contre l'ordinateur.",
      },
      { property: "og:title", content: "Aztèque — Jeu de cartes traditionnel" },
      {
        property: "og:description",
        content: "Conquérez les plis, annoncez vos comptes, créez l'atout et remportez le champ.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Azteque,
});

/** Le centre d'un élément à l'écran, ou `null` s'il n'est pas encore posé. */
const center = (el: HTMLElement | null | undefined) => {
  const r = el?.getBoundingClientRect();
  return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
};

const TURN_LIMIT = 30;

function Azteque() {
  const [state, setState] = useState<GameState>(() => newRound(1));
  const [showRules, setShowRules] = useState(false);
  const [showPlayerProfile, setShowPlayerProfile] = useState(false);
  const [showAiProfile, setShowAiProfile] = useState(false);
  const [showMyGains, setShowMyGains] = useState(false);
  const [showMyBonnes, setShowMyBonnes] = useState(false);
  const [tokens, setTokens] = useState(0);
  const tokenAwarded = useRef(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [playerName, setPlayerName] = useState("Joueur");
  const [profileReady, setProfileReady] = useState(false);
  // Un joueur connecté tient son pseudo et son solde de son compte : ils le
  // suivent d'un appareil à l'autre, et c'est le serveur qui les met à jour.
  // Hors connexion, le navigateur continue de faire foi.
  const [account, setAccount] = useState<Profile | null>(null);
  // Le lien vers la console n'est qu'une commodité : le serveur refuse de toute
  // façon les opérations à qui n'administre pas.
  const [isAdmin, setIsAdmin] = useState(false);
  const accountBound = account !== null;
  const [started, setStarted] = useState(false);
  const [roundKey, setRoundKey] = useState(0);
  const [redealDone, setRedealDone] = useState(false);
  const [meldHistory, setMeldHistory] = useState<
    { key: string; round: number; player: PlayerIndex; label: string; points: number }[]
  >([]);
  const [showHistory, setShowHistory] = useState(false);

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

  const tableRef = useRef<HTMLDivElement | null>(null);
  // Cibles du vol de jetons : l'avatar du joueur, sur l'accueil comme en jeu.
  const accueilAvatarRef = useRef<HTMLButtonElement | null>(null);
  const jeuAvatarRef = useRef<HTMLButtonElement | null>(null);
  const [coinFlight, setCoinFlight] = useState<{
    from: { x: number; y: number };
    to: { x: number; y: number };
    amount: number;
  } | null>(null);
  const stockRef = useRef<HTMLDivElement | null>(null);
  const opponentHandRef = useRef<HTMLDivElement | null>(null);
  const playerHandRef = useRef<HTMLDivElement | null>(null);
  const trickSlotRefs = [
    useRef<HTMLDivElement | null>(null),
    useRef<HTMLDivElement | null>(null),
  ] as const;
  // Les cartes du pli elles-mêmes : le vol vise leur place au pixel près, le
  // bloc qui les entoure portant aussi leur étiquette.
  const trickCardRefs = [
    useRef<HTMLElement | null>(null),
    useRef<HTMLElement | null>(null),
  ] as const;
  const pileRefs = [
    useRef<HTMLDivElement | null>(null),
    useRef<HTMLDivElement | null>(null),
  ] as const;

  // La carte qu'on voit partir vers le tapis — la sienne au clic, celle de
  // l'ordinateur quand il joue.
  const { flight, etat, fly } = useCardFlight(state.trick);

  // Où elle doit se poser : la place de CELUI qui l'a jouée. Le relais avec la
  // carte qui s'y découvre est un échange net, sans fondu — il ne passe
  // inaperçu que si les deux occupent exactement le même point.
  const volArrivee = (() => {
    if (!flight) return null;
    const joueur = state.trick.find((e) => e.card.id === flight.card.id)?.player;
    const place = joueur === undefined ? null : center(trickCardRefs[joueur].current);
    return place ?? center(tableRef.current) ?? flight.from;
  })();
  const aiRedealChecked = useRef(-1);
  const askedForName = useRef(false);
  // Série de bonnes prises sans que l'adversaire n'en reprenne une : remise à
  // zéro au premier pli d'un tour (tas des deux joueurs encore vides).
  const bonneStreak = useRef<{ player: PlayerIndex | null; count: number }>({
    player: null,
    count: 0,
  });

  // Cet écran est exclusivement le jeu contre l'IA : ses sons ne doivent
  // jamais puiser dans les réglages du profil « en ligne ». Par défaut on
  // écoute le profil « joueur » — les sons neutres de la table (battage,
  // distribution, jetons) n'appartiennent à aucun des deux camps — mais
  // chaque action d'un camp bascule explicitement vers son propre profil
  // avant de jouer son son (voir `jouerPour` plus bas).
  useEffect(() => {
    setSoundContext("joueur");
  }, []);

  /**
   * Un même geste — poser une carte, annoncer un compte, gagner un pli — doit
   * sonner différemment selon qui l'a joué : l'IA (joueur 1) ou l'utilisateur
   * (joueur 0). On bascule donc le profil actif juste avant de jouer le son
   * de CE geste précis, plutôt qu'une fois pour tout l'écran.
   */
  const jouerPour = (acteur: PlayerIndex | null, son: () => void) => {
    setSoundContext(acteur === 1 ? "ia" : "joueur");
    son();
  };

  // Réglages persistants
  useEffect(() => {
    try {
      const raw = localStorage.getItem("azteque-settings");
      if (raw) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
      const savedName = localStorage.getItem("azteque-player-name")?.trim();
      if (savedName) setPlayerName(savedName);
      else {
        // Aucun nom dans ce navigateur : on le demande. Si un compte répond
        // ensuite, son pseudo fait foi et la demande n'a plus lieu d'être.
        askedForName.current = true;
        setShowPlayerProfile(true);
      }
      setTokens(Math.max(0, Number(localStorage.getItem("azteque-tokens")) || 0));
    } catch {
      /* ignore */
    } finally {
      setProfileReady(true);
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("azteque-settings", JSON.stringify(settings));
    } catch {
      /* ignore */
    }
  }, [settings]);

  useEffect(() => {
    if (!profileReady || accountBound) return;
    try {
      localStorage.setItem("azteque-player-name", playerName.trim() || "Joueur");
    } catch {
      /* ignore */
    }
  }, [playerName, profileReady, accountBound]);

  useEffect(() => {
    setSoundEnabled(settings.sound);
  }, [settings.sound]);

  // Synchronisation avec le compte : le pseudo choisi à l'inscription remplace
  // celui de ce navigateur, et les jetons gagnés hors connexion viennent
  // s'ajouter au solde du compte avant que celui-ci ne prenne le relais.
  useEffect(() => {
    let alive = true;
    void amIAdmin().then((oui) => alive && setIsAdmin(oui));
    getMyProfile()
      .then(async (p) => {
        if (!alive || !p) return;
        setAccount(p);
        setPlayerName(p.username);
        // La photo Google change d'adresse quand le joueur la remplace : on la
        // recopie, faute de quoi les autres afficheraient l'ancienne.
        void syncGooglePhoto(p)
          .then((f) => syncGoogleIdentity(f))
          .then((f) => alive && setAccount(f));
        void touchLastSeen();
        if (askedForName.current) {
          askedForName.current = false;
          setShowPlayerProfile(false);
        }
        const carried = await claimLocalTokens(getLocalTokens()).catch(() => null);
        if (!alive) return;
        setTokens(carried ?? p.tokens);
      })
      .catch(() => {
        /* hors ligne ou non connecté : on reste sur le profil du navigateur */
      })
      .finally(() => {
        if (alive) setAccountChecked(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Cadeau du jour.
  //
  // La proposition attend de savoir si un compte est ouvert : avec un compte,
  // c'est le serveur qui tient la date du dernier versement et décide ; sans
  // compte, c'est le navigateur. Décider avant la réponse reviendrait à verser
  // deux fois le même cadeau, une fois ici et une fois là-bas.
  const [accountChecked, setAccountChecked] = useState(false);
  const [showBonus, setShowBonus] = useState(false);
  const bonusAsked = useRef(false);
  useEffect(() => {
    if (!accountChecked || bonusAsked.current) return;
    bonusAsked.current = true;
    const due = account ? account.daily_bonus_at < todayKey() : localBonusDay() !== todayKey();
    if (due) setShowBonus(true);
  }, [accountChecked, account]);

  /** Le cadeau a bien été versé : les jetons voleront à la fermeture. */
  const bonusEncaisse = useRef(false);
  const collectBonus = useCallback(async () => {
    if (account) {
      const { granted, tokens: solde } = await claimDailyBonus();
      if (granted <= 0) return null;
      setTokens(solde);
      setAccount((a) => (a ? { ...a, tokens: solde, daily_bonus_at: todayKey() } : a));
      bonusEncaisse.current = true;
      return solde;
    }
    const solde = claimLocalDailyBonus();
    if (solde === null) return null;
    setTokens(solde);
    bonusEncaisse.current = true;
    return solde;
  }, [account]);

  /**
   * Fait voler la récompense jusqu'au compte.
   *
   * Le solde n'est visible que dans le panneau de profil : sans ce vol, des
   * jetons gagnés changeraient un nombre que personne ne regarde. Les pièces
   * partent donc du centre de l'écran — là où l'annonce du gain vient de
   * s'afficher — et rejoignent l'avatar, chacune avec son tintement.
   */
  const flyTokens = useCallback((amount: number) => {
    const cible = (jeuAvatarRef.current ?? accueilAvatarRef.current)?.getBoundingClientRect();
    if (!cible || amount <= 0) return;
    setCoinFlight({
      // Le vol doit se voir : sur l'accueil, l'avatar est lui aussi au milieu de
      // l'écran, et partir du centre ne laisserait aux jetons que quelques pixels
      // à parcourir. On les fait donc toujours monter depuis le bas.
      from: {
        x: window.innerWidth / 2,
        y: Math.max(window.innerHeight * 0.62, cible.bottom + 200),
      },
      to: { x: cible.left + cible.width / 2, y: cible.top + cible.height / 2 },
      amount,
    });
  }, []);

  useEffect(() => {
    if (!profileReady || accountBound) return;
    try {
      localStorage.setItem("azteque-tokens", String(tokens));
    } catch {
      /* ignore */
    }
  }, [tokens, profileReady, accountBound]);

  useEffect(() => {
    if (state.phase !== "gameEnd" || state.champWinner !== 0 || tokenAwarded.current) return;
    tokenAwarded.current = true;
    flyTokens(TOKEN_REWARDS[settings.difficulty]);
    if (!accountBound) {
      setTokens((t) => t + TOKEN_REWARDS[settings.difficulty]);
      return;
    }
    // Le montant de la récompense est fixé par le serveur selon le niveau
    // réellement affronté : le client ne peut pas se l'attribuer lui-même.
    awardAiWin(settings.difficulty)
      .then((balance) => {
        if (balance !== null) setTokens(balance);
      })
      .catch(() => setTokens((t) => t + TOKEN_REWARDS[settings.difficulty]));
  }, [state.phase, state.champWinner, settings.difficulty, accountBound, flyTokens]);

  useEffect(() => {
    if (state.phase !== "playing" || state.gains[0].length === 0) setShowMyGains(false);
  }, [state.phase, state.gains]);

  // Historique des comptes annoncés
  useEffect(() => {
    setMeldHistory((prev) => {
      const known = new Set(prev.map((e) => e.key));
      const added: typeof prev = [];
      ([0, 1] as PlayerIndex[]).forEach((p) => {
        state.melds[p].forEach((m) => {
          const key = `${roundKey}-${p}-${m.suit}-${m.type}`;
          if (known.has(key)) return;
          added.push({
            key,
            round: roundKey + 1,
            player: p,
            label: `${SUIT_SYMBOL[m.suit]} ${SUIT_NAME[m.suit]} — compte ${m.type === "triple" ? "trio" : "simple"}`,
            points: m.points,
          });
        });
      });
      return added.length > 0 ? [...prev, ...added] : prev;
    });
  }, [state.melds, roundKey]);

  const myMelds = useMemo(() => availableMelds(state, 0), [state]);
  const legal = useMemo(
    () =>
      state.turn === 0 &&
      state.phase === "playing" &&
      state.trick.length < 2 &&
      state.drawPending.length === 0
        ? legalCards(state, 0)
        : [],
    [state],
  );
  const legalIds = useMemo(() => new Set(legal.map((c) => c.id)), [legal]);
  // Tant que la proposition de compte est affichée et non tranchée,
  // le joueur ne peut pas jouer : il doit annoncer ou passer.
  const meldDecisionPending =
    state.phase === "playing" &&
    state.canAnnounce === 0 &&
    state.drawPending[0] === 0 &&
    state.hands[0].length === 5 &&
    myMelds.length > 0 &&
    state.stock.length > 0;

  const freshRound =
    state.phase === "playing" &&
    state.trick.length === 0 &&
    state.gains[0].length === 0 &&
    state.gains[1].length === 0 &&
    state.melds[0].length === 0 &&
    state.melds[1].length === 0;

  // Battage et distribution : le temps qu'ils durent, l'ordinateur ne joue pas
  // et le compte à rebours ne court pas — le joueur regarde, il ne réfléchit
  // pas encore.
  const dealing = useDealCeremony(state, started);

  // L'offre de redistribution attend la fin de la donne : proposée pendant,
  // elle annoncerait le contenu de la main avant que les cartes n'y soient.
  const canRedeal = freshRound && !dealing && !redealDone && hasMainBlanche(state, 0);

  // Le tapis acheté en boutique, s'il y en a un : il se pose sur la table,
  // au-dessus du feutre.
  const tapis = useTapisSurface(account?.background_kind);

  const deal = useCallback((dealer: PlayerIndex, won: [number, number]) => {
    setState(newRound(dealer, won));
    // Les comptes annoncés valent pour le tour écoulé : la nouvelle donne
    // repart d'un historique vide.
    setMeldHistory([]);
    setRedealDone(false);
    setRoundKey((k) => k + 1);
  }, []);

  // Main blanche de l'ordinateur
  useEffect(() => {
    if (!started || !freshRound || dealing || aiRedealChecked.current === roundKey) return;
    aiRedealChecked.current = roundKey;
    if (aiWantsRedeal(state, settings.difficulty)) {
      const t = setTimeout(() => {
        setState((s) => {
          const ns = newRound(s.dealer, s.roundsWon);
          ns.log.unshift("L'adversaire avait une main blanche : redistribution.");
          return ns;
        });
        setRoundKey((k) => k + 1);
      }, 500);
      return () => clearTimeout(t);
    }
    return;
  }, [started, freshRound, dealing, roundKey, state, settings.difficulty]);

  // Résolution du pli : ramassage animé puis pioche, avec de petites pauses
  useEffect(() => {
    // Avant que la partie ne soit lancée, l'état initial ne doit rien jouer
    // tout seul : sans ce garde-fou, la partie se joue en silence pendant que
    // le menu est affiché, et un rire finit par surprendre au bout d'un moment.
    if (!started || state.phase !== "playing" || state.trick.length < 2) return;
    const timers: ReturnType<typeof setTimeout>[] = [];

    timers.push(
      setTimeout(() => {
        const next = resolveTrick(state, { atout10: true });
        const winner = next.lastTrickWinner;
        const first = state.trick[0]!;
        const second = state.trick[1]!;
        const fromFirst = center(trickSlotRefs[first.player].current);
        const fromSecond = center(trickSlotRefs[second.player].current);
        const winnerPile = winner === null ? null : center(pileRefs[winner].current);

        const flights: typeof collect = [];
        const lastDelay = 140;
        // Après comparaison, les deux cartes convergent uniquement vers le tas gagnant.
        if (fromFirst && winnerPile)
          flights.push({ id: 1, card: first.card, from: fromFirst, to: winnerPile, delay: 0 });
        if (fromSecond && winnerPile)
          flights.push({
            id: 2,
            card: second.card,
            from: fromSecond,
            to: winnerPile,
            delay: lastDelay,
          });

        // Le son du pli — battu ou ramassé — appartient à qui l'a emporté.
        // Il joue toujours : c'est le geste mécanique, pas une réaction.
        if (winner === second.player) jouerPour(winner, () => sfx.beat());
        else jouerPour(winner, () => sfx.collect());
        setCollect(flights);
        timers.push(setTimeout(() => jouerPour(winner, () => sfx.collect()), lastDelay + 120));

        // Série de bonnes : il faut des PLIS consécutifs, pas seulement des
        // bonnes espacées dans le tour. Un pli sans bonne — même remporté par
        // le même joueur — interrompt la série ; une bonne au premier pli puis
        // une autre au troisième ne compte pas comme deux d'affilée.
        if (state.gains[0].length === 0 && state.gains[1].length === 0) {
          bonneStreak.current = { player: null, count: 0 };
        }
        const bonneAuPli = [first, second].some((e) => isBonne(e.card));
        let compteSerie = 0;
        if (winner !== null) {
          if (bonneAuPli) {
            const precedent = bonneStreak.current;
            compteSerie = precedent.player === winner ? precedent.count + 1 : 1;
            bonneStreak.current = { player: winner, count: compteSerie };
          } else {
            bonneStreak.current = { player: null, count: 0 };
          }
        }

        // Règle « Atout 10 » : transfert animé de tout le tas adverse
        const sweeps =
          winner !== null && trickCapturesPile(state, { atout10: true })
            ? state.gains[winner === 0 ? 1 : 0].length
            : 0;
        const loserPile = winner === null ? null : center(pileRefs[winner === 0 ? 1 : 0].current);

        // Ce pli termine-t-il le tour (ou le champ) ? Si oui, c'est
        // l'acclamation ou la moquerie de fin de tour qui doit se faire
        // entendre seule — pas un rire de pli en plus, aussitôt suivi d'un
        // second pour la même victoire.
        const roundEnding = next.phase !== "playing";

        // Un seul rire par pli, même quand plusieurs conditions se rencontrent
        // à la fois (une bonne volée qui prolonge aussi une série, par
        // exemple) : celui de la condition la plus marquante, jamais les deux
        // empilés. Rafler tout le tas d'un coup d'atout 10 l'emporte sur une
        // série, qui l'emporte elle-même sur une simple bonne volée — son
        // propre rire suit le transfert animé, plus bas — et la fin de tour
        // l'emporte sur tout le reste.
        if (sweeps === 0 && !roundEnding) {
          if (compteSerie >= 3) {
            const rireDeSerie =
              compteSerie === 3
                ? sfx.streakLaugh
                : compteSerie === 4
                  ? sfx.streakLaugh4
                  : sfx.streakLaugh5;
            timers.push(setTimeout(() => jouerPour(winner, rireDeSerie), lastDelay + 420));
          } else if (stealsBonne([first, second], winner)) {
            // Le rire salue la bonne PRISE À L'ADVERSAIRE, pas la sienne :
            // ramasser sa propre bonne n'a rien d'un exploit.
            timers.push(setTimeout(() => jouerPour(winner, () => sfx.snicker()), lastDelay + 240));
          }
        }

        timers.push(
          setTimeout(() => {
            setCollect([]);
            if (sweeps > 0 && loserPile && winnerPile) {
              const layers = Math.min(6, sweeps);
              jouerPour(winner, () => {
                sfx.sweep();
                if (!roundEnding) sfx.sweepLaugh();
              });
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
                    setState(next);
                  },
                  layers * 90 + 620,
                ),
              );
              return;
            }
            setState(next);
          }, lastDelay + 560),
        );
      }, settings.trickDelay),
    );

    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, state, settings.trickDelay]);

  // Pioche : une carte à la fois, après l'éventuelle annonce du vainqueur.
  // La carte n'apparaît dans la main qu'à l'arrivée de l'animation.
  useEffect(() => {
    if (!started || state.phase !== "playing" || state.drawPending.length === 0) return;
    if (state.stock.length === 0) return;
    const player = state.drawPending[0]!;
    const timers: ReturnType<typeof setTimeout>[] = [];

    // Phase d'annonce avant la pioche (5 cartes en main)
    if (state.canAnnounce === player) {
      if (player === 1) {
        const t = setTimeout(() => {
          setState((s) => {
            if (s.phase !== "playing" || s.canAnnounce !== 1) return s;
            const a = aiAnnounceAt(s, settings.difficulty);
            if (!a) return { ...s, canAnnounce: null };
            // La fenêtre d'annonce reste ouverte tant qu'un compte peut encore
            // être déclaré : une annonce sans effet la ferait rouvrir
            // indéfiniment. On la referme plutôt que de tourner en rond.
            const suivant = announce(s, 1, a.suits, a.trump);
            if (suivant === s) return { ...s, canAnnounce: null };
            // L'atout se fixe sur cette annonce précisément quand il n'était
            // pas encore choisi : un rire différent salue ce moment-là. C'est
            // l'IA qui annonce ici : son profil, pas celui du joueur.
            jouerPour(1, () => {
              if (s.trump === null) sfx.trumpLaugh();
              else sfx.chuckle();
            });
            return suivant;
          });
        }, 650);
        return () => clearTimeout(t);
      }
      // Joueur humain : attendre sa décision s'il a un compte annonçable
      if (availableMelds(state, 0).length > 0) return;
    }

    const t = setTimeout(() => {
      const from = center(stockRef.current);
      const to = center(player === 0 ? playerHandRef.current : opponentHandRef.current);
      if (from && to) {
        setDrawFlights([{ id: Date.now(), player, from, to, delay: 0 }]);
        jouerPour(player, () => sfx.draw());
      }
      // La carte rejoint la main exactement à l'arrivée du vol. La main rend
      // immédiatement son nouveau slot, sans seconde animation d'apparition.
      timers.push(
        setTimeout(() => {
          setState((s) => drawNext(s));
          setDrawFlights([]);
        }, DUREE_PIOCHE),
      );
    }, 420);
    timers.push(t);

    return () => timers.forEach(clearTimeout);
  }, [started, state, settings.difficulty]);

  // Tour de l'ordinateur
  useEffect(() => {
    if (!started || state.phase !== "playing" || state.turn !== 1 || state.trick.length >= 2)
      return;
    if (state.drawPending.length > 0 || state.canAnnounce === 1) return;
    if (dealing) return;
    const t = setTimeout(() => {
      // La carte est choisie ICI, hors du calcul de mise à jour : elle doit
      // être connue pour partir en vol EN MÊME TEMPS qu'elle est jouée. Elle
      // se posait auparavant d'un coup sur le tapis, sans qu'on la voie
      // quitter la main d'en face — seule celle du joueur volait.
      const card = aiChooseCardAt(state, settings.difficulty);
      const from = center(opponentHandRef.current);
      if (from) fly(card, from);
      jouerPour(1, () => sfx.place());
      setState((s) => playCard(s, 1, card.id));
    }, 750);
    return () => clearTimeout(t);
  }, [started, state, settings.difficulty, dealing, fly]);

  // Acclamations / rire moqueur en fin de tour
  const phaseKey = `${state.phase}-${state.roundsWon[0]}-${state.roundsWon[1]}`;
  // Quitter la table puis relancer « Jouer contre l'IA » sans repartir d'un
  // tour neuf laisse l'état tel quel : `started` repasse à vrai, cet effet
  // se redéclenche sur ce même dépôt, et le son de victoire rejouait à
  // chaque aller-retour au menu. On ne fête chaque fin de tour qu'une fois.
  const dernierFete = useRef<string | null>(null);
  useEffect(() => {
    if (!started || (state.phase !== "roundEnd" && state.phase !== "gameEnd")) return;
    if (dernierFete.current === phaseKey) return;
    dernierFete.current = phaseKey;
    const won = state.phase === "gameEnd" ? state.champWinner === 0 : state.roundWinner === 0;
    const lost = state.phase === "gameEnd" ? state.champWinner === 1 : state.roundWinner === 1;
    // Treize bonnes ou plus en un tour est la condition la plus marquante :
    // son rire remplace alors l'acclamation ou la moquerie ordinaire, plutôt
    // que de s'y ajouter.
    let t: ReturnType<typeof setTimeout> | null = null;
    let t2: ReturnType<typeof setTimeout> | null = null;
    if (state.instantWin) {
      t2 = setTimeout(() => jouerPour(won ? 0 : 1, () => sfx.landslideLaugh()), 1000);
    } else {
      // Les acclamations saluent la victoire de l'utilisateur, la moquerie
      // celle de l'IA : chacune dans son propre profil.
      t = setTimeout(() => {
        if (won) jouerPour(0, () => sfx.cheer());
        else if (lost) jouerPour(1, () => sfx.taunt());
      }, 350);
    }
    return () => {
      if (t) clearTimeout(t);
      if (t2) clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, phaseKey]);

  // Compte à rebours du tour : dépasser le délai fait perdre le champ
  const myTurnActive =
    !dealing &&
    state.phase === "playing" &&
    state.trick.length < 2 &&
    (state.turn === 0 || meldDecisionPending) &&
    (state.drawPending.length === 0 || meldDecisionPending);
  const turnKey = `${state.turn}-${state.trick.length}-${state.drawPending.length}-${state.phase}-${String(meldDecisionPending)}`;
  const turnLeft = useTurnCountdown(myTurnActive, turnKey, TURN_LIMIT);

  useEffect(() => {
    if (!myTurnActive || turnLeft > 0) return;
    setState((s) =>
      s.phase === "playing"
        ? { ...s, phase: "gameEnd", champWinner: 1, forfeit: { loser: 0, reason: "timeout" } }
        : s,
    );
  }, [turnLeft, myTurnActive]);

  // Barre de temps de l'IA (visuelle)
  const oppTurnActive =
    state.phase === "playing" &&
    state.trick.length < 2 &&
    state.turn === 1 &&
    !meldDecisionPending &&
    state.drawPending.length === 0;

  const [confirmQuit, setConfirmQuit] = useState(false);
  const quitTable = useCallback(() => {
    setConfirmQuit(false);
    setStarted(false);
  }, []);

  // Anticiper la fin du tour : possible à son tour, hors animation, tant
  // qu'aucune carte n'est posée et qu'aucune décision n'est en attente.
  const [confirmAnticipate, setConfirmAnticipate] = useState(false);
  const canAnticipate =
    started &&
    !dealing &&
    state.phase === "playing" &&
    state.turn === 0 &&
    state.trick.length === 0 &&
    state.drawPending.length === 0 &&
    !meldDecisionPending;
  const anticipateNow = () => {
    setConfirmAnticipate(false);
    setState((s) => anticipate(s, 0));
  };

  // Annonce au gestionnaire global d'invitations qu'une partie est en cours :
  // accepter une invitation pendant qu'on joue devra d'abord passer par
  // `quitTable`, avec l'avertissement qui va avec.
  useEffect(() => {
    if (!started || state.phase === "gameEnd") return;
    return registerGameSession("solo", quitTable);
  }, [started, state.phase, quitTable]);

  // Fin de tour ou de partie : une invitation mise de côté avec « Plus tard »
  // peut réapparaître.
  useEffect(() => {
    if (state.phase === "roundEnd" || state.phase === "gameEnd") announceFreed();
  }, [state.phase]);

  const nextRound = useCallback(() => {
    setState((s) => {
      const dealer: PlayerIndex = (s.lastTrickWinner ?? s.dealer) as PlayerIndex;
      const ns = newRound(dealer, s.roundsWon);
      return ns;
    });
    setMeldHistory([]);
    setRedealDone(false);
    setRoundKey((k) => k + 1);
  }, []);

  const restart = useCallback(() => {
    tokenAwarded.current = false;
    deal(Math.random() < 0.5 ? 0 : 1, [0, 0]);
  }, [deal]);

  // Changer de niveau en cours de partie reviendrait à finir en Légende un
  // champ commencé en Facile — et à empocher la récompense du niveau le plus
  // élevé sans l'avoir affrontée. Tout changement repart donc d'une partie
  // neuve, quel que soit l'écran par lequel il passe.
  //
  // Mais pas avant que le joueur soit revenu à la table : la donne lancée
  // pendant que le panneau de l'adversaire est encore ouvert se jouait
  // derrière lui, et il retrouvait des cartes déjà distribuées sans avoir rien
  // vu du battage. On attend donc « Enregistrer ».
  const playedDifficulty = useRef(settings.difficulty);
  useEffect(() => {
    if (playedDifficulty.current === settings.difficulty || showAiProfile) return;
    playedDifficulty.current = settings.difficulty;
    if (!started) return;
    restart();
  }, [settings.difficulty, showAiProfile, started, restart]);

  /** Déclare UN compte. Le premier de la donne crée l'atout dans sa couleur. */
  const doAnnounce = (suit: Suit) => {
    // L'atout se fixe sur cette annonce précisément quand il n'était pas
    // encore choisi : un rire différent salue ce moment-là.
    const fixeLAtout = state.trump === null;
    setState((s) => announce(s, 0, [suit], fixeLAtout ? suit : null));
    // C'est l'utilisateur qui annonce ici : son profil, pas celui de l'IA.
    jouerPour(0, () => {
      if (fixeLAtout) sfx.trumpLaugh();
      else sfx.chuckle();
    });
  };

  const playMyCard = (card: Card, el: HTMLElement) => {
    // Impossible de jouer tant que la proposition de compte n'est pas tranchée.
    if (meldDecisionPending) return;
    // Ni tant qu'une pioche est en cours : la carte volante doit d'abord
    // rejoindre la main. Ce garde-fou remplace le grisage des cartes, qui
    // rendait toute la main translucide le temps du vol.
    if (state.drawPending.length > 0) return;
    // Le rectangle d'une carte penchée est plus grand qu'elle, mais son centre
    // reste juste : on part de là, avec sa vraie largeur et son vrai angle,
    // pour que le vol prenne le relais sans à-coup.
    const from = center(el);
    if (from) fly(card, from, el.offsetWidth, angleOf(el.parentElement));
    jouerPour(0, () => sfx.place());
    setState((s) => playCard(s, 0, card.id));
  };

  const myBonnes = state.gains[0].filter(isBonne).length;
  const myComptes = meldHistory.filter((e) => e.player === 0).reduce((sum, e) => sum + e.points, 0);
  const oppBonnes = state.gains[1].filter(isBonne).length;
  const revealOpp = state.phase !== "playing";
  if (!started) {
    return (
      <main className="home-surface flex min-h-dvh flex-col items-center justify-center px-6 py-16 text-center">
        <p className="mb-3 text-xs uppercase tracking-[0.4em] text-gold-soft">
          Jeu traditionnel d'Afrique de l'Ouest
        </p>
        <h1 className="gold-text font-black text-6xl sm:text-7xl">Aztèque</h1>
        <p className="mt-5 max-w-md text-sm leading-relaxed text-muted-foreground">
          Conquérez les plis, ramassez les bonnes, annoncez vos comptes et créez l'atout. Trois
          tours gagnés — ou treize bonnes — et le champ est à vous.
        </p>
        <div className="mt-9 flex w-full max-w-xs flex-col items-center gap-4">
          <ProfileButton
            innerRef={accueilAvatarRef}
            name={playerName}
            icon="player"
            account={account}
            align="center"
            onClick={() => setShowPlayerProfile(true)}
          />
          <button
            onClick={() => setStarted(true)}
            className="w-full rounded-full bg-[image:var(--gradient-gold)] px-8 py-3 text-center font-display text-sm font-semibold text-primary-foreground shadow-[var(--shadow-table)] transition-transform hover:scale-105"
          >
            Jouer contre l'IA
          </button>
          <Link
            to="/online"
            className="gold-tag w-full rounded-full border border-gold/50 px-8 py-3 text-center font-display text-sm font-semibold text-gold transition-transform hover:scale-105"
          >
            Jouer en ligne
          </Link>
          <Link
            to="/boutique"
            className="gold-tag w-full rounded-full border border-gold/35 px-8 py-2.5 text-center font-display text-sm font-semibold text-gold/90 transition-transform hover:scale-105"
          >
            Boutique
          </Link>
          {isAdmin && (
            <Link
              to="/admin"
              className="w-full rounded-full border border-orange px-8 py-2 text-center font-display text-xs font-semibold uppercase tracking-widest text-orange transition-transform hover:scale-105"
            >
              Administration
            </Link>
          )}
        </div>

        {/* Le cadeau attend que la table soit libre : au tout premier lancement,
            le jeu demande d'abord un nom, et deux panneaux superposés
            cacheraient l'un des deux. */}
        {showBonus && !showPlayerProfile && !showRules && (
          <DailyBonusPanel
            amount={DAILY_BONUS}
            onCollect={collectBonus}
            onClose={() => {
              setShowBonus(false);
              if (!bonusEncaisse.current) return;
              bonusEncaisse.current = false;
              flyTokens(DAILY_BONUS);
            }}
          />
        )}
        {coinFlight && (
          <CoinBurst
            from={coinFlight.from}
            to={coinFlight.to}
            amount={coinFlight.amount}
            onDone={() => setCoinFlight(null)}
          />
        )}
        {showRules && <RulesPanel onClose={() => setShowRules(false)} />}
        {showPlayerProfile && (
          <PlayerProfilePanel
            playerName={playerName}
            tokens={tokens}
            onNameChange={setPlayerName}
            account={account}
            onAccountChange={setAccount}
            rank={
              account && {
                rating: account.rating,
                peak: account.peak_rating,
                games: account.rated_games,
              }
            }
            settings={settings}
            onChange={setSettings}
            onRules={() => {
              setShowPlayerProfile(false);
              setShowRules(true);
            }}
            onClose={() => setShowPlayerProfile(false)}
          />
        )}
        {/* Comme le cadeau du jour : seulement quand la table est libre. */}
        {!showBonus && !showPlayerProfile && !showRules && <InstallPrompt />}
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-4 px-3 py-4 sm:px-6 sm:py-6">
      {/* Tableau des profils */}
      <header className="panel grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-3 py-2 sm:px-5">
        <ProfileButton
          name={playerName}
          icon="player"
          account={account}
          align="left"
          innerRef={jeuAvatarRef}
          onClick={() => setShowPlayerProfile(true)}
        />
        <div className="min-w-16 text-center">
          <h1 className="gold-text font-black text-lg leading-none sm:text-2xl">Aztèque</h1>
          <p className="mt-1 whitespace-nowrap text-xs font-semibold text-foreground">
            {state.roundsWon[0]} <span className="text-muted-foreground">—</span>{" "}
            {state.roundsWon[1]}
          </p>
          <p className="mt-0.5 whitespace-nowrap text-[0.62rem] font-semibold text-gold">
            🪙 {TOKEN_REWARDS[settings.difficulty]} jetons à gagner
          </p>
        </div>
        <ProfileButton
          name={`IA ${DIFFICULTY_LABEL[settings.difficulty]}`}
          icon="ai"
          align="right"
          onClick={() => setShowAiProfile(true)}
        />
      </header>

      {/* Adversaire */}
      <section className="flex items-start justify-between gap-3">
        <div className="flex w-full flex-col gap-2">
          <div ref={opponentHandRef} style={{ opacity: dealing ? 0 : 1 }}>
            <HandRow
              cards={state.hands[1]}
              exposedIds={state.exposed[1]}
              faceDown={(c) => !state.exposed[1].includes(c.id)}
              interactive={false}
              refillable={state.stock.length > 0}
              animateArrivals={false}
            />
          </div>
          <TurnBar total={TURN_LIMIT} active={oppTurnActive} resetKey={turnKey} />
        </div>
      </section>

      {/* Tapis */}
      <section
        ref={tableRef}
        style={tapis}
        className="game-table-surface relative flex min-h-44 max-h-[40dvh] grow-[999] flex-col items-center justify-center gap-3 rounded-xl p-4"
      >
        <div className="absolute left-3 top-3" ref={pileRefs[1]}>
          <CapturedPile cards={state.gains[1]} owner="opponent" />
        </div>

        <div className="absolute bottom-3 right-3" ref={pileRefs[0]}>
          <CapturedPile cards={state.gains[0]} owner="player" onOpen={() => setShowMyGains(true)} />
        </div>

        {/* Aligné sur les mêmes conditions que la barre de temps, pour que
            l'annonce du tour et le compte à rebours apparaissent ensemble.
            L'espace insécable réserve la ligne pendant la pioche. */}
        {state.trick.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {state.phase !== "playing"
              ? "Tour terminé."
              : myTurnActive && !meldDecisionPending
                ? "À vous de mener."
                : oppTurnActive
                  ? "L'adversaire réfléchit…"
                  : "\u00a0"}
          </p>
        )}

        <div className="grid grid-cols-[4.5rem_3.75rem_4.5rem] items-center gap-2 sm:gap-4">
          <div ref={trickSlotRefs[1]}>
            <TrickPosition
              trick={state.trick}
              player={1}
              hidden={collect.length > 0}
              vols={etat}
              cardRef={trickCardRefs[1]}
              showLabel={false}
            />
          </div>

          <div
            ref={stockRef}
            className="flex min-h-20 flex-col items-center justify-center gap-1"
            aria-label={
              state.stock.length > 0 ? `Pioche, ${state.stock.length} cartes` : "Pioche vide"
            }
          >
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

          <div ref={trickSlotRefs[0]}>
            <TrickPosition
              trick={state.trick}
              player={0}
              hidden={collect.length > 0}
              vols={etat}
              cardRef={trickCardRefs[0]}
              showLabel={false}
            />
          </div>
        </div>

        {state.trump && (
          <span className="gold-tag pointer-events-none absolute right-2 top-2 z-20 rounded border border-gold/45 bg-felt-deep/90 px-2 py-1 text-[0.58rem] font-semibold text-gold shadow-[var(--shadow-card)]">
            Atout · {SUIT_SYMBOL[state.trump]} {SUIT_NAME[state.trump]}
          </span>
        )}

        {/* Main blanche */}
        {canRedeal && (
          <div className="relative z-30 w-full max-w-sm rounded-lg border border-accent/50 bg-secondary p-3 text-center shadow-[var(--shadow-card)]">
            <p className="text-xs text-accent">
              Main blanche : vous n'avez ni Roi, ni Dame, ni Valet.
            </p>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
              <button
                onClick={() => deal(state.dealer, state.roundsWon)}
                className="rounded-full bg-[image:var(--gradient-gold)] px-4 py-1.5 text-xs font-semibold text-primary-foreground"
              >
                Demander une redistribution
              </button>
              <button
                onClick={() => setRedealDone(true)}
                className="text-xs text-muted-foreground underline"
              >
                Garder ma main
              </button>
            </div>
          </div>
        )}

        {/* Annonce de comptes : un bouton par compte, annoncé seul.
            Le joueur en déclare un, la fenêtre se rouvre sur ce qui reste, et
            il décide à nouveau — d'où la possibilité d'en garder un pour lui.
            Tant que l'atout n'est pas fixé, le premier annoncé le crée : c'est
            dit sur l'étiquette, et le barème affiché en tient compte. */}
        {meldDecisionPending && (
          <div className="absolute bottom-2 left-2 z-30 max-w-[calc(100%_-_7rem)] rounded border border-gold/35 bg-felt-deep/95 p-2 shadow-[var(--shadow-card)]">
            <p className="mb-1 text-[0.62rem] font-semibold leading-tight text-gold">
              {state.trump === null ? "Annoncer un compte — il fixera l'atout" : "Annoncer"}
            </p>
            <div className="flex flex-wrap gap-1">
              {myMelds.map((m) => (
                <button
                  key={m.suit}
                  onClick={() => doAnnounce(m.suit)}
                  className="rounded bg-[image:var(--gradient-gold)] px-2 py-1 text-[0.6rem] font-semibold leading-none text-primary-foreground"
                >
                  {SUIT_SYMBOL[m.suit]} {m.type === "triple" ? "trio" : "simple"} ·{" "}
                  {meldPoints(m.type, state.trump === null || m.suit === state.trump)} pts
                </button>
              ))}
              <button
                onClick={() => {
                  // Clôturer la fenêtre d'annonce : la pioche se déroule ensuite.
                  setState((s) => (s.canAnnounce === 0 ? { ...s, canAnnounce: null } : s));
                }}
                className="rounded border border-border px-2 py-1 text-[0.6rem] leading-none text-muted-foreground transition-colors hover:bg-secondary"
              >
                {myMelds.length > 1 ? "Tout passer" : "Passer"}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Votre main */}
      <section className="flex flex-col gap-2">
        <TurnBar total={TURN_LIMIT} active={myTurnActive} resetKey={turnKey} />
        {/* Pendant la donne, la main garde sa place — ses cases servent de
            cibles aux cartes qui arrivent — mais reste invisible : on ne
            distribue pas des cartes déjà posées. */}
        <div ref={playerHandRef} style={{ opacity: dealing ? 0 : 1 }}>
          <HandRow
            cards={state.hands[0]}
            exposedIds={state.exposed[0]}
            refillable={state.stock.length > 0}
            fan
            animateArrivals={false}
            isDisabled={(c) =>
              meldDecisionPending ||
              state.drawPending.length > 0 ||
              state.turn !== 0 ||
              state.phase !== "playing" ||
              state.trick.length >= 2 ||
              !legalIds.has(c.id)
            }
            isMuted={(c) =>
              state.phase === "playing" &&
              state.turn === 0 &&
              state.drawPending.length === 0 &&
              state.trick.length < 2 &&
              !meldDecisionPending &&
              !legalIds.has(c.id)
            }
            onPlay={playMyCard}
          />
        </div>

        {/* Informations du joueur */}
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setShowMyBonnes(true)}
            className="gold-tag rounded-full border border-gold/40 bg-felt-deep/60 px-3 py-1 text-[0.68rem] font-semibold text-gold transition-colors hover:bg-gold/10"
          >
            Bonnes · {myBonnes}
          </button>
          <button
            type="button"
            onClick={() => setShowHistory(true)}
            className="gold-tag rounded-full border border-gold/40 bg-felt-deep/60 px-3 py-1 text-[0.68rem] font-semibold text-gold transition-colors hover:bg-gold/10"
          >
            Comptes · {myComptes}
          </button>
          <button
            type="button"
            disabled={!canAnticipate}
            onClick={() => setConfirmAnticipate(true)}
            className="gold-tag rounded-full border border-gold/40 bg-felt-deep/60 px-3 py-1 text-[0.68rem] font-semibold text-gold transition-colors hover:bg-gold/10 disabled:opacity-40"
          >
            Anticiper la fin
          </button>
          <button
            type="button"
            onClick={() => setConfirmQuit(true)}
            className="rounded-full border border-destructive/50 bg-felt-deep/95 px-3 py-1 text-[0.68rem] font-semibold text-destructive transition-colors hover:bg-destructive/10"
          >
            Quitter la table
          </button>
        </div>
      </section>

      {/* Bandeau du bas.
          Le tapis est plafonné pour laisser de la hauteur aux cartes ; sur un
          grand écran il reste malgré tout de la place, et elle échouait
          jusqu'ici en vert mort sous les boutons. Ce bandeau la recueille au
          ras du bord — il accueillera les gestes qui n'ont pas leur place au
          milieu du jeu (son, stickers). Vide, il ne se voit pas. */}
      <div className="min-h-11 grow" aria-hidden="true" />

      {/* Carte en vol vers le tapis */}
      {flight && (
        <FlyingCard
          card={flight.card}
          from={flight.from}
          fromWidth={flight.width}
          fromRotate={flight.rot}
          to={volArrivee ?? flight.from}
        />
      )}

      {/* Cartes piochées, vainqueur du pli en premier */}
      {drawFlights.map((flight) => (
        <DrawCard key={flight.id} {...flight} />
      ))}

      {/* Ramassage du pli vers les tas */}
      {collect.map((flight) => (
        <CollectCard key={flight.id} {...flight} />
      ))}

      {/* Atout 10 : transfert du tas adverse */}
      {sweepFlights.map((flight) => (
        <SweepCard key={flight.id} {...flight} />
      ))}

      {/* La récompense rejoint le compte : une pluie de jetons vers l'avatar. */}
      {coinFlight && (
        <CoinBurst
          from={coinFlight.from}
          to={coinFlight.to}
          amount={coinFlight.amount}
          onDone={() => setCoinFlight(null)}
        />
      )}

      {(state.phase === "roundEnd" || state.phase === "gameEnd") &&
        (state.roundScore || state.forfeit) && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-6">
            <div className="panel w-full max-w-md p-6 text-center">
              <h2 className="gold-text text-3xl">
                {state.phase === "gameEnd"
                  ? state.champWinner === 0
                    ? "Champ remporté !"
                    : "Champ perdu"
                  : state.roundWinner === null
                    ? "Pont !"
                    : state.roundWinner === 0
                      ? "Tour gagné"
                      : "Tour perdu"}
              </h2>
              {state.instantWin && (
                <p className="mt-1 text-xs text-accent">Treize bonnes ou plus en un tour.</p>
              )}
              {state.phase === "gameEnd" && state.champWinner === 0 && (
                <p className="mt-2 text-sm font-semibold text-gold">
                  🪙 +{TOKEN_REWARDS[settings.difficulty]} jetons remportés !
                </p>
              )}
              {state.pont && state.phase === "roundEnd" && (
                <p className="mt-1 text-xs text-accent">
                  Égalité parfaite : aucun tour marqué, on rejoue le tour.
                </p>
              )}
              {state.forfeit?.reason === "timeout" && (
                <p className="mt-2 text-xs text-destructive">
                  Temps écoulé : vous n'avez pas joué dans le délai imparti.
                </p>
              )}
              {state.roundScore && (
                <div className="mt-5 grid grid-cols-2 gap-3 text-left text-sm">
                  <Recap title="Vous" s={state.roundScore[0]} />
                  <Recap title="Adversaire" s={state.roundScore[1]} />
                </div>
              )}
              <p className="mt-4 text-xs text-muted-foreground">
                Tours gagnés — Vous {state.roundsWon[0]} · Adversaire {state.roundsWon[1]}
              </p>
              <button
                onClick={state.phase === "gameEnd" ? restart : nextRound}
                className="mt-5 rounded-full bg-[image:var(--gradient-gold)] px-6 py-2.5 font-display text-sm font-semibold text-primary-foreground"
              >
                {state.phase === "gameEnd"
                  ? "Nouvelle partie"
                  : state.pont
                    ? "Rejouer le tour"
                    : "Tour suivant"}
              </button>
              <button
                onClick={quitTable}
                className="mt-3 block w-full rounded-full border border-destructive/50 px-6 py-2.5 font-display text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10"
              >
                Quitter
              </button>
            </div>
          </div>
        )}

      {confirmAnticipate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
          <div className="panel w-full max-w-sm p-6 text-center">
            <h2 className="gold-text text-2xl">Anticiper la fin du tour ?</h2>
            <p className="mt-3 text-xs text-muted-foreground">
              Le tour s'arrête aussitôt. Toutes les bonnes de votre main et celles restées dans la
              pioche sont versées à l'adversaire, puis les points sont comptés.
            </p>
            <div className="mt-5 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setConfirmAnticipate(false)}
                className="rounded-full border border-border px-5 py-2 text-sm text-muted-foreground"
              >
                Continuer le tour
              </button>
              <button
                type="button"
                onClick={anticipateNow}
                className="rounded-full bg-[image:var(--gradient-gold)] px-5 py-2 text-sm font-semibold text-primary-foreground"
              >
                Anticiper
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmQuit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
          <div className="panel w-full max-w-sm p-6 text-center">
            <h2 className="gold-text text-2xl">Quitter la table ?</h2>
            <p className="mt-3 text-xs text-muted-foreground">
              La partie en cours sera abandonnée.
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
                onClick={quitTable}
                className="rounded-full bg-destructive-solid px-5 py-2 text-sm font-semibold text-destructive-foreground"
              >
                Quitter
              </button>
            </div>
          </div>
        </div>
      )}

      {dealing && (
        <DealCeremony stockRef={stockRef} myHandRef={playerHandRef} oppHandRef={opponentHandRef} />
      )}
      {showRules && <RulesPanel onClose={() => setShowRules(false)} />}
      {showPlayerProfile && (
        <PlayerProfilePanel
          playerName={playerName}
          tokens={tokens}
          onNameChange={setPlayerName}
          account={account}
          onAccountChange={setAccount}
          rank={
            account && {
              rating: account.rating,
              peak: account.peak_rating,
              games: account.rated_games,
            }
          }
          settings={settings}
          onChange={setSettings}
          onRules={() => {
            setShowPlayerProfile(false);
            setShowRules(true);
          }}
          onClose={() => setShowPlayerProfile(false)}
        />
      )}
      {showAiProfile && (
        <AiProfilePanel
          difficulty={settings.difficulty}
          onChange={(difficulty) => setSettings((current) => ({ ...current, difficulty }))}
          onClose={() => setShowAiProfile(false)}
        />
      )}
      {showMyGains && <GainsPanel cards={state.gains[0]} onClose={() => setShowMyGains(false)} />}
      {showMyBonnes && (
        <GainsPanel
          cards={state.gains[0].filter(isBonne)}
          title="Vos bonnes"
          subtitle={`${myBonnes} bonnes remportées — treize bonnes gagnent le tour`}
          onClose={() => setShowMyBonnes(false)}
        />
      )}
      {showHistory && (
        <MeldHistoryPanel entries={meldHistory} onClose={() => setShowHistory(false)} />
      )}
    </main>
  );
}
