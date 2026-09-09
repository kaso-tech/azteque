import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BACKGROUND_PRESETS, backgroundImage } from "@/lib/azteque/backgrounds";

/**
 * La boutique.
 *
 * Le catalogue vit en base, où la console d'administration le modifie et
 * l'étend. Le tableau ci-dessous n'est plus la source : c'est la version
 * d'origine, celle que la migration installe, et le recours quand la base ne
 * répond pas — mieux vaut une boutique figée qu'une boutique vide.
 *
 * Les prix affichés restent une copie : c'est la base qui débite, et
 * `buy_item` relit le prix qu'elle tient.
 */

export type ShopKind = "avatar" | "sticker" | "messages" | "background";

export interface ShopItem {
  id: string;
  kind: ShopKind;
  name: string;
  /** Ce que l'article apporte, en une ligne. */
  hint: string;
  price: number;
  active: boolean;
  /** Le dessin emprunté au jeu, pour un avatar ou un sticker. */
  art?: string | undefined;
  /** Les phrases mises à disposition, pour un lot de messages. */
  phrases?: string[] | undefined;
  /** L'image, pour un fond de salon : une valeur CSS `background-image`. */
  css?: string | undefined;
  sort: number;
}

/** Le catalogue tel que la migration l'installe. */
export const FALLBACK_ITEMS: ShopItem[] = [
  {
    id: "av_marchand",
    kind: "avatar",
    name: "Le Marchand",
    hint: "Chapeau du grand marché",
    price: 500,
    active: true,
    art: "av_marchand",
    sort: 10,
  },
  {
    id: "av_reine",
    kind: "avatar",
    name: "La Reine du marché",
    hint: "Foulard haut et collier d'or",
    price: 750,
    active: true,
    art: "av_reine",
    sort: 20,
  },
  {
    id: "av_griot",
    kind: "avatar",
    name: "Le Griot",
    hint: "Celui qui connaît toutes les parties",
    price: 1000,
    active: true,
    art: "av_griot",
    sort: 30,
  },
  {
    id: "av_elegante",
    kind: "avatar",
    name: "L'Élégante",
    hint: "Tresses longues et grands anneaux",
    price: 1500,
    active: true,
    art: "av_elegante",
    sort: 40,
  },
  {
    id: "av_roi",
    kind: "avatar",
    name: "Le Roi Aztèque",
    hint: "La couronne, rien de moins",
    price: 2500,
    active: true,
    art: "av_roi",
    sort: 50,
  },
  {
    id: "st_bravo",
    kind: "sticker",
    name: "Bravo",
    hint: "Applaudir un beau coup",
    price: 200,
    active: true,
    art: "st_bravo",
    sort: 60,
  },
  {
    id: "st_rire",
    kind: "sticker",
    name: "Éclat de rire",
    hint: "Rire du malheur d'autrui",
    price: 300,
    active: true,
    art: "st_rire",
    sort: 70,
  },
  {
    id: "st_pitie",
    kind: "sticker",
    name: "Grâce",
    hint: "Rendre les armes",
    price: 300,
    active: true,
    art: "st_pitie",
    sort: 80,
  },
  {
    id: "st_atout",
    kind: "sticker",
    name: "Atout",
    hint: "Annoncer la couleur",
    price: 500,
    active: true,
    art: "st_atout",
    sort: 90,
  },
  {
    id: "st_feu",
    kind: "sticker",
    name: "En feu",
    hint: "Trois tours d'affilée",
    price: 700,
    active: true,
    art: "st_feu",
    sort: 100,
  },
  {
    id: "st_couronne",
    kind: "sticker",
    name: "Couronne",
    hint: "Le champ est à vous",
    price: 900,
    active: true,
    art: "st_couronne",
    sort: 110,
  },
  {
    id: "ms_salutations",
    kind: "messages",
    name: "Salutations",
    hint: "Ouvrir et fermer une partie comme il faut",
    price: 400,
    active: true,
    sort: 120,
    phrases: [
      "Bonjour, bonne partie à vous !",
      "Que le meilleur gagne.",
      "Merci pour la partie.",
      "À bientôt sur une autre table.",
      "Beau jeu, vraiment.",
    ],
  },
  {
    id: "ms_moqueries",
    kind: "messages",
    name: "Moqueries",
    hint: "Piquer sans méchanceté",
    price: 600,
    active: true,
    sort: 130,
    phrases: [
      "Tu comptais tes cartes ou tes doigts ?",
      "L'atout t'a vu venir de loin.",
      "Encore une comme ça et je m'endors.",
      "Ta pioche te veut du bien, pas moi.",
      "Range ce dix, il te fait honte.",
    ],
  },
  {
    id: "ms_defis",
    kind: "messages",
    name: "Défis",
    hint: "Mettre la pression avant le coup",
    price: 800,
    active: true,
    sort: 140,
    phrases: [
      "Double la mise, si tu l'oses.",
      "Ce tour est déjà joué dans ma tête.",
      "Je te laisse la devanture, profites-en.",
      "Compte tes bonnes tant qu'il t'en reste.",
      "Le champ se décide maintenant.",
    ],
  },
  {
    id: "bg_aurore",
    kind: "background",
    name: "Aurore",
    hint: "Le soleil se lève derrière le menu",
    price: 600,
    active: true,
    sort: 150,
    css: BACKGROUND_PRESETS["bg_aurore"],
  },
  {
    id: "bg_crepuscule",
    kind: "background",
    name: "Crépuscule",
    hint: "Pourpre du soir et braise d'horizon",
    price: 900,
    active: true,
    sort: 160,
    css: BACKGROUND_PRESETS["bg_crepuscule"],
  },
  {
    id: "bg_nuit",
    kind: "background",
    name: "Nuit étoilée",
    hint: "La voûte bleue et ses étoiles",
    price: 1400,
    active: true,
    sort: 170,
    css: BACKGROUND_PRESETS["bg_nuit"],
  },
  {
    id: "bg_or",
    kind: "background",
    name: "Halo d'or",
    hint: "Trois anneaux d'or, pour les grands soirs",
    price: 2200,
    active: true,
    sort: 180,
    css: BACKGROUND_PRESETS["bg_or"],
  },
];

let catalogue: ShopItem[] = FALLBACK_ITEMS;
let chargement: Promise<ShopItem[]> | null = null;
const abonnes = new Set<(items: ShopItem[]) => void>();

interface Ligne {
  id: string;
  kind: string;
  name: string | null;
  hint: string | null;
  price: number;
  active?: boolean;
  data?: { art?: string; phrases?: string[]; css?: string } | null;
  sort?: number;
}

function depuisLaBase(rows: Ligne[]): ShopItem[] {
  return rows
    .map((r) => ({
      id: r.id,
      kind: (["avatar", "sticker", "messages", "background"].includes(r.kind)
        ? r.kind
        : "sticker") as ShopKind,
      name: r.name ?? r.id,
      hint: r.hint ?? "",
      price: r.price,
      active: r.active ?? true,
      art: r.data?.art,
      phrases: r.data?.phrases,
      // Un fond installé avant que la console ne sache l'écrire n'a pas encore
      // son image en base : le préréglage du code prend alors le relais.
      css: r.data?.css ?? BACKGROUND_PRESETS[r.id],
      sort: r.sort ?? 0,
    }))
    .sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id));
}

/**
 * Charge le catalogue, une seule fois par session.
 *
 * Une base muette — table absente, migration en retard, réseau coupé — laisse
 * la version d'origine en place : la boutique s'affiche toujours, avec les
 * articles et les prix du code, et c'est de toute façon la base qui tranchera
 * au moment de débiter.
 */
export async function loadCatalogue(force = false): Promise<ShopItem[]> {
  if (chargement && !force) return chargement;
  chargement = (async () => {
    try {
      const { data, error } = await (
        supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> }
      )
        .from("shop_items")
        .select("id, kind, name, hint, price, active, data, sort");
      if (error || !data || (data as unknown[]).length === 0) return catalogue;
      catalogue = depuisLaBase(data as unknown as Ligne[]);
      abonnes.forEach((f) => f(catalogue));
      return catalogue;
    } catch {
      return catalogue;
    }
  })();
  return chargement;
}

/** Le catalogue en mémoire, sans attendre. */
export function shopItems(): ShopItem[] {
  return catalogue;
}

export function shopItem(id: string): ShopItem | undefined {
  return catalogue.find((i) => i.id === id);
}

/** Le catalogue, chargé au premier rendu et tenu à jour. */
export function useCatalogue(): ShopItem[] {
  const [items, setItems] = useState<ShopItem[]>(catalogue);
  useEffect(() => {
    abonnes.add(setItems);
    void loadCatalogue().then(setItems);
    return () => {
      abonnes.delete(setItems);
    };
  }, []);
  return items;
}

/** Les articles d'une nature, ceux en vente d'abord. */
export function itemsOfKind(items: ShopItem[], kind: ShopKind): ShopItem[] {
  return items.filter((i) => i.kind === kind);
}

/** Les phrases débloquées par les lots possédés. */
export function ownedPhrases(owned: ReadonlySet<string>, items: ShopItem[] = catalogue): string[] {
  return items
    .filter((i) => i.kind === "messages" && owned.has(i.id))
    .flatMap((i) => i.phrases ?? []);
}

/**
 * L'image du fond porté, prête à poser, ou `null` si le joueur n'en a choisi
 * aucun — auquel cas le halo du feutre reste seul, comme avant la boutique.
 */
export function equippedBackground(
  kind: string | null | undefined,
  items: ShopItem[] = catalogue,
): string | null {
  if (!kind) return null;
  const item = items.find((i) => i.id === kind);
  if (item && item.kind !== "background") return null;
  return backgroundImage(item?.css, kind);
}

/** Les stickers possédés, dans l'ordre du catalogue. */
export function ownedStickers(
  owned: ReadonlySet<string>,
  items: ShopItem[] = catalogue,
): ShopItem[] {
  return items.filter((i) => i.kind === "sticker" && owned.has(i.id));
}
