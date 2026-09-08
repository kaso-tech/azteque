import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RankBadge } from "@/components/azteque/rank";
import { AVATAR_CHOICES, PlayerAvatar } from "@/components/azteque/avatar";
import { itemsOfKind, useCatalogue } from "@/lib/azteque/shop";
import {
  REFERRAL_INVITEE_BONUS,
  REFERRAL_REWARD,
  WELCOME_BONUS,
  clearPendingReferralCode,
  pendingReferralCode,
} from "@/lib/azteque/tokens";
import {
  USERNAME_RULE,
  describeError,
  isUsernameFree,
  PAYS_PROPOSES,
  updateCountry,
  listPurchases,
  setAvatarKind,
  updateUsername,
  acceptFriend,
  createProfile,
  listFriends,
  myReferralCode,
  myReferrals,
  referralLink,
  type Referral,
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
  // Un lien de parrainage porte le code dans l'adresse : le filleul n'a rien à
  // recopier, et le champ reste ouvert pour celui qui l'a reçu autrement.
  const [parrain, setParrain] = useState(pendingReferralCode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = USERNAME_RULE.test(name.trim());

  const submit = () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    createProfile(name, parrain)
      .then((p) => {
        clearPendingReferralCode();
        onCreated(p);
      })
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

      <div className="rounded-lg border border-gold/30 bg-gold/5 px-3 py-3">
        <label htmlFor="parrain" className="block text-xs font-semibold text-foreground">
          Code de parrainage <span className="font-normal text-muted-foreground">(facultatif)</span>
        </label>
        <input
          id="parrain"
          value={parrain}
          maxLength={12}
          onChange={(e) => setParrain(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="ex. K7M2PQ4B"
          className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-center font-display tracking-[0.2em] outline-none focus:border-gold focus:ring-1 focus:ring-ring"
        />
        <p className="mt-2 text-[0.7rem] text-muted-foreground">
          {parrain.trim()
            ? `Avec un code valide, vous recevez ${WELCOME_BONUS + REFERRAL_INVITEE_BONUS} jetons ` +
              `au lieu de ${WELCOME_BONUS} (votre bienvenue plus ${REFERRAL_INVITEE_BONUS} de ` +
              `parrainage), et son propriétaire en reçoit ${REFERRAL_REWARD}.`
            : `Vous commencez avec ${WELCOME_BONUS} jetons de bienvenue — ${
                WELCOME_BONUS + REFERRAL_INVITEE_BONUS
              } avec un code de parrainage valide. Son propriétaire reçoit alors ${REFERRAL_REWARD} jetons.`}
        </p>
      </div>

      <Button className="w-full font-semibold" disabled={!valid || busy} onClick={submit}>
        Valider
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

/* ---------- Parrainage ---------- */

/**
 * Le tableau de bord du parrain : son code, son lien, ses filleuls.
 *
 * Le code n'est demandé à la base qu'à l'ouverture de ce panneau, et c'est
 * cette demande qui le crée pour les comptes ouverts avant le parrainage.
 *
 * Le lien est affiché en clair sous le bouton de copie, et non caché derrière
 * lui : le presse-papiers est refusé dans bien des contextes — page non
 * sécurisée, permission retirée, navigateur intégré à une application — et un
 * bouton qui échoue sans rien montrer laisse le joueur sans recours.
 */
export function ReferralCard() {
  const [code, setCode] = useState<string | null>(null);
  const [filleuls, setFilleuls] = useState<Referral[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);

  useEffect(() => {
    let vivant = true;
    myReferralCode()
      .then((c) => {
        if (!vivant) return;
        setCode(c);
        return myReferrals().then((r) => vivant && setFilleuls(r));
      })
      .catch((e: unknown) => vivant && setError(describeError(e, "Parrainage indisponible.")));
    return () => {
      vivant = false;
    };
  }, []);

  const lien = code ? referralLink(code) : "";
  const gagnes = filleuls.reduce((somme, f) => somme + f.reward, 0);

  const partager = async () => {
    if (!lien) return;
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) {
      // Un partage annulé n'est pas une erreur : l'utilisateur a changé d'avis.
      await nav
        .share({ title: "Aztèque", text: "Viens jouer à l'Aztèque avec moi.", url: lien })
        .catch(() => {});
      return;
    }
    try {
      await navigator.clipboard.writeText(lien);
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
    } catch {
      setError("Copie refusée par le navigateur : sélectionnez le lien ci-dessous.");
    }
  };

  return (
    <div className="mt-6 rounded-lg border border-gold/35 bg-gold/5 px-4 py-4">
      <p className="text-sm font-semibold text-foreground">Parrainage</p>
      <p className="mt-1 text-[0.7rem] text-muted-foreground">
        Chaque joueur qui crée son compte avec votre code vous rapporte {REFERRAL_REWARD} jetons.
        Sans limite de nombre.
      </p>

      {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

      {code === null && !error && (
        <p className="mt-3 text-xs text-muted-foreground">Chargement de votre code…</p>
      )}

      {code && (
        <>
          <p className="mt-3 select-all text-center font-display text-2xl tracking-[0.3em] text-gold">
            {code}
          </p>
          <Button
            type="button"
            className="mt-3 w-full font-semibold"
            onClick={() => void partager()}
          >
            {copie ? "Lien copié" : "Partager mon lien"}
          </Button>
          <input
            readOnly
            value={lien}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Lien de parrainage"
            className="mt-2 h-8 w-full select-all rounded-md border border-input bg-background px-2 text-[0.65rem] text-muted-foreground outline-none"
          />

          <div className="mt-4 flex items-center justify-between text-xs text-foreground">
            <span>
              {filleuls.length} filleul{filleuls.length > 1 ? "s" : ""}
            </span>
            <span className="font-semibold text-gold">🪙 {gagnes} gagnés</span>
          </div>

          {filleuls.length > 0 && (
            <ul className="mt-2 space-y-1">
              {filleuls.map((f) => (
                <li
                  key={f.username + f.created_at}
                  className="flex items-center justify-between rounded-md bg-secondary/40 px-2 py-1 text-[0.7rem]"
                >
                  <span className="truncate text-foreground">{f.username}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {new Date(f.created_at).toLocaleDateString("fr-FR")} · +{f.reward}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
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
  const [pays, setPays] = useState(profile.country ?? "");
  const [busyIdentite, setBusyIdentite] = useState(false);
  const paysModifie = pays !== (profile.country ?? "");
  const nomComplet = [profile.first_name, profile.last_name].filter(Boolean).join(" ");

  const enregistrerPays = () => {
    if (busyIdentite) return;
    setBusyIdentite(true);
    setError(null);
    updateCountry(pays || null)
      .then(onChange)
      .catch((e: unknown) => setError(describeError(e, "Enregistrement impossible.")))
      .finally(() => setBusyIdentite(false));
  };
  // Les avatars achetés rejoignent les deux libres dans le choix.
  const [owned, setOwned] = useState<string[]>([]);
  const catalogue = useCatalogue();
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
    ...itemsOfKind(catalogue, "avatar")
      .filter((a) => owned.includes(a.id))
      .map((a) => ({ kind: a.art ?? a.id, label: a.name })),
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

      <p className="mt-6 text-sm text-foreground">Identité</p>
      <p className="text-xs text-muted-foreground">
        Connue de vous seul : elle ne s'affiche pas aux autres joueurs.
      </p>
      <div className="mt-2 flex h-10 w-full items-center rounded-md border border-input bg-secondary/40 px-3 text-sm text-muted-foreground">
        {nomComplet || "Non fourni par votre compte Google"}
      </div>
      <p className="mt-1 text-[0.68rem] text-muted-foreground">
        Prénom et nom viennent de votre compte Google et ne se modifient pas ici — changez-les sur
        votre compte Google si besoin.
      </p>
      <select
        value={pays}
        onChange={(e) => setPays(e.target.value)}
        aria-label="Pays"
        className="mt-2 h-10 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus:border-gold"
      >
        <option value="">Pays — non précisé</option>
        {PAYS_PROPOSES.map((p) => (
          <option key={p.code} value={p.code}>
            {p.nom}
          </option>
        ))}
      </select>
      {paysModifie && (
        <Button
          size="sm"
          className="mt-2 font-semibold"
          disabled={busyIdentite}
          onClick={enregistrerPays}
        >
          {busyIdentite ? "…" : "Enregistrer le pays"}
        </Button>
      )}

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
