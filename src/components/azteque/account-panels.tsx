import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  USERNAME_RULE,
  describeError,
  acceptFriend,
  createProfile,
  listFriends,
  removeFriend,
  requestFriend,
  searchPlayers,
  signInWithGoogle,
  signOut,
  type Friend,
  type Profile,
} from "@/lib/azteque/account";

/* ---------- Connexion ---------- */

export function SignInCard({ error }: { error?: string | null }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  return (
    <div className="panel w-full space-y-4 px-6 py-6 text-center">
      <h2 className="gold-text text-2xl">Se connecter</h2>
      <p className="text-sm text-muted-foreground">
        Un compte conserve vos jetons, vos amis et l'historique de vos parties d'un appareil à
        l'autre.
      </p>
      <Button
        className="w-full font-semibold"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setFailed(null);
          signInWithGoogle().catch((e: unknown) => {
            setBusy(false);
            setFailed(describeError(e, "Connexion impossible."));
          });
        }}
      >
        Continuer avec Google
      </Button>
      {(failed ?? error) && <p className="text-sm text-destructive">{failed ?? error}</p>}
    </div>
  );
}

/* ---------- Choix du pseudo (première connexion) ---------- */

export function UsernameCard({ onCreated }: { onCreated: (p: Profile) => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = USERNAME_RULE.test(name.trim());

  const submit = () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    createProfile(name)
      .then(onCreated)
      .catch((e: unknown) => setError(describeError(e, "Création impossible.")))
      .finally(() => setBusy(false));
  };

  return (
    <div className="panel w-full space-y-4 px-6 py-6 text-left">
      <div className="text-center">
        <h2 className="gold-text text-2xl">Choisissez votre pseudo</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          C'est le nom sous lequel les autres joueurs vous trouveront. Il est unique et définitif.
        </p>
      </div>
      <input
        value={name}
        autoFocus
        maxLength={20}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="ex. kofi_92"
        className="h-11 w-full rounded-md border border-input bg-background px-3 text-center font-display text-lg tracking-wide outline-none focus:border-gold focus:ring-1 focus:ring-ring"
      />
      <p className="text-xs text-muted-foreground">
        3 à 20 caractères : lettres, chiffres, tiret ou souligné.
      </p>
      <Button className="w-full font-semibold" disabled={!valid || busy} onClick={submit}>
        Valider
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

/* ---------- Amis, recherche et invitations ---------- */

export function FriendsPanel({
  profile,
  online,
  onInvite,
  busyInvite,
}: {
  profile: Profile;
  online: Set<string>;
  /** Crée une partie et y invite ce joueur. */
  onInvite: (playerId: string, username: string) => void;
  busyInvite: string | null;
}) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    listFriends()
      .then(setFriends)
      .catch((e: unknown) => setError(describeError(e, "Liste indisponible.")));
  };
  useEffect(refresh, []);

  // Recherche déclenchée à la frappe, avec un temps de repos pour ne pas
  // interroger la base à chaque caractère.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      searchPlayers(q)
        .then(setResults)
        .catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const act = (p: Promise<unknown>) => {
    setError(null);
    p.then(refresh).catch((e: unknown) => setError(describeError(e, "Action impossible.")));
  };

  const known = new Map(friends.map((f) => [f.id, f] as const));
  const accepted = friends.filter((f) => f.status === "accepted");
  const incoming = friends.filter((f) => f.incoming);

  return (
    <div className="panel w-full space-y-5 px-5 py-5 text-left">
      <div>
        <label htmlFor="player-search" className="text-sm text-foreground">
          Trouver un joueur
        </label>
        <input
          id="player-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Pseudo"
          className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-gold focus:ring-1 focus:ring-ring"
        />
        {results.length > 0 && (
          <ul className="mt-2 space-y-1">
            {results.map((p) => {
              const link = known.get(p.id);
              return (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <OnlineDot on={online.has(p.id)} />
                    <span className="truncate text-sm">{p.username}</span>
                  </span>
                  <span className="flex shrink-0 gap-1">
                    {!link && (
                      <Button size="sm" variant="outline" onClick={() => act(requestFriend(p.id))}>
                        Ajouter
                      </Button>
                    )}
                    {link?.status === "pending" && (
                      <span className="text-xs text-muted-foreground">En attente</span>
                    )}
                    <Button
                      size="sm"
                      disabled={busyInvite === p.id}
                      onClick={() => onInvite(p.id, p.username)}
                    >
                      Inviter
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {incoming.length > 0 && (
        <div>
          <p className="text-sm text-foreground">Demandes reçues</p>
          <ul className="mt-2 space-y-1">
            {incoming.map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between gap-2 rounded-md border border-gold/40 px-3 py-2"
              >
                <span className="truncate text-sm">{f.username}</span>
                <span className="flex shrink-0 gap-1">
                  <Button size="sm" onClick={() => act(acceptFriend(f.id))}>
                    Accepter
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => act(removeFriend(f.id))}>
                    Refuser
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="text-sm text-foreground">
          Mes amis{" "}
          {accepted.length > 0 && (
            <span className="text-muted-foreground">({accepted.length})</span>
          )}
        </p>
        {accepted.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Cherchez un joueur par son pseudo pour l'ajouter.
          </p>
        ) : (
          <ul className="mt-2 space-y-1">
            {[...accepted]
              .sort((a, b) => Number(online.has(b.id)) - Number(online.has(a.id)))
              .map((f) => (
                <li
                  key={f.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <OnlineDot on={online.has(f.id)} />
                    <span className="truncate text-sm">{f.username}</span>
                  </span>
                  <span className="flex shrink-0 gap-1">
                    <Button
                      size="sm"
                      disabled={busyInvite === f.id}
                      onClick={() => onInvite(f.id, f.username)}
                    >
                      Inviter
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => act(removeFriend(f.id))}>
                      Retirer
                    </Button>
                  </span>
                </li>
              ))}
          </ul>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <p className="text-[0.7rem] text-muted-foreground">
        Connecté en tant que <span className="text-gold">{profile.username}</span> ·{" "}
        <button type="button" onClick={() => void signOut()} className="underline">
          se déconnecter
        </button>
      </p>
    </div>
  );
}

function OnlineDot({ on }: { on: boolean }) {
  return (
    <span
      aria-label={on ? "En ligne" : "Hors ligne"}
      className={cn(
        "h-2 w-2 shrink-0 rounded-full",
        on ? "bg-emerald-400 shadow-[0_0_6px_rgb(52_211_153_/_0.8)]" : "bg-muted-foreground/40",
      )}
    />
  );
}
