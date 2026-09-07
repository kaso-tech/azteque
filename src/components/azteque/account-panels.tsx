import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RankBadge } from "@/components/azteque/rank";
import { AVATAR_CHOICES, PlayerAvatar } from "@/components/azteque/avatar";
import { SHOP_AVATARS } from "@/lib/azteque/shop";
import {
  USERNAME_RULE,
  describeError,
  isUsernameFree,
  listPurchases,
  setAvatarKind,
  updateUsername,
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
  type PublicProfile,
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

/* ---------- Identité : avatar et pseudo ---------- */

type NameCheck = "vierge" | "invalide" | "verification" | "libre" | "pris" | "erreur";

/**
 * Ce que le joueur montre et sous quel nom : l'avatar et le pseudo, tous deux
 * publics et tous deux modifiables.
 *
 * La disponibilité du pseudo est annoncée pendant la frappe, mais ne vaut que
 * pour l'instant où elle est donnée : c'est l'enregistrement qui tranche, et
 * son refus est affiché tel quel. Mieux vaut une politesse faillible qu'un
 * formulaire qu'on remplit pour rien.
 */
export function AccountIdentity({
  profile,
  onChange,
}: {
  profile: Profile;
  onChange: (p: Profile) => void;
}) {
  const [name, setName] = useState(profile.username);
  // Les avatars achetés rejoignent les deux libres dans le choix.
  const [owned, setOwned] = useState<string[]>([]);
  useEffect(() => {
    listPurchases()
      .then(setOwned)
      .catch(() => setOwned([]));
  }, []);
  const [check, setCheck] = useState<NameCheck>("vierge");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const modifie = name.trim().toLowerCase() !== profile.username.toLowerCase();

  useEffect(() => {
    const q = name.trim();
    if (!modifie) {
      setCheck("vierge");
      return;
    }
    if (!USERNAME_RULE.test(q)) {
      setCheck("invalide");
      return;
    }
    setCheck("verification");
    // Un temps de repos : on n'interroge pas la base à chaque caractère.
    const t = setTimeout(() => {
      isUsernameFree(q)
        .then((libre) => setCheck(libre ? "libre" : "pris"))
        .catch(() => setCheck("erreur"));
    }, 400);
    return () => clearTimeout(t);
  }, [name, modifie]);

  const enregistrer = () => {
    if (busy || !modifie || check === "invalide" || check === "pris") return;
    setBusy(true);
    setError(null);
    updateUsername(name)
      .then((p) => {
        onChange(p);
        setName(p.username);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      })
      .catch((e: unknown) => setError(describeError(e, "Renommage impossible.")))
      .finally(() => setBusy(false));
  };

  const choisirAvatar = (kind: string) => {
    const avant = profile.avatar_kind;
    onChange({ ...profile, avatar_kind: kind });
    setAvatarKind(kind).catch((e: unknown) => {
      onChange({ ...profile, avatar_kind: avant });
      setError(describeError(e, "Changement d'avatar impossible."));
    });
  };

  const aucunePhoto = !profile.avatar_url;
  const choix = [
    ...AVATAR_CHOICES,
    ...SHOP_AVATARS.filter((a) => owned.includes(a.id)).map((a) => ({
      kind: a.id,
      label: a.name,
    })),
  ];

  return (
    <>
      <p className="mt-6 text-sm text-foreground">Photo de profil</p>
      <div className="mt-2 flex flex-wrap gap-3">
        {choix.map(({ kind, label }) => {
          const actif = profile.avatar_kind === kind;
          const indisponible = kind === "google" && aucunePhoto;
          return (
            <button
              key={kind}
              type="button"
              disabled={indisponible}
              onClick={() => choisirAvatar(kind)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg px-2 py-2 transition-colors",
                actif ? "bg-gold/10 ring-1 ring-gold" : "hover:bg-secondary",
                indisponible && "cursor-not-allowed opacity-40",
              )}
              aria-pressed={actif}
            >
              <PlayerAvatar
                className="h-12 w-12"
                profile={{ avatar_kind: kind, avatar_url: profile.avatar_url }}
              />
              <span className="text-[0.7rem] text-muted-foreground">{label}</span>
            </button>
          );
        })}
      </div>
      {aucunePhoto && (
        <p className="mt-1 text-xs text-muted-foreground">
          Aucune photo n'accompagne votre compte Google : choisissez un avatar.
        </p>
      )}
      <p className="mt-1 text-xs text-muted-foreground">
        D'autres visages attendent à la{" "}
        <Link to="/boutique" className="text-gold underline">
          boutique
        </Link>
        .
      </p>

      <label htmlFor="player-name" className="mt-6 block text-sm text-foreground">
        Nom d'utilisateur
      </label>
      <input
        id="player-name"
        value={name}
        maxLength={20}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && enregistrer()}
        className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-gold focus:ring-1 focus:ring-ring"
      />
      <p className="mt-1.5 min-h-4 text-xs">
        {check === "invalide" && (
          <span className="text-destructive">
            3 à 20 caractères : lettres, chiffres, tiret ou souligné.
          </span>
        )}
        {check === "verification" && <span className="text-muted-foreground">Vérification…</span>}
        {check === "libre" && <span className="text-emerald-400">✓ {name.trim()} est libre</span>}
        {check === "pris" && <span className="text-destructive">Ce pseudo est déjà pris.</span>}
        {check === "erreur" && (
          <span className="text-muted-foreground">
            Disponibilité invérifiable ; vous pouvez tout de même essayer.
          </span>
        )}
        {check === "vierge" && saved && (
          <span className="text-emerald-400">✓ Pseudo enregistré</span>
        )}
        {check === "vierge" && !saved && (
          <span className="text-muted-foreground">
            C'est sous ce nom que les autres joueurs vous trouvent.
          </span>
        )}
      </p>
      {modifie && (
        <div className="mt-2 flex gap-2">
          <Button
            size="sm"
            className="font-semibold"
            // Une vérification en échec ne bloque pas : la base tranche, et son
            // refus est affiché tel quel.
            disabled={busy || (check !== "libre" && check !== "erreur")}
            onClick={enregistrer}
          >
            {busy ? "…" : "Enregistrer le pseudo"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setName(profile.username)}>
            Annuler
          </Button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </>
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
  const [results, setResults] = useState<PublicProfile[]>([]);
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
                    <PlayerAvatar className="h-8 w-8" profile={p} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{p.username}</span>
                      <RankBadge rating={p.rating} />
                    </span>
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
                <span className="flex min-w-0 items-center gap-2">
                  <PlayerAvatar className="h-8 w-8" profile={f} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{f.username}</span>
                    <RankBadge rating={f.rating} />
                  </span>
                </span>
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
                    <PlayerAvatar className="h-8 w-8" profile={f} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{f.username}</span>
                      <RankBadge rating={f.rating} />
                    </span>
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
