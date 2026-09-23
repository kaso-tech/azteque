import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { notifier, resynchroniser } from "@/lib/azteque/push";
import { Button } from "@/components/ui/button";
import { FriendsPanel, SignInCard, UsernameCard } from "@/components/azteque/account-panels";
import { RankProgressCard } from "@/components/azteque/rank";
import { PlayerAvatar } from "@/components/azteque/avatar";
import {
  describeError,
  claimLocalTokens,
  clearStaleSession,
  completeOAuthRedirect,
  currentUserId,
  getMyProfile,
  syncGooglePhoto,
  invitePlayer,
  myRecord,
  onAuthChange,
  respondInvite,
  trackLobbyPresence,
  type Profile,
} from "@/lib/azteque/account";
import {
  chercherAdversaire,
  interrogerFile,
  quitterFile,
  type Recherche,
} from "@/lib/azteque/matchmaking";
import {
  createMatch,
  echeanceAttente,
  joinMatch,
  myOpenMatch,
  mySeat,
  normalizeCode,
  subscribeMatch,
  type MatchRow,
} from "@/lib/azteque/online";
import { getTokens } from "@/lib/azteque/tokens";

export const Route = createFileRoute("/online")({
  // `partie` porte le code d'une table à rejoindre. `code` et `state` sont
  // ceux du retour de Google : ils ne servent pas au routeur, mais doivent
  // être déclarés, faute de quoi il les retire de l'URL avant que
  // `completeOAuthRedirect` ait pu les lire.
  validateSearch: (
    search: Record<string, unknown>,
  ): { partie?: string; code?: string; state?: string } => {
    const str = (k: string) => (typeof search[k] === "string" ? (search[k] as string) : undefined);
    const out: { partie?: string; code?: string; state?: string } = {};
    const partie = str("partie");
    const code = str("code");
    const state = str("state");
    if (partie !== undefined) out.partie = partie;
    if (code !== undefined) out.code = code;
    if (state !== undefined) out.state = state;
    return out;
  },

  head: () => ({
    meta: [
      { title: "Aztèque en ligne — Jouer à deux entre amis" },
      {
        name: "description",
        content:
          "Retrouvez vos amis par leur pseudo, invitez-les à jouer et conservez vos jetons et vos victoires d'une partie à l'autre.",
      },
      { property: "og:title", content: "Aztèque en ligne — Jouer à deux" },
      {
        property: "og:description",
        content: "Comptes joueurs, liste d'amis et invitations directes, sans code à recopier.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OnlineLobby,
});

type Stage = "loading" | "signed-out" | "no-profile" | "ready";

function OnlineLobby() {
  const { partie: codeParam } = Route.useSearch();
  const navigate = useNavigate();

  const [stage, setStage] = useState<Stage>("loading");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [record, setRecord] = useState<{ wins: number; losses: number } | null>(null);
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busyInvite, setBusyInvite] = useState<string | null>(null);

  // Partie créée en attendant que l'invité rejoigne. `inviteId` permet de
  // retirer l'invitation si l'hôte renonce.
  const [pending, setPending] = useState<{
    match: MatchRow;
    who: string;
    inviteId: string | null;
  } | null>(null);
  const unwatch = useRef<(() => void) | null>(null);

  /** Secondes restantes avant que la table en attente ne soit supprimée. */
  const [resteAttente, setResteAttente] = useState(0);

  const [codeInput, setCodeInput] = useState(codeParam ? normalizeCode(codeParam) : "");
  const [busyCode, setBusyCode] = useState(false);

  /* ---------- Session et profil ---------- */

  const load = useCallback(async () => {
    // Retour de Google : transformer le code en session avant toute chose.
    try {
      await completeOAuthRedirect();
    } catch (e: unknown) {
      setStage("signed-out");
      setProfile(null);
      setError(describeError(e, "Connexion refusée."));
      return;
    }
    let id: string | null;
    try {
      id = await currentUserId();
    } catch {
      // Session illisible (jeton périmé, session anonyme héritée) : on
      // l'efface et l'on propose la connexion, plutôt que de rester
      // indéfiniment sur « Chargement… ».
      await clearStaleSession();
      setStage("signed-out");
      setProfile(null);
      return;
    }
    if (!id) {
      setStage("signed-out");
      setProfile(null);
      return;
    }
    let p: Profile | null;
    try {
      p = await getMyProfile();
    } catch (e: unknown) {
      setStage("signed-out");
      setProfile(null);
      setError(describeError(e, "Profil illisible."));
      return;
    }
    if (!p) {
      setStage("no-profile");
      return;
    }
    setProfile(p);
    setStage("ready");
    void syncGooglePhoto(p)
      .then(setProfile)
      .catch(() => {});
    // Les jetons gagnés hors connexion rejoignent le solde du compte, qu'il
    // vienne d'être créé ou qu'il existe depuis longtemps.
    try {
      const updated = await claimLocalTokens(getTokens());
      if (updated !== null) setProfile((cur) => (cur ? { ...cur, tokens: updated } : cur));
    } catch {
      /* le report n'est pas critique : le solde du compte fait foi */
    }
    myRecord()
      .then(setRecord)
      .catch(() => setRecord(null));
  }, []);

  useEffect(() => {
    load().catch((e: unknown) => {
      setStage("signed-out");
      setError(describeError(e, "Chargement impossible."));
    });
    return onAuthChange(() => {
      void load();
    });
  }, [load]);

  useEffect(() => () => unwatch.current?.(), []);

  /* ---------- Présence ---------- */

  useEffect(() => {
    if (!profile) return;
    // L'ami absent n'a aucun client pour remarquer notre arrivée : c'est donc
    // à nous de l'annoncer. Le serveur tient le verrou d'une heure, sans quoi
    // un simple rechargement de page déclencherait une rafale.
    void notifier({ type: "ami_en_ligne" });
    // Et tant qu'on y est : un abonnement qui a survécu au navigateur mais
    // perdu sa ligne en base se répare ici, en silence.
    void resynchroniser().catch(() => {});
    return trackLobbyPresence(profile.id, setOnline);
  }, [profile]);

  /* ---------- Reprendre une table laissée en plan ---------- */

  /**
   * Une table quittée par accident restait perdue : son code ne permet pas d'y
   * revenir (il n'ouvre qu'une table encore en attente) et l'adresse exacte
   * disparaît avec l'onglet fermé. On la retrouve donc ici, à l'endroit même
   * où le joueur revient.
   */
  const [openMatch, setOpenMatch] = useState<{ match: MatchRow; seat: "host" | "guest" } | null>(
    null,
  );
  useEffect(() => {
    if (!profile) {
      setOpenMatch(null);
      return;
    }
    let vivant = true;
    setOpenMatch(null);
    myOpenMatch()
      .then((m) => {
        if (!vivant) return;
        if (!m) {
          setOpenMatch(null);
          return;
        }
        const seat = mySeat(m, profile.id);
        setOpenMatch(seat ? { match: m, seat } : null);
      })
      .catch(() => {
        /* le salon reste utilisable : au pire, la reprise n'est pas proposée */
      });
    return () => {
      vivant = false;
    };
  }, [profile]);

  /* ---------- Inviter un joueur ---------- */

  const enterTable = useCallback(
    (matchId: string, seat: "host" | "guest") => {
      unwatch.current?.();
      void navigate({ to: "/match/$id", params: { id: matchId }, search: { seat } });
    },
    [navigate],
  );

  /* ---------- Chercher un adversaire ---------- */

  /**
   * L'attente, tenue par un battement régulier.
   *
   * La recherche proprement dite n'a lieu qu'au premier appel ; ensuite on se
   * contente de prendre des nouvelles, ce qui rafraîchit aussi notre place
   * dans la file. Interroger en boucle plutôt que rechercher en boucle évite
   * que deux clients ne tentent de s'apparier l'un à l'autre en même temps.
   */
  const [enRecherche, setEnRecherche] = useState(false);
  const [devant, setDevant] = useState(0);

  const partirEnTable = useCallback(
    (r: Recherche) => {
      if (!r.trouve) {
        setDevant(r.devant);
        return false;
      }
      setEnRecherche(false);
      // C'est nous qui découvrons l'appariement ; l'autre attend peut-être
      // écran éteint. Le serveur retrouve son identité depuis la table — la
      // file d'attente ne nous l'a pas donnée.
      void notifier({ type: "appariement", matchId: r.matchId });
      enterTable(r.matchId, r.seat);
      return true;
    },
    [enterTable],
  );

  const chercher = () => {
    setError(null);
    setEnRecherche(true);
    setDevant(0);
    chercherAdversaire()
      .then(partirEnTable)
      .catch((e: unknown) => {
        setEnRecherche(false);
        setError(describeError(e, "Recherche impossible."));
      });
  };

  const renoncer = () => {
    setEnRecherche(false);
    void quitterFile().catch(() => {});
  };

  useEffect(() => {
    if (!enRecherche) return;
    let vivant = true;
    const battre = () => {
      interrogerFile()
        .then((r) => {
          if (vivant) partirEnTable(r);
        })
        .catch(() => {
          /* un battement manqué n'annule pas l'attente : le suivant reprendra */
        });
    };
    const t = setInterval(battre, 2500);
    return () => {
      vivant = false;
      clearInterval(t);
    };
  }, [enRecherche, partirEnTable]);

  // Quitter le salon en cours de recherche ne doit pas laisser une place
  // fantôme dans la file. Le battement de cœur finirait par l'effacer, mais
  // autant ne pas faire attendre un adversaire devant une porte fermée.
  useEffect(
    () => () => {
      void quitterFile().catch(() => {});
    },
    [],
  );

  /**
   * Cesser d'attendre : on ferme l'écoute et on retire l'invitation.
   *
   * Partagé par le bouton « Annuler » et par l'expiration, parce que ce sont
   * les mêmes gestes — la seule différence est le mot qu'on laisse à l'écran.
   */
  const cesserDAttendre = useCallback((motif: string | null) => {
    unwatch.current?.();
    unwatch.current = null;
    setPending((p) => {
      // Retirer l'invitation : sans cela l'adversaire se verrait proposer une
      // table que plus personne n'attend — et qui n'existe déjà plus en base.
      if (p?.inviteId) void respondInvite(p.inviteId, "cancelled").catch(() => {});
      return null;
    });
    setError(motif);
  }, []);

  /**
   * Le compte à rebours de l'attente.
   *
   * Le serveur supprime la table au bout de `DELAI_ATTENTE_MS` ; sans ce
   * minuteur, l'hôte resterait devant un écran d'attente qui ne mène plus à
   * rien, à guetter un adversaire dont l'invitation a disparu avec la ligne.
   */
  useEffect(() => {
    if (!pending) {
      setResteAttente(0);
      return;
    }
    const echeance = echeanceAttente(pending.match);
    const battre = () => {
      const reste = echeance - Date.now();
      setResteAttente(Math.max(0, Math.ceil(reste / 1000)));
      if (reste > 0) return;
      cesserDAttendre("Personne n'a rejoint : la table a expiré. Vous pouvez réessayer.");
    };
    battre();
    const t = setInterval(battre, 500);
    return () => clearInterval(t);
  }, [pending, cesserDAttendre]);

  const invite = (playerId: string, username: string) => {
    if (!profile) return;
    setBusyInvite(playerId);
    setError(null);
    createMatch(profile.username)
      .then(async (match) => {
        const inviteId = await invitePlayer(playerId, match.id);
        // L'invité a peut-être le téléphone en poche : c'est le seul moment où
        // la notification remplace vraiment l'écran qu'il ne regarde pas.
        void notifier({ type: "invitation", vers: playerId });
        setPending({ match, who: username, inviteId });
        // L'invité accepté rejoint la partie : la ligne se met à jour.
        unwatch.current?.();
        unwatch.current = subscribeMatch(match.id, (row) => {
          if (row.guest_id) enterTable(row.id, "host");
        });
      })
      .catch((e: unknown) => setError(describeError(e, "Invitation impossible.")))
      .finally(() => setBusyInvite(null));
  };

  /* ---------- Partie par code (repli) ---------- */

  const createByCode = () => {
    if (!profile) return;
    setBusyCode(true);
    setError(null);
    createMatch(profile.username)
      .then((match) => {
        setPending({ match, who: "un adversaire", inviteId: null });
        unwatch.current?.();
        unwatch.current = subscribeMatch(match.id, (row) => {
          if (row.guest_id) enterTable(row.id, "host");
        });
      })
      .catch((e: unknown) => setError(describeError(e, "Création impossible.")))
      .finally(() => setBusyCode(false));
  };

  const joinByCode = () => {
    if (!profile) return;
    setBusyCode(true);
    setError(null);
    joinMatch(codeInput, profile.username)
      .then((match) => enterTable(match.id, "guest"))
      .catch((e: unknown) => setError(describeError(e, "Impossible de rejoindre.")))
      .finally(() => setBusyCode(false));
  };

  /* ---------- Rendu ---------- */

  const shell = (children: React.ReactNode) => (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-5 px-6 py-12 text-center">
      <h1 className="gold-text text-4xl">Jouer en ligne</h1>
      {children}
      {/* PR18 — Accès rapide à la boutique depuis le salon. La boutique
          elle-même est aussi accessible via le lien dans le profil joueur. */}
      <div className="flex items-center gap-4">
        <Link to="/classement" className="text-xs text-gold underline">
          Classement
        </Link>
        <Link to="/boutique" className="text-xs text-gold underline">
          Visiter la boutique
        </Link>
      </div>
      <Link to="/" className="text-xs text-gold underline">
        Retour au menu
      </Link>
    </main>
  );

  if (stage === "loading")
    return shell(<p className="text-sm text-muted-foreground">Chargement…</p>);
  if (stage === "signed-out") return shell(<SignInCard error={error} />);
  if (stage === "no-profile")
    return shell(
      <UsernameCard
        onCreated={(p) => {
          setProfile(p);
          setStage("ready");
          void load();
        }}
      />,
    );

  if (pending) {
    return shell(
      <div className="panel w-full space-y-4 px-6 py-6">
        <p className="text-sm text-muted-foreground">En attente de {pending.who}…</p>
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            Code de secours
          </p>
          <p className="gold-text mt-1 font-display text-4xl tracking-[0.25em]">
            {pending.match.code}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          La table s'ouvrira dès que votre adversaire aura accepté.
        </p>
        {/* L'attente a une fin, et on la montre : un écran qui tourne sans
            promesse laisse croire qu'il suffit de patienter encore. */}
        <p className="text-xs text-muted-foreground">
          Sans réponse, la table expire dans{" "}
          <span className="text-accent">
            {Math.floor(resteAttente / 60)}:{String(resteAttente % 60).padStart(2, "0")}
          </span>
          .
        </p>
        <Button variant="secondary" className="w-full" onClick={() => cesserDAttendre(null)}>
          Annuler
        </Button>
      </div>,
    );
  }

  return shell(
    <>
      {profile && (
        <div className="panel w-full space-y-3 px-5 py-3 text-left">
          <div className="flex items-center justify-between gap-3">
            <PlayerAvatar className="h-11 w-11" profile={profile} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-lg text-gold">{profile.username}</p>
              {record && (
                <p className="text-xs text-muted-foreground">
                  {record.wins} victoire{record.wins > 1 ? "s" : ""} · {record.losses} défaite
                  {record.losses > 1 ? "s" : ""}
                </p>
              )}
            </div>
            <span className="shrink-0 font-display text-lg font-semibold text-gold">
              🪙 {profile.tokens}
            </span>
          </div>
          <RankProgressCard
            rating={profile.rating}
            peak={profile.peak_rating}
            ratedGames={profile.rated_games}
          />
        </div>
      )}

      {/* Les invitations reçues s'affichent désormais partout, y compris en
          pleine partie : voir InviteManager, monté à la racine. */}

      {profile &&
        !openMatch &&
        (enRecherche ? (
          <div className="panel w-full px-5 py-4 text-center">
            <p className="text-sm font-semibold text-gold">Recherche d'un adversaire…</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {devant === 0
                ? "Vous êtes le prochain servi. Dès qu'un joueur cherche, la table s'ouvre."
                : `${devant} joueur${devant > 1 ? "s" : ""} devant vous.`}
            </p>
            <Button variant="outline" className="mt-3 w-full" onClick={renoncer}>
              Renoncer
            </Button>
          </div>
        ) : (
          <Button onClick={chercher} className="w-full font-semibold">
            Chercher un adversaire
          </Button>
        ))}

      {openMatch && (
        <div className="panel w-full px-5 py-4 text-left">
          <p className="text-sm font-semibold text-gold">Vous avez une partie en cours</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {openMatch.seat === "host"
              ? (openMatch.match.guest_name ?? "En attente d'un adversaire")
              : openMatch.match.host_name}{" "}
            · code {openMatch.match.code}
          </p>
          <Button
            onClick={() => enterTable(openMatch.match.id, openMatch.seat)}
            className="mt-3 w-full font-semibold"
          >
            Reprendre la partie
          </Button>
        </div>
      )}

      {profile && (
        <FriendsPanel profile={profile} online={online} onInvite={invite} busyInvite={busyInvite} />
      )}

      <details className="panel w-full px-5 py-4 text-left">
        <summary className="cursor-pointer text-sm text-foreground">Jouer avec un code</summary>
        <p className="mt-2 text-xs text-muted-foreground">
          Pour affronter quelqu'un qui n'est pas encore dans vos amis.
        </p>
        <Button
          onClick={createByCode}
          disabled={busyCode}
          variant="secondary"
          className="mt-3 w-full"
        >
          Créer une partie
        </Button>
        <input
          value={codeInput}
          onChange={(e) => setCodeInput(normalizeCode(e.target.value))}
          placeholder="AZ7K2"
          className="mt-3 h-10 w-full rounded-md border border-input bg-background px-3 text-center font-display text-lg tracking-[0.3em] outline-none focus:border-gold"
        />
        <Button
          onClick={joinByCode}
          disabled={busyCode || codeInput.length < 4}
          variant="outline"
          className="mt-2 w-full"
        >
          Rejoindre avec ce code
        </Button>
      </details>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </>,
  );
}
