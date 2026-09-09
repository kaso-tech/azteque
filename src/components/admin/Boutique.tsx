import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PlayerAvatar } from "@/components/azteque/avatar";
import { Sticker } from "@/components/azteque/stickers";
import { describeError } from "@/lib/azteque/account";
import { loadCatalogue, useCatalogue, type ShopItem, type ShopKind } from "@/lib/azteque/shop";
import { BACKGROUND_PRESETS, sanitizeBackground } from "@/lib/azteque/backgrounds";
import { adminUpsertItem, adminDeleteItem } from "@/lib/azteque/admin";
import { adminShopSalesSummary, type ShopSalesRow } from "@/lib/azteque/admin-shop-log";

/** Les dessins que le jeu sait rendre : un article nouveau leur emprunte. */
const DESSINS_AVATAR = ["av_marchand", "av_reine", "av_griot", "av_elegante", "av_roi"];
const DESSINS_STICKER = ["st_bravo", "st_rire", "st_pitie", "st_atout", "st_feu", "st_couronne"];

/** Les tapis livrés avec le jeu, proposés comme point de départ. */
const FONDS_LIVRES = Object.keys(BACKGROUND_PRESETS);

const KIND_LABEL: Record<ShopKind, string> = {
  avatar: "Avatar",
  sticker: "Sticker",
  messages: "Lot de messages",
  background: "Tapis de jeu",
};

type FiltreKind = "tous" | ShopKind;
type FiltreStatut = "tous" | "en_vente" | "retire";
type Tri = "sort" | "prix_asc" | "prix_desc" | "ventes" | "ca";

interface Brouillon {
  id: string;
  kind: ShopKind;
  name: string;
  hint: string;
  price: string;
  active: boolean;
  art: string;
  phrases: string;
  css: string;
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
    css: i.css ?? "",
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
    css: kind === "background" ? (BACKGROUND_PRESETS[FONDS_LIVRES[0]!] ?? "") : "",
    sort: String(sort),
    nouveau: true,
  };
}

/** Le tapis tel qu'il sera vu : posé sur le feutre de la table. */
function ApercuFond({ css, className }: { css: string; className: string }) {
  const image = sanitizeBackground(css);
  return (
    <span
      aria-hidden="true"
      className={cn("block rounded-md border border-border bg-cover bg-center", className)}
      style={{ backgroundImage: `${image ?? ""}, var(--gradient-table)` }}
    />
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const jours = Math.floor(diffMs / 86_400_000);
  if (jours < 1) return "aujourd'hui";
  if (jours < 30) return `il y a ${jours} j`;
  if (jours < 365) return `il y a ${Math.floor(jours / 30)} mois`;
  return `il y a ${Math.floor(jours / 365)} an${Math.floor(jours / 365) > 1 ? "s" : ""}`;
}

/**
 * Onglet Boutique — tableau dense avec stats de vente.
 *
 * PR3 remplace la liste-plate par un vrai tableau : colonnes triables
 * (prix, ventes, CA), filtres par catégorie et statut, et un bloc
 * « Ventes 7 j / CA 7 j » lu via le RPC `admin_shop_sales_summary`.
 * L'édition d'article reste en tiroir latéral — la PR2 a introduit le
 * pattern, on l'applique ici.
 */
export function Boutique({ onErreur }: { onErreur: (e: string | null) => void }) {
  const catalogue = useCatalogue();
  const [sales, setSales] = useState<Record<string, ShopSalesRow>>({});
  const [brouillon, setBrouillon] = useState<Brouillon | null>(null);
  const [filtreKind, setFiltreKind] = useState<FiltreKind>("tous");
  const [filtreStatut, setFiltreStatut] = useState<FiltreStatut>("tous");
  const [tri, setTri] = useState<Tri>("sort");
  const [busy, setBusy] = useState(false);

  const rafraichir = () => {
    void loadCatalogue(true);
    adminShopSalesSummary()
      .then((rows) => setSales(Object.fromEntries(rows.map((r) => [r.item_id, r]))))
      .catch((e: unknown) => onErreur(describeError(e, "Statistiques indisponibles.")));
  };

  useEffect(() => {
    rafraichir();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const articlesFiltres = useMemo(() => {
    const list = catalogue.filter((i) => {
      if (filtreKind !== "tous" && i.kind !== filtreKind) return false;
      if (filtreStatut === "en_vente" && !i.active) return false;
      if (filtreStatut === "retire" && i.active) return false;
      return true;
    });
    const getSales = (id: string) => sales[id];
    return [...list].sort((a, b) => {
      if (tri === "prix_asc") return a.price - b.price;
      if (tri === "prix_desc") return b.price - a.price;
      if (tri === "ventes")
        return (getSales(b.id)?.ventes_7j ?? 0) - (getSales(a.id)?.ventes_7j ?? 0);
      if (tri === "ca") return (getSales(b.id)?.ca_7j ?? 0) - (getSales(a.id)?.ca_7j ?? 0);
      return a.sort - b.sort;
    });
  }, [catalogue, filtreKind, filtreStatut, tri, sales]);

  const totaux = useMemo(() => {
    let ventes = 0;
    let ca = 0;
    for (const a of catalogue) {
      const s = sales[a.id];
      if (s) {
        ventes += s.ventes_7j;
        ca += s.ca_7j;
      }
    }
    return { ventes, ca };
  }, [catalogue, sales]);

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
    // Une image refusée ici l'aurait été chez les joueurs : mieux vaut le dire
    // à celui qui l'écrit que de l'enregistrer pour rien.
    const css = brouillon.kind === "background" ? sanitizeBackground(brouillon.css) : null;
    if (brouillon.kind === "background" && !css) {
      onErreur(
        "Image invalide : un empilement de dégradés CSS, ou url() en https, data: ou chemin du site.",
      );
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
      data:
        brouillon.kind === "messages"
          ? { phrases }
          : brouillon.kind === "background"
            ? { css }
            : { art: brouillon.art },
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
    ) : b.kind === "background" ? (
      <ApercuFond css={b.css} className="h-12 w-20" />
    ) : b.kind === "avatar" ? (
      <PlayerAvatar className="h-12 w-12" profile={{ avatar_kind: b.art }} />
    ) : (
      <Sticker id={b.art} className="h-11 w-11" />
    );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl gold-text">Boutique</h1>
        <p className="text-xs text-muted-foreground">
          {catalogue.filter((i) => i.active).length} article
          {catalogue.filter((i) => i.active).length > 1 ? "s" : ""} en vente
        </p>
      </div>

      {/* KPIs boutique */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Mini label="Articles" valeur={`${catalogue.length}`} />
        <Mini label="En vente" valeur={`${catalogue.filter((i) => i.active).length}`} surligne />
        <Mini label="Ventes (7j)" valeur={String(totaux.ventes)} />
        <Mini label="CA boutique (7j)" valeur={`🪙 ${totaux.ca.toLocaleString("fr")}`} surligne />
      </div>

      {/* Filtres + actions */}
      <div className="panel flex flex-wrap items-center gap-2 p-2">
        <FiltrePill
          label="Catégorie"
          value={filtreKind}
          onChange={(v) => setFiltreKind(v as FiltreKind)}
        >
          <option value="tous">Toutes</option>
          <option value="avatar">Avatars</option>
          <option value="sticker">Stickers</option>
          <option value="messages">Messages</option>
          <option value="background">Tapis de jeu</option>
        </FiltrePill>
        <FiltrePill
          label="Statut"
          value={filtreStatut}
          onChange={(v) => setFiltreStatut(v as FiltreStatut)}
        >
          <option value="tous">Tous</option>
          <option value="en_vente">En vente</option>
          <option value="retire">Retirés</option>
        </FiltrePill>
        <FiltrePill label="Tri" value={tri} onChange={(v) => setTri(v as Tri)}>
          <option value="sort">Ordre d'affichage</option>
          <option value="prix_asc">Prix ↑</option>
          <option value="prix_desc">Prix ↓</option>
          <option value="ventes">Plus vendus (7j)</option>
          <option value="ca">CA décroissant (7j)</option>
        </FiltrePill>
        <div className="flex-1" />
        {(["avatar", "sticker", "messages", "background"] as const).map((k) => (
          <Button
            key={k}
            size="sm"
            variant="outline"
            onClick={() =>
              setBrouillon(brouillonNeuf(k, Math.max(0, ...catalogue.map((i) => i.sort)) + 10))
            }
          >
            + {KIND_LABEL[k]}
          </Button>
        ))}
      </div>

      {/* Formulaire d'édition (déployé en haut quand actif) */}
      {brouillon && (
        <div className="panel border-gold/50 p-3">
          <div className="mb-2 flex items-center gap-3">
            {apercu(brouillon)}
            <p className="font-display text-lg gold-text">
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
            <label className="mt-2 block text-[0.68rem] text-muted-foreground">
              Phrases, une par ligne
              <textarea
                value={brouillon.phrases}
                onChange={(e) => setBrouillon({ ...brouillon, phrases: e.target.value })}
                rows={6}
                className="mt-0.5 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground"
              />
            </label>
          ) : brouillon.kind === "background" ? (
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
              <label className="block text-[0.68rem] text-muted-foreground">
                Image du tapis — dégradés CSS empilés, ou url("https://…") vers un fichier
                <textarea
                  value={brouillon.css}
                  onChange={(e) => setBrouillon({ ...brouillon, css: e.target.value })}
                  rows={6}
                  spellCheck={false}
                  className="mt-0.5 w-full rounded-md border border-input bg-background px-2 py-1.5 font-mono text-[0.7rem] text-foreground"
                />
              </label>
              <div>
                <p className="text-[0.68rem] text-muted-foreground">Aperçu sur la table</p>
                <ApercuFond css={brouillon.css} className="mt-0.5 h-28 w-full sm:w-44" />
                <p className="mt-2 text-[0.68rem] text-muted-foreground">
                  Repartir d'un tapis livré
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {FONDS_LIVRES.map((f) => (
                    <button
                      key={f}
                      type="button"
                      title={f}
                      onClick={() =>
                        setBrouillon({ ...brouillon, css: BACKGROUND_PRESETS[f] ?? "" })
                      }
                      className={cn(
                        "rounded-md p-0.5",
                        brouillon.css === BACKGROUND_PRESETS[f]
                          ? "ring-1 ring-gold"
                          : "hover:bg-secondary",
                      )}
                    >
                      <ApercuFond css={BACKGROUND_PRESETS[f] ?? ""} className="h-8 w-12" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-2">
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

          <div className="mt-3 flex flex-wrap items-center gap-2">
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

      {/* Tableau */}
      <div className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-card/60 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Article</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-right">Prix</th>
                <th className="px-3 py-2 text-right">Ventes 7j</th>
                <th className="px-3 py-2 text-right">CA 7j</th>
                <th className="px-3 py-2 text-left">Dernier achat</th>
                <th className="px-3 py-2 text-left">Statut</th>
                <th className="w-10 px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {articlesFiltres.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-12 text-center text-sm text-muted-foreground">
                    Aucun article ne correspond à ces filtres.
                  </td>
                </tr>
              ) : (
                articlesFiltres.map((i) => {
                  const s = sales[i.id];
                  return (
                    <tr
                      key={i.id}
                      className={cn("border-t border-border/50", !i.active && "opacity-60")}
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2.5">
                          <div className="grid h-9 w-14 shrink-0 place-items-center">
                            {i.kind === "avatar" ? (
                              <PlayerAvatar
                                className="h-9 w-9"
                                profile={{ avatar_kind: i.art ?? i.id }}
                              />
                            ) : i.kind === "sticker" ? (
                              <Sticker id={i.art ?? i.id} className="h-8 w-8" />
                            ) : i.kind === "background" ? (
                              <ApercuFond css={i.css ?? ""} className="h-8 w-14" />
                            ) : (
                              <span className="text-xl">💬</span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-foreground">{i.name}</div>
                            <div className="truncate text-[10px] text-muted-foreground">
                              {i.id} · {i.hint}
                              {i.kind === "messages"
                                ? ` · ${(i.phrases ?? []).length} phrases`
                                : ""}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <PillKind kind={i.kind} />
                      </td>
                      <td className="px-3 py-2 text-right gold-text">
                        🪙 {i.price.toLocaleString("fr")}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-foreground">
                        {s?.ventes_7j ?? 0}
                      </td>
                      <td className="px-3 py-2 text-right font-mono gold-text">
                        {s ? `🪙 ${s.ca_7j.toLocaleString("fr")}` : "🪙 0"}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {formatDate(s?.dernier_achat ?? null)}
                      </td>
                      <td className="px-3 py-2">
                        {i.active ? (
                          <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                            En vente
                          </span>
                        ) : (
                          <span className="rounded-full border border-border bg-card px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Retiré
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setBrouillon(brouillonDe(i))}
                        >
                          Modifier
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Mini({ label, valeur, surligne }: { label: string; valeur: string; surligne?: boolean }) {
  return (
    <div className="panel p-3">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={cn("mt-1 font-display text-xl", surligne ? "gold-text" : "text-foreground")}>
        {valeur}
      </p>
    </div>
  );
}

function FiltrePill({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus:border-primary"
      >
        {children}
      </select>
    </label>
  );
}

function PillKind({ kind }: { kind: ShopKind }) {
  const config: Record<ShopKind, { label: string; cls: string }> = {
    avatar: { label: "Avatar", cls: "border-info/40 bg-info/10 text-info" },
    sticker: { label: "Sticker", cls: "border-warning/40 bg-warning/10 text-warning" },
    messages: { label: "Messages", cls: "border-success/40 bg-success/10 text-success" },
    background: { label: "Tapis", cls: "border-gold/40 bg-gold/10 text-gold" },
  };
  const c = config[kind];
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        c.cls,
      )}
    >
      {c.label}
    </span>
  );
}
