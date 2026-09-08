import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PlayerAvatar } from "@/components/azteque/avatar";
import { Sticker } from "@/components/azteque/stickers";
import { RankBadge } from "@/components/azteque/rank";
import { rankOf } from "@/lib/azteque/rank";
import { describeError } from "@/lib/azteque/account";
import { loadCatalogue, useCatalogue, type ShopItem, type ShopKind } from "@/lib/azteque/shop";
import {
  DEFAULT_SOUND_SETTINGS,
  SOUND_CONTEXTS,
  SOUND_CONTEXT_LABELS,
  SOUND_EXTRAS,
  SOUND_IDS,
  SOUND_LABELS,
  SOUND_RANGES,
  SOUND_TUNING_LABELS,
  currentSoundSettings,
  setSoundContext,
  sfx,
  applySoundSettings,
  clearSample,
  hasSample,
  registerSample,
  type SoundContext,
  type SoundId,
  type SoundSettings,
  type SoundTuning,
} from "@/lib/azteque/sfx";
import {
  adminClearSoundFile,
  adminGrantTokens,
  adminListItems,
  adminListPlayers,
  adminLog,
  adminSaveSoundSettings,
  adminSetAdmin,
  adminSetBanned,
  adminSetItem,
  adminSetSoundFile,
  adminUpsertItem,
  adminDeleteItem,
  estEnLigne,
  adminAccess,
  adminStats,
  listSoundFiles,
  SON_MAX_OCTETS,
  type AdminAccess,
  type AdminLogEntry,
  type AdminPlayer,
  type AdminShopItem,
  type AdminStats,
  type SoundFileInfo,
} from "@/lib/azteque/admin";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Administration — Aztèque" }] }),
  component: Administration,
});

type Onglet = "joueurs" | "boutique" | "sons" | "journal";

function Administration() {
  const [acces, setAcces] = useState<AdminAccess | null>(null);
  const [onglet, setOnglet] = useState<Onglet>("joueurs");
  const [erreur, setErreur] = useState<string | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);

  useEffect(() => {
    adminAccess()
      .then((a) => {
        setAcces(a);
        if (a.state === "admin") {
          adminStats()
            .then(setStats)
            .catch(() => setStats(null));
        }
      })
      .catch(() => setAcces({ state: "anonymous" }));
  }, []);

  const coque = (contenu: React.ReactNode) => (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-4 px-4 py-6">
      <header className="flex items-center justify-between gap-3">
        <Link to="/" className="text-sm text-muted-foreground underline">
          ← Menu
        </Link>
        <h1 className="gold-text font-display text-2xl">Administration</h1>
        <span className="w-12" />
      </header>
      {contenu}
    </main>
  );

  if (!acces) {
    return coque(<p className="mt-10 text-center text-sm text-muted-foreground">Vérification…</p>);
  }

  if (acces.state !== "admin") return coque(<PorteFermee acces={acces} />);

  const onglets: { id: Onglet; label: string }[] = [
    { id: "joueurs", label: "Joueurs" },
    { id: "boutique", label: "Boutique" },
    { id: "sons", label: "Sons" },
    { id: "journal", label: "Journal" },
  ];

  return coque(
    <>
      {stats && (
        <div className="panel grid grid-cols-2 gap-3 px-4 py-3 sm:grid-cols-4">
          {[
            ["Joueurs", stats.players],
            ["Suspendus", stats.banned],
            ["Jetons en circulation", stats.tokens],
            ["Achats", stats.purchases],
            ["Parties", stats.matches],
            ["Parties terminées", stats.finished],
            ["Actifs (7 j)", stats.active_7d],
            ["Administrateurs", stats.admins],
          ].map(([label, valeur]) => (
            <div key={String(label)}>
              <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">
                {label}
              </p>
              <p className="font-display text-lg text-gold">
                {Number(valeur).toLocaleString("fr")}
              </p>
            </div>
          ))}
        </div>
      )}

      <nav className="flex flex-wrap gap-2">
        {onglets.map((o) => (
          <Button
            key={o.id}
            size="sm"
            variant={onglet === o.id ? "default" : "outline"}
            onClick={() => setOnglet(o.id)}
          >
            {o.label}
          </Button>
        ))}
      </nav>

      {erreur && <p className="text-sm text-destructive">{erreur}</p>}

      {onglet === "joueurs" && <Joueurs onErreur={setErreur} />}
      {onglet === "boutique" && <Boutique onErreur={setErreur} />}
      {onglet === "sons" && <Sons onErreur={setErreur} />}
      {onglet === "journal" && <Journal onErreur={setErreur} />}
    </>,
  );
}

/**
 * L'écran de porte fermée.
 *
 * Il ne se contente pas de refuser : il dit laquelle des trois causes
 * s'applique et ce qu'elle demande. Un refus qui n'explique rien fait chercher
 * du côté du code ce qui se règle en une requête.
 */
function PorteFermee({ acces }: { acces: Exclude<AdminAccess, { state: "admin" }> }) {
  const [copie, setCopie] = useState(false);
  const requete =
    acces.state === "not-admin" && acces.username
      ? `UPDATE public.profiles SET is_admin = true WHERE lower(username) = '${acces.username.toLowerCase()}';`
      : "UPDATE public.profiles SET is_admin = true WHERE lower(username) = 'votre_pseudo';";

  if (acces.state === "anonymous") {
    return (
      <div className="panel mt-6 space-y-3 px-6 py-6 text-center">
        <h2 className="gold-text font-display text-xl">Connectez-vous d'abord</h2>
        <p className="text-sm text-muted-foreground">
          La console reconnaît les administrateurs à leur compte. Sans session ouverte, elle ne peut
          rien vérifier.
        </p>
        <Link
          to="/online"
          className="inline-block rounded-full border border-gold/50 px-6 py-2 font-display text-sm font-semibold text-gold"
        >
          Se connecter
        </Link>
      </div>
    );
  }

  if (acces.state === "missing-migration") {
    return (
      <div className="panel mt-6 space-y-3 px-6 py-6 text-left">
        <h2 className="gold-text text-center font-display text-xl">Migration à appliquer</h2>
        <p className="text-sm text-muted-foreground">
          La base ne connaît pas encore les fonctions d'administration : le fichier
          <span className="text-foreground">
            {" "}
            supabase/migrations/20260907160000_administration.sql{" "}
          </span>
          n'a pas été appliqué sur ce projet Supabase. Appliquez-le, puis rechargez cette page.
        </p>
        <p className="text-xs text-muted-foreground">
          Le pas suivant sera de vous désigner administrateur ; cette page vous donnera alors la
          requête à exécuter.
        </p>
      </div>
    );
  }

  return (
    <div className="panel mt-6 space-y-3 px-6 py-6 text-left">
      <h2 className="gold-text text-center font-display text-xl">Il vous manque le droit</h2>
      <p className="text-sm text-muted-foreground">
        Votre compte existe bien{acces.username ? ` — ${acces.username} — ` : " "}mais il n'est pas
        administrateur. Le premier administrateur ne peut pas être nommé depuis cette console : il
        n'y en a aucun pour le faire. Exécutez ceci dans l'éditeur SQL de votre projet Supabase,
        puis rechargez :
      </p>
      <pre className="overflow-x-auto rounded-md border border-border bg-background px-3 py-2 text-[0.7rem] text-foreground">
        {requete}
      </pre>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          void navigator.clipboard?.writeText(requete).then(() => {
            setCopie(true);
            setTimeout(() => setCopie(false), 2000);
          });
        }}
      >
        {copie ? "✓ Copié" : "Copier la requête"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Les administrateurs suivants se nomment depuis la console, sans SQL.
      </p>
    </div>
  );
}

/* ---------- Joueurs ---------- */

/** Le peu de pays qu'on nomme en toutes lettres ; les autres gardent leur code. */
const PAYS: Record<string, string> = {
  CI: "Côte d'Ivoire",
  TG: "Togo",
  BJ: "Bénin",
  BF: "Burkina Faso",
  GH: "Ghana",
  ML: "Mali",
  NE: "Niger",
  NG: "Nigéria",
  SN: "Sénégal",
  CM: "Cameroun",
  GN: "Guinée",
  FR: "France",
  BE: "Belgique",
  CA: "Canada",
  US: "États-Unis",
};

/** « Vu il y a… », ou l'aveu qu'on ne l'a jamais vu. */
function vuIlYA(iso: string | null): string {
  if (!iso) return "jamais vu";
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 60) return `vu il y a ${minutes} min`;
  const heures = Math.floor(minutes / 60);
  if (heures < 24) return `vu il y a ${heures} h`;
  return `vu il y a ${Math.floor(heures / 24)} j`;
}

function Joueurs({ onErreur }: { onErreur: (e: string | null) => void }) {
  const [query, setQuery] = useState("");
  const [liste, setListe] = useState<AdminPlayer[]>([]);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [montant, setMontant] = useState("500");
  const [motif, setMotif] = useState("");
  const [busy, setBusy] = useState(false);

  const charger = useCallback(
    (q: string) => {
      adminListPlayers(q, 100)
        .then(setListe)
        .catch((e: unknown) => onErreur(describeError(e, "Liste indisponible.")));
    },
    [onErreur],
  );

  useEffect(() => {
    const t = setTimeout(() => charger(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query, charger]);

  const agir = (p: Promise<unknown>) => {
    setBusy(true);
    onErreur(null);
    p.then(() => charger(query.trim()))
      .catch((e: unknown) => onErreur(describeError(e, "Action impossible.")))
      .finally(() => setBusy(false));
  };

  return (
    <section className="panel space-y-3 px-4 py-4">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Chercher un pseudo…"
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-gold"
      />
      <p className="text-xs text-muted-foreground">
        {liste.length} joueur{liste.length > 1 ? "s" : ""}
      </p>

      <ul className="space-y-2">
        {liste.map((j) => (
          <li key={j.id} className="rounded-lg border border-border">
            <button
              type="button"
              onClick={() => setOuvert(ouvert === j.id ? null : j.id)}
              className="flex w-full items-center gap-3 px-3 py-2 text-left"
            >
              <PlayerAvatar className="h-10 w-10" profile={j} />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2">
                  <span
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      estEnLigne(j)
                        ? "bg-emerald-400 shadow-[0_0_6px_rgb(52_211_153_/_0.8)]"
                        : "bg-muted-foreground/40",
                    )}
                    aria-label={estEnLigne(j) ? "En ligne" : "Hors ligne"}
                  />
                  <span className="truncate text-sm font-semibold text-foreground">
                    {j.username}
                  </span>
                  {j.is_admin && <span className="text-[0.62rem] text-gold">ADMIN</span>}
                  {j.banned && <span className="text-[0.62rem] text-destructive">SUSPENDU</span>}
                </span>
                <span className="block truncate text-[0.68rem] text-muted-foreground">
                  {[j.first_name, j.last_name].filter(Boolean).join(" ") ||
                    "Identité non renseignée"}
                  {j.country ? ` · ${PAYS[j.country] ?? j.country}` : ""}
                </span>
                <RankBadge rating={j.rating} />
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-display text-sm text-gold">🪙 {j.tokens}</span>
                <span className="block text-[0.62rem] text-muted-foreground">
                  {j.rounds_played} tours · {j.rated_games} champs
                </span>
                <span className="block text-[0.62rem] text-muted-foreground">
                  {j.purchases} achats · {estEnLigne(j) ? "en ligne" : vuIlYA(j.last_seen_at)}
                </span>
              </span>
            </button>

            {ouvert === j.id && (
              <div className="space-y-2 border-t border-border px-3 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={montant}
                    onChange={(e) => setMontant(e.target.value)}
                    inputMode="numeric"
                    className="h-9 w-24 rounded-md border border-input bg-background px-2 text-sm"
                    aria-label="Montant"
                  />
                  <input
                    value={motif}
                    onChange={(e) => setMotif(e.target.value)}
                    placeholder="Motif (consigné au journal)"
                    className="h-9 min-w-40 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                  />
                  <Button
                    size="sm"
                    disabled={busy || !Number(montant)}
                    onClick={() => agir(adminGrantTokens(j.id, Number(montant), motif))}
                  >
                    Envoyer
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || !Number(montant)}
                    onClick={() => agir(adminGrantTokens(j.id, -Number(montant), motif))}
                  >
                    Retirer
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => agir(adminSetBanned(j.id, !j.banned))}
                  >
                    {j.banned ? "Rétablir" : "Suspendre"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => agir(adminSetAdmin(j.id, !j.is_admin))}
                  >
                    {j.is_admin ? "Retirer l'administration" : "Nommer administrateur"}
                  </Button>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[0.68rem] sm:grid-cols-3">
                  {[
                    ["Nom d'utilisateur", j.username],
                    ["Nom et prénom", [j.first_name, j.last_name].filter(Boolean).join(" ") || "—"],
                    ["Pays", j.country ? (PAYS[j.country] ?? j.country) : "—"],
                    ["Niveau", `${rankOf(j.rating).name} (${j.rating})`],
                    ["Jetons", String(j.tokens)],
                    ["Tours joués", String(j.rounds_played)],
                    ["Champs classés", String(j.rated_games)],
                    ["Achats", String(j.purchases)],
                    ["Statut", estEnLigne(j) ? "En ligne" : vuIlYA(j.last_seen_at)],
                    [
                      "Inscrit le",
                      j.created_at ? new Date(j.created_at).toLocaleDateString("fr") : "—",
                    ],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="truncate text-foreground">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------- Boutique ---------- */

/** Les dessins que le jeu sait rendre : un article nouveau leur emprunte. */
const DESSINS_AVATAR = ["av_marchand", "av_reine", "av_griot", "av_elegante", "av_roi"];
const DESSINS_STICKER = ["st_bravo", "st_rire", "st_pitie", "st_atout", "st_feu", "st_couronne"];

interface Brouillon {
  id: string;
  kind: ShopKind;
  name: string;
  hint: string;
  price: string;
  active: boolean;
  art: string;
  phrases: string;
  sort: string;
  nouveau: boolean;
}

function brouillonDe(i: ShopItem): Brouillon {
  return {
    id: i.id,
    kind: i.kind,
    name: i.name,
    hint: i.hint,
    price: String(i.price),
    active: i.active,
    art: i.art ?? "",
    phrases: (i.phrases ?? []).join("\n"),
    sort: String(i.sort),
    nouveau: false,
  };
}

function brouillonNeuf(kind: ShopKind, sort: number): Brouillon {
  return {
    id: "",
    kind,
    name: "",
    hint: "",
    price: "500",
    active: true,
    art: kind === "avatar" ? DESSINS_AVATAR[0]! : kind === "sticker" ? DESSINS_STICKER[0]! : "",
    phrases: "",
    sort: String(sort),
    nouveau: true,
  };
}

/**
 * Le catalogue, modifiable et extensible.
 *
 * Tout y est éditable : le nom, la description, le prix, la mise en vente,
 * l'ordre, et selon la nature les phrases d'un lot ou le dessin emprunté au
 * jeu. Un article nouveau se crée du même geste — le serveur ne distingue pas
 * la création de la modification.
 *
 * Les dessins, eux, restent dans le code : on ne dessine pas un avatar depuis
 * une page web. Un article nouveau choisit donc parmi ceux qui existent, ce qui
 * suffit à composer des variantes et des éditions.
 */
function Boutique({ onErreur }: { onErreur: (e: string | null) => void }) {
  const catalogue = useCatalogue();
  const [brouillon, setBrouillon] = useState<Brouillon | null>(null);
  const [busy, setBusy] = useState(false);

  const rafraichir = () => void loadCatalogue(true);

  const enregistrer = () => {
    if (!brouillon || busy) return;
    const phrases = brouillon.phrases
      .split("\n")
      .map((p) => p.trim())
      .filter(Boolean);
    if (brouillon.kind === "messages" && phrases.length === 0) {
      onErreur("Un lot de messages doit contenir au moins une phrase.");
      return;
    }
    setBusy(true);
    onErreur(null);
    adminUpsertItem({
      id: brouillon.id.trim(),
      kind: brouillon.kind,
      price: Number(brouillon.price) || 0,
      active: brouillon.active,
      name: brouillon.name.trim(),
      hint: brouillon.hint.trim(),
      data: brouillon.kind === "messages" ? { phrases } : { art: brouillon.art },
      sort: Number(brouillon.sort) || 0,
    })
      .then(() => {
        rafraichir();
        setBrouillon(null);
      })
      .catch((e: unknown) => onErreur(describeError(e, "Enregistrement impossible.")))
      .finally(() => setBusy(false));
  };

  const supprimer = (id: string) => {
    setBusy(true);
    onErreur(null);
    adminDeleteItem(id)
      .then(() => {
        rafraichir();
        setBrouillon(null);
      })
      .catch((e: unknown) => onErreur(describeError(e, "Suppression impossible.")))
      .finally(() => setBusy(false));
  };

  const champ = (
    label: string,
    valeur: string,
    onChange: (v: string) => void,
    props: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <label className="block text-[0.68rem] text-muted-foreground">
      {label}
      <input
        value={valeur}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
        {...props}
      />
    </label>
  );

  const apercu = (b: Brouillon) =>
    b.kind === "messages" ? (
      <span className="text-2xl">💬</span>
    ) : b.kind === "avatar" ? (
      <PlayerAvatar className="h-12 w-12" profile={{ avatar_kind: b.art }} />
    ) : (
      <Sticker id={b.art} className="h-11 w-11" />
    );

  return (
    <section className="panel space-y-3 px-4 py-4">
      <p className="text-xs text-muted-foreground">
        Le catalogue vit en base : c'est ce prix-là qui débite. Un article retiré de la vente reste
        acquis à ceux qui l'ont déjà ; il ne se supprime que s'il n'a jamais été acheté.
      </p>

      <div className="flex flex-wrap gap-2">
        {(["avatar", "sticker", "messages"] as const).map((k) => (
          <Button
            key={k}
            size="sm"
            variant="outline"
            onClick={() =>
              setBrouillon(brouillonNeuf(k, Math.max(0, ...catalogue.map((i) => i.sort)) + 10))
            }
          >
            + {k === "avatar" ? "Avatar" : k === "sticker" ? "Sticker" : "Lot de messages"}
          </Button>
        ))}
      </div>

      {brouillon && (
        <div className="space-y-2 rounded-lg border border-gold/50 bg-gold/5 p-3">
          <div className="flex items-center gap-3">
            {apercu(brouillon)}
            <p className="font-display text-lg text-gold">
              {brouillon.nouveau ? "Nouvel article" : brouillon.id}
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {brouillon.nouveau &&
              champ("Identifiant (minuscules, chiffres, souligné)", brouillon.id, (v) =>
                setBrouillon({ ...brouillon, id: v }),
              )}
            {champ("Nom", brouillon.name, (v) => setBrouillon({ ...brouillon, name: v }))}
            {champ("Description", brouillon.hint, (v) => setBrouillon({ ...brouillon, hint: v }))}
            {champ("Prix", brouillon.price, (v) => setBrouillon({ ...brouillon, price: v }), {
              inputMode: "numeric",
            })}
            {champ("Ordre d'affichage", brouillon.sort, (v) =>
              setBrouillon({ ...brouillon, sort: v }),
            )}
          </div>

          {brouillon.kind === "messages" ? (
            <label className="block text-[0.68rem] text-muted-foreground">
              Phrases, une par ligne
              <textarea
                value={brouillon.phrases}
                onChange={(e) => setBrouillon({ ...brouillon, phrases: e.target.value })}
                rows={6}
                className="mt-0.5 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground"
              />
            </label>
          ) : (
            <div>
              <p className="text-[0.68rem] text-muted-foreground">Dessin</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {(brouillon.kind === "avatar" ? DESSINS_AVATAR : DESSINS_STICKER).map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setBrouillon({ ...brouillon, art: a })}
                    className={cn(
                      "rounded-lg p-1",
                      brouillon.art === a ? "ring-1 ring-gold" : "hover:bg-secondary",
                    )}
                  >
                    {brouillon.kind === "avatar" ? (
                      <PlayerAvatar className="h-10 w-10" profile={{ avatar_kind: a }} />
                    ) : (
                      <Sticker id={a} className="h-9 w-9" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={busy} onClick={enregistrer} className="font-semibold">
              {busy ? "…" : "Enregistrer"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setBrouillon({ ...brouillon, active: !brouillon.active })}
            >
              {brouillon.active ? "En vente" : "Retiré"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setBrouillon(null)}>
              Annuler
            </Button>
            {!brouillon.nouveau && (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => supprimer(brouillon.id)}
                className="text-destructive"
              >
                Supprimer
              </Button>
            )}
          </div>
        </div>
      )}

      <ul className="space-y-2">
        {catalogue.map((i) => (
          <li
            key={i.id}
            className={cn(
              "flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2",
              i.active ? "border-border" : "border-destructive/40 bg-destructive/5",
            )}
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center">
              {i.kind === "avatar" ? (
                <PlayerAvatar className="h-10 w-10" profile={{ avatar_kind: i.art ?? i.id }} />
              ) : i.kind === "sticker" ? (
                <Sticker id={i.art ?? i.id} className="h-9 w-9" />
              ) : (
                <span className="text-2xl">💬</span>
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-foreground">{i.name}</span>
              <span className="block truncate text-[0.66rem] text-muted-foreground">
                {i.id} · {i.hint}
                {i.kind === "messages" ? ` · ${(i.phrases ?? []).length} phrases` : ""}
              </span>
            </span>
            <span className="shrink-0 font-display text-sm text-gold">🪙 {i.price}</span>
            <Button size="sm" variant="outline" onClick={() => setBrouillon(brouillonDe(i))}>
              Modifier
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------- Sons ---------- */

const VOYELLES_LABELS = ["a", "e", "o"];

/** Ce que valent les réglages propres à chaque son quand nul n'y a touché. */
const DEFAUTS_AFFICHES: Partial<Record<SoundId, Partial<SoundTuning>>> = {
  snicker: { syllables: 3, step: 0.9, vowel: 1 },
  chuckle: { syllables: 4, step: 1.02, vowel: 1 },
  taunt: { syllables: 5, step: 0.9, vowel: 0 },
  cheer: { voices: 14, claps: 80 },
  trumpLaugh: { syllables: 2, step: 1.08, vowel: 0 },
  sweepLaugh: { syllables: 4, step: 0.92, vowel: 0 },
  landslideLaugh: { syllables: 7, step: 0.94, vowel: 0 },
  streakLaugh: { syllables: 4, step: 0.97, vowel: 1 },
  streakLaugh4: { syllables: 5, step: 0.95, vowel: 1 },
  streakLaugh5: { syllables: 6, step: 0.93, vowel: 1 },
};

/**
 * Le type d'un fichier, quand le navigateur ne le dit pas.
 *
 * Certains navigateurs remettent une chaîne vide pour un fichier glissé depuis
 * un dossier ; la base, elle, exige un type qui commence par « audio/ ». On le
 * déduit du nom plutôt que de refuser un son parfaitement lisible.
 */
const MIMES: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  webm: "audio/webm",
  m4a: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
};

function typeDuFichier(f: File): string {
  if (f.type.startsWith("audio/")) return f.type;
  const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
  return MIMES[ext] ?? "audio/mpeg";
}

function poids(octets: number): string {
  return octets >= 1024 * 1024
    ? `${(octets / (1024 * 1024)).toFixed(1)} Mo`
    : `${Math.max(1, Math.round(octets / 1024))} ko`;
}

function Sons({ onErreur }: { onErreur: (e: string | null) => void }) {
  const [profil, setProfil] = useState<SoundContext>("ia");
  const [reglages, setReglages] = useState<SoundSettings>(() => currentSoundSettings("ia"));
  const [busy, setBusy] = useState(false);
  const [enregistre, setEnregistre] = useState(false);
  const [fichiers, setFichiers] = useState<Record<string, SoundFileInfo>>({});
  const [occupe, setOccupe] = useState<SoundId | null>(null);

  // Le profil affiché doit aussi être celui qu'on entend en cliquant sur
  // « Écouter » : la console bascule le contexte actif en même temps qu'elle
  // recharge ses réglages et ses fichiers.
  useEffect(() => {
    setSoundContext(profil);
    setReglages(currentSoundSettings(profil));
    listSoundFiles(profil)
      .then((l) => setFichiers(Object.fromEntries(l.map((f) => [f.id, f]))))
      .catch(() => setFichiers({}));
  }, [profil]);

  // L'aperçu doit s'entendre tel qu'il sera : on applique avant de jouer.
  const ecouter = (id: SoundId) => {
    applySoundSettings(reglages, profil);
    sfx[id]();
  };

  /**
   * Installe un fichier à la place d'un son.
   *
   * Il est décodé d'abord, envoyé ensuite : un fichier que le navigateur
   * n'ouvre pas deviendrait un silence chez tous les joueurs, et l'on ne
   * s'en apercevrait qu'en jouant.
   */
  const televerser = async (id: SoundId, f: File) => {
    onErreur(null);
    setOccupe(id);
    try {
      if (f.size > SON_MAX_OCTETS) {
        throw new Error(
          `« ${f.name} » pèse ${poids(f.size)} : ${poids(SON_MAX_OCTETS)} au maximum, ` +
            "puisque chaque joueur le télécharge à l'ouverture.",
        );
      }
      const octets = await f.arrayBuffer();
      await registerSample(id, octets, profil);
      const mime = typeDuFichier(f);
      const info = await adminSetSoundFile(id, mime, octets, profil);
      setFichiers((x) => ({ ...x, [id]: info }));
      sfx[id]();
    } catch (e: unknown) {
      // Le son revient à sa synthèse : mieux vaut l'ancien effet qu'un silence.
      clearSample(id, profil);
      setFichiers((x) => {
        const { [id]: _, ...reste } = x;
        return reste;
      });
      onErreur(describeError(e, "Installation impossible."));
    } finally {
      setOccupe(null);
    }
  };

  const retirer = (id: SoundId) => {
    onErreur(null);
    setOccupe(id);
    adminClearSoundFile(id, profil)
      .then(() => {
        clearSample(id, profil);
        setFichiers((x) => {
          const { [id]: _, ...reste } = x;
          return reste;
        });
      })
      .catch((e: unknown) => onErreur(describeError(e, "Retrait impossible.")))
      .finally(() => setOccupe(null));
  };

  const valeur = (id: SoundId, axe: keyof SoundTuning) =>
    reglages.sounds[id]?.[axe] ?? DEFAUTS_AFFICHES[id]?.[axe] ?? 1;

  const regler = (id: SoundId, axe: keyof SoundTuning, v: number) =>
    setReglages((r) => ({
      ...r,
      sounds: { ...r.sounds, [id]: { ...(r.sounds[id] ?? {}), [axe]: v } },
    }));

  const enregistrer = () => {
    setBusy(true);
    onErreur(null);
    adminSaveSoundSettings(reglages, profil)
      .then(() => {
        setEnregistre(true);
        setTimeout(() => setEnregistre(false), 2500);
      })
      .catch((e: unknown) => onErreur(describeError(e, "Enregistrement impossible.")))
      .finally(() => setBusy(false));
  };

  const curseur = (
    label: string,
    v: number,
    min: number,
    max: number,
    pas: number,
    onChange: (v: number) => void,
    libelles?: string[],
  ) => (
    <label className="flex items-center gap-2 text-[0.68rem] text-muted-foreground">
      <span className="w-24 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={pas}
        value={v}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 min-w-0 flex-1 accent-[var(--gold)]"
      />
      <span className="w-12 shrink-0 text-right tabular-nums text-foreground">
        {libelles ? (libelles[Math.round(v)] ?? v) : pas >= 1 ? Math.round(v) : v.toFixed(2)}
      </span>
    </label>
  );

  return (
    <section className="panel space-y-4 px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        {SOUND_CONTEXTS.map((c) => (
          <Button
            key={c}
            size="sm"
            variant={profil === c ? "default" : "outline"}
            onClick={() => setProfil(c)}
            className={cn(profil === c && "font-semibold")}
          >
            {SOUND_CONTEXT_LABELS[c]}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Deux jeux de sons indépendants : l'un pour affronter l'IA, l'autre pour le jeu en ligne.
        Chaque réglage et chaque fichier ci-dessous ne vaut que pour le profil sélectionné.
      </p>

      <div>
        <p className="text-sm text-foreground">Volume général</p>
        {curseur("Tous", reglages.master, 0, 2, 0.05, (v) =>
          setReglages((r) => ({ ...r, master: v })),
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          Chaque son se règle sur trois axes : le volume, la hauteur et la vitesse. 1,00 est la
          valeur d'origine. Les réglages valent pour tous les joueurs dès l'enregistrement.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Chaque son peut aussi être remplacé par un fichier local — un vrai rire, de vraies
          acclamations. Le fichier s'installe aussitôt, sans passer par « Enregistrer », et le
          retirer rend au son sa synthèse. {poids(SON_MAX_OCTETS)} au maximum : ce sont des effets
          d'une ou deux secondes, que chaque joueur télécharge à l'ouverture.
        </p>
      </div>

      <ul className="space-y-3">
        {SOUND_IDS.map((id) => {
          const fichier = fichiers[id];
          const axes: (keyof SoundTuning)[] = fichier
            ? ["gain", "pitch", "speed"]
            : ["gain", "pitch", "speed", ...SOUND_EXTRAS[id]];
          return (
            <li key={id} className="rounded-lg border border-border px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">{SOUND_LABELS[id]}</p>
                <Button size="sm" variant="outline" onClick={() => ecouter(id)}>
                  ▶ Écouter
                </Button>
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <label
                  className={cn(
                    "cursor-pointer rounded-full border border-gold/50 px-3 py-1 text-[0.68rem] text-gold",
                    occupe === id && "pointer-events-none opacity-60",
                  )}
                >
                  {occupe === id ? "…" : fichier ? "Remplacer le fichier" : "Choisir un fichier"}
                  <input
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      // Le champ est vidé pour que reprendre le même fichier
                      // après une erreur relance bien l'installation.
                      e.target.value = "";
                      if (f) void televerser(id, f);
                    }}
                  />
                </label>
                {fichier ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={occupe === id}
                    onClick={() => retirer(id)}
                    className="h-7 px-2 text-[0.68rem]"
                  >
                    Retirer
                  </Button>
                ) : (
                  <span className="text-[0.68rem] text-muted-foreground">Son synthétisé</span>
                )}
              </div>
              {fichier && (
                <p className="mt-1 truncate text-[0.68rem] text-muted-foreground">
                  🎵 {(fichier.path.split(".").pop() ?? "").toUpperCase()} · {poids(fichier.bytes)}
                  {/* Le fichier est déposé mais pas dans cette page : elle a
                      été ouverte avant qu'il n'y soit. */}
                  {!hasSample(id, profil) && " · rechargez la page pour l'entendre"}
                </p>
              )}

              <div className="mt-1.5 space-y-1">
                {axes.map((axe) => {
                  const b = SOUND_RANGES[axe];
                  return (
                    <div key={axe}>
                      {curseur(
                        SOUND_TUNING_LABELS[axe],
                        valeur(id, axe),
                        b.min,
                        b.max,
                        b.step,
                        (v) => regler(id, axe, v),
                        axe === "vowel" ? VOYELLES_LABELS : undefined,
                      )}
                    </div>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={busy} onClick={enregistrer} className="font-semibold">
          {busy ? "…" : "Enregistrer pour tous"}
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            applySoundSettings(DEFAULT_SOUND_SETTINGS, profil);
            setReglages(currentSoundSettings(profil));
          }}
        >
          Valeurs d'origine
        </Button>
        {enregistre && <span className="text-sm text-emerald-400">✓ Enregistré</span>}
      </div>
    </section>
  );
}

/* ---------- Journal ---------- */

function Journal({ onErreur }: { onErreur: (e: string | null) => void }) {
  const [lignes, setLignes] = useState<AdminLogEntry[]>([]);

  useEffect(() => {
    adminLog(100)
      .then(setLignes)
      .catch((e: unknown) => onErreur(describeError(e, "Journal indisponible.")));
  }, [onErreur]);

  return (
    <section className="panel space-y-2 px-4 py-4">
      <p className="text-xs text-muted-foreground">
        Toute action d'administration laisse une trace. Une console qui distribue des jetons sans
        mémoire est une console qu'on ne peut pas auditer.
      </p>
      {lignes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Rien encore.</p>
      ) : (
        <ul className="space-y-1">
          {lignes.map((l) => (
            <li key={l.id} className="rounded border border-border px-3 py-1.5 text-xs">
              <span className="text-gold">{l.action}</span>{" "}
              <span className="text-muted-foreground">{l.target}</span>
              <span className="block truncate text-[0.66rem] text-muted-foreground">
                {new Date(l.at).toLocaleString("fr")} · {JSON.stringify(l.details)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
