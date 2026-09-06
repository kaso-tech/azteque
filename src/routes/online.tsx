import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FriendsPanel, SignInCard, UsernameCard } from "@/components/azteque/account-panels";
import {
  acceptInvite,
  claimLocalTokens,
  currentUserId,
  getMyProfile,
  invitePlayer,
  listIncomingInvites,
  myRecord,
  onAuthChange,
  respondInvite,
  subscribeInvites,
  trackLobbyPresence,
  type GameInvite,
  type Profile,
} from "@/lib/azteque/account";
import {
  createMatch,
  joinMatch,
  normalizeCode,
  subscribeMatch,
  type MatchRow,
} from "@/lib/azteque/online";
import { getTokens } from "@/lib/azteque/tokens";

export const Route = createFileRoute("/online")({
  validateSearch: (search: Record<string, unknown>): { code?: string } =>
    typeof search["code"] === "string" ? { code: search["code"] as string } : {},

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
  const { code: codeParam } = Route.useSearch();
  const navigate = useNavigate();

  const [stage, setStage] = useState<Stage>("loading");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [record, setRecord] = useState<{ wins: number; losses: number } | null>(null);
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [invites, setInvites] = useState<GameInvite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyInvite, setBusyInvite] = useState<string | null>(null);

  // Partie créée en attendant que l'invité rejoigne.
  const [pending, setPending] = useState<{ match: MatchRow; who: string } | null>(null);
  const unwatch = useRef<(() => void) | null>(null);

  const [codeInput, setCodeInput] = useState(codeParam ? normalizeCode(codeParam) : "");
  const [busyCode, setBusyCode] = useState(false);

  /* ---------- Session et profil ---------- */

  const load = useCallback(async () => {
    const id = await currentUserId();
    if (!id) {
      setStage("signed-out");
      setProfile(null);
      return;
    }
    const p = await getMyProfile();
    if (!p) {
      setStage("no-profile");
      return;
    }
    setProfile(p);
    setStage("ready");
    // Report unique du solde accumulé avant l'ouverture du compte.
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
    load().catch((e: unknown) =>
      setError(e instanceof Error ? e.message : "Chargement impossible."),
    );
    return onAuthChange(() => {
      void load();
    });
  }, [load]);

  useEffect(() => () => unwatch.current?.(), []);

  /* ---------- Présence et invitations reçues ---------- */

  useEffect(() => {
    if (!profile) return;
    const refresh = () => {
      listIncomingInvites()
        .then(setInvites)
        .catch(() => setInvites([]));
    };
    refresh();
    const offInvites = subscribeInvites(profile.id, refresh);
    const offPresence = trackLobbyPresence(profile.id, setOnline);
    return () => {
      offInvites();
      offPresence();
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

  const invite = (playerId: string, username: string) => {
    if (!profile) return;
    setBusyInvite(playerId);
    setError(null);
    createMatch(profile.username)
      .then(async (match) => {
        await invitePlayer(playerId, match.id);
        setPending({ match, who: username });
        // L'invité accepté rejoint la partie : la ligne se met à jour.
        unwatch.current?.();
        unwatch.current = subscribeMatch(match.id, (row) => {
          if (row.guest_id) enterTable(row.id, "host");
        });
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Invitation impossible."))
      .finally(() => setBusyInvite(null));
  };

  const answer = (inviteId: string, accept: boolean) => {
    setError(null);
    if (!accept) {
      respondInvite(inviteId, "declined")
        .then(() => setInvites((cur) => cur.filter((i) => i.id !== inviteId)))
        .catch(() => setInvites((cur) => cur.filter((i) => i.id !== inviteId)));
      return;
    }
    acceptInvite(inviteId)
      .then((match) => {
        if (!match) throw new Error("Cette partie n'est plus disponible.");
        enterTable(match.id, "guest");
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Impossible de rejoindre."));
  };

  /* ---------- Partie par code (repli) ---------- */

  const createByCode = () => {
    if (!profile) return;
    setBusyCode(true);
    setError(null);
    createMatch(profile.username)
      .then((match) => {
        setPending({ match, who: "un adversaire" });
        unwatch.current?.();
        unwatch.current = subscribeMatch(match.id, (row) => {
          if (row.guest_id) enterTable(row.id, "host");
        });
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Création impossible."))
      .finally(() => setBusyCode(false));
  };

  const joinByCode = () => {
    if (!profile) return;
    setBusyCode(true);
    setError(null);
    joinMatch(codeInput, profile.username)
      .then((match) => enterTable(match.id, "guest"))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Impossible de rejoindre."))
      .finally(() => setBusyCode(false));
  };

  /* ---------- Rendu ---------- */

  const shell = (children: React.ReactNode) => (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-5 px-6 py-12 text-center">
      <h1 className="gold-text text-4xl">Jouer en ligne</h1>
      {children}
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
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => {
            unwatch.current?.();
            unwatch.current = null;
            setPending(null);
          }}
        >
          Annuler
        </Button>
      </div>,
    );
  }

  return shell(
    <>
      {profile && (
        <div className="panel flex w-full items-center justify-between gap-3 px-5 py-3 text-left">
          <div className="min-w-0">
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
      )}

      {invites.length > 0 && (
        <div className="panel w-full space-y-2 px-5 py-4 text-left">
          <p className="text-sm text-foreground">Invitations reçues</p>
          {invites.map((i) => (
            <div
              key={i.id}
              className="flex items-center justify-between gap-2 rounded-md border border-gold/40 px-3 py-2"
            >
              <span className="truncate text-sm">{i.from_username} vous invite</span>
              <span className="flex shrink-0 gap-1">
                <Button size="sm" onClick={() => answer(i.id, true)}>
                  Jouer
                </Button>
                <Button size="sm" variant="outline" onClick={() => answer(i.id, false)}>
                  Refuser
                </Button>
              </span>
            </div>
          ))}
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
