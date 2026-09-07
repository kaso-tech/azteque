import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PlayerAvatar } from "@/components/azteque/avatar";
import { Sticker } from "@/components/azteque/stickers";
import { RankBadge } from "@/components/azteque/rank";
import { describeError } from "@/lib/azteque/account";
import { shopItem } from "@/lib/azteque/shop";
import {
  DEFAULT_SOUND_SETTINGS,
  SOUND_IDS,
  SOUND_LABELS,
  currentSoundSettings,
  sfx,
  applySoundSettings,
  type SoundId,
  type SoundSettings,
} from "@/lib/azteque/sfx";
import {
  adminGrantTokens,
  adminListItems,
  adminListPlayers,
  adminLog,
  adminSaveSoundSettings,
  adminSetAdmin,
  adminSetBanned,
  adminSetItem,
  adminStats,
  amIAdmin,
  type AdminLogEntry,
  type AdminPlayer,
  type AdminShopItem,
  type AdminStats,
} from "@/lib/azteque/admin";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Administration — Aztèque" }] }),
  component: Administration,
});

type Onglet = "joueurs" | "boutique" | "sons" | "journal";

function Administration() {
  const [etat, setEtat] = useState<"chargement" | "refuse" | "prete">("chargement");
  const [onglet, setOnglet] = useState<Onglet>("joueurs");
  const [erreur, setErreur] = useState<string | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);

  useEffect(() => {
    amIAdmin()
      .then((oui) => {
        setEtat(oui ? "prete" : "refuse");
        if (oui) {
          adminStats()
            .then(setStats)
            .catch(() => setStats(null));
        }
      })
      .catch(() => setEtat("refuse"));
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

  if (etat === "chargement") {
    return coque(<p className="mt-10 text-center text-sm text-muted-foreground">Vérification…</p>);
  }

  if (etat === "refuse") {
    return coque(
      <div className="panel mt-6 px-6 py-6 text-center">
        <p className="text-sm text-muted-foreground">
          Cette console est réservée aux administrateurs. Le serveur refuse de toute façon les
          opérations : ce message ne fait que vous éviter une porte fermée.
        </p>
      </div>,
    );
  }

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

/* ---------- Joueurs ---------- */

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
              <PlayerAvatar className="h-9 w-9" profile={j} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-foreground">
                    {j.username}
                  </span>
                  {j.is_admin && <span className="text-[0.62rem] text-gold">ADMIN</span>}
                  {j.banned && <span className="text-[0.62rem] text-destructive">SUSPENDU</span>}
                </span>
                <RankBadge rating={j.rating} />
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-display text-sm text-gold">🪙 {j.tokens}</span>
                <span className="block text-[0.62rem] text-muted-foreground">
                  {j.rated_games} parties · {j.purchases} achats
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
                <p className="text-[0.66rem] text-muted-foreground">
                  Inscrit le {new Date(j.created_at).toLocaleDateString("fr")} · cote {j.rating}
                </p>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------- Boutique ---------- */

function Boutique({ onErreur }: { onErreur: (e: string | null) => void }) {
  const [items, setItems] = useState<AdminShopItem[]>([]);
  const [prix, setPrix] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const charger = useCallback(() => {
    adminListItems()
      .then((l) => {
        const ordre = ["avatar", "sticker", "messages"];
        setItems([...l].sort((a, b) => ordre.indexOf(a.kind) - ordre.indexOf(b.kind)));
        setPrix(Object.fromEntries(l.map((i) => [i.id, String(i.price)])));
      })
      .catch((e: unknown) => onErreur(describeError(e, "Catalogue indisponible.")));
  }, [onErreur]);

  useEffect(charger, [charger]);

  const enregistrer = (item: AdminShopItem, actif: boolean) => {
    const p = Number(prix[item.id] ?? item.price);
    if (!Number.isFinite(p) || p < 0) return;
    setBusy(item.id);
    onErreur(null);
    adminSetItem(item.id, p, actif)
      .then(charger)
      .catch((e: unknown) => onErreur(describeError(e, "Modification impossible.")))
      .finally(() => setBusy(null));
  };

  return (
    <section className="panel space-y-2 px-4 py-4">
      <p className="text-xs text-muted-foreground">
        Le prix vit ici, pas dans l'application : c'est cette valeur qui débite. Un article retiré
        de la vente reste acquis à ceux qui l'ont déjà.
      </p>
      <ul className="space-y-2">
        {items.map((i) => {
          const info = shopItem(i.id);
          return (
            <li
              key={i.id}
              className={cn(
                "flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2",
                i.active ? "border-border" : "border-destructive/40 bg-destructive/5",
              )}
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center">
                {i.kind === "avatar" ? (
                  <PlayerAvatar className="h-10 w-10" profile={{ avatar_kind: i.id }} />
                ) : i.kind === "sticker" ? (
                  <Sticker id={i.id} className="h-9 w-9" />
                ) : (
                  <span className="text-2xl">💬</span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-foreground">
                  {info?.name ?? i.id}
                </span>
                <span className="text-[0.66rem] text-muted-foreground">{i.id}</span>
              </span>
              <input
                value={prix[i.id] ?? String(i.price)}
                onChange={(e) => setPrix((p) => ({ ...p, [i.id]: e.target.value }))}
                inputMode="numeric"
                className="h-9 w-24 rounded-md border border-input bg-background px-2 text-sm"
                aria-label={`Prix de ${info?.name ?? i.id}`}
              />
              <Button size="sm" disabled={busy === i.id} onClick={() => enregistrer(i, i.active)}>
                Enregistrer
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy === i.id}
                onClick={() => enregistrer(i, !i.active)}
              >
                {i.active ? "Retirer" : "Remettre"}
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ---------- Sons ---------- */

function Sons({ onErreur }: { onErreur: (e: string | null) => void }) {
  const [reglages, setReglages] = useState<SoundSettings>(() => currentSoundSettings());
  const [busy, setBusy] = useState(false);
  const [enregistre, setEnregistre] = useState(false);

  // L'aperçu doit s'entendre tel qu'il sera : on applique avant de jouer.
  const ecouter = (id: SoundId) => {
    applySoundSettings(reglages);
    sfx[id]();
  };

  const valeur = (id: SoundId, axe: keyof NonNullable<SoundSettings["sounds"][SoundId]>) =>
    reglages.sounds[id]?.[axe] ?? 1;

  const regler = (
    id: SoundId,
    axe: keyof NonNullable<SoundSettings["sounds"][SoundId]>,
    v: number,
  ) =>
    setReglages((r) => ({
      ...r,
      sounds: { ...r.sounds, [id]: { ...(r.sounds[id] ?? {}), [axe]: v } },
    }));

  const enregistrer = () => {
    setBusy(true);
    onErreur(null);
    adminSaveSoundSettings(reglages)
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
    onChange: (v: number) => void,
  ) => (
    <label className="flex items-center gap-2 text-[0.68rem] text-muted-foreground">
      <span className="w-14 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={0.05}
        value={v}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 min-w-0 flex-1 accent-[var(--gold)]"
      />
      <span className="w-9 shrink-0 text-right tabular-nums text-foreground">{v.toFixed(2)}</span>
    </label>
  );

  return (
    <section className="panel space-y-4 px-4 py-4">
      <div>
        <p className="text-sm text-foreground">Volume général</p>
        {curseur("Tous", reglages.master, 0, 2, (v) => setReglages((r) => ({ ...r, master: v })))}
        <p className="mt-1 text-xs text-muted-foreground">
          Chaque son se règle sur trois axes : le volume, la hauteur et la vitesse. 1,00 est la
          valeur d'origine. Les réglages valent pour tous les joueurs dès l'enregistrement.
        </p>
      </div>

      <ul className="space-y-3">
        {SOUND_IDS.map((id) => (
          <li key={id} className="rounded-lg border border-border px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">{SOUND_LABELS[id]}</p>
              <Button size="sm" variant="outline" onClick={() => ecouter(id)}>
                ▶ Écouter
              </Button>
            </div>
            <div className="mt-1.5 space-y-1">
              {curseur("Volume", valeur(id, "gain"), 0, 3, (v) => regler(id, "gain", v))}
              {curseur("Hauteur", valeur(id, "pitch"), 0.5, 2, (v) => regler(id, "pitch", v))}
              {curseur("Vitesse", valeur(id, "speed"), 0.5, 2, (v) => regler(id, "speed", v))}
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={busy} onClick={enregistrer} className="font-semibold">
          {busy ? "…" : "Enregistrer pour tous"}
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            applySoundSettings(DEFAULT_SOUND_SETTINGS);
            setReglages(currentSoundSettings());
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
