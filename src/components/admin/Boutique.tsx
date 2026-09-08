import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PlayerAvatar } from "@/components/azteque/avatar";
import { Sticker } from "@/components/azteque/stickers";
import { describeError } from "@/lib/azteque/account";
import { loadCatalogue, useCatalogue, type ShopItem, type ShopKind } from "@/lib/azteque/shop";
import { adminUpsertItem, adminDeleteItem } from "@/lib/azteque/admin";

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
 */
export function Boutique({ onErreur }: { onErreur: (e: string | null) => void }) {
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
