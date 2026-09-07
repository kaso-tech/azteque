/**
 * La boutique.
 *
 * Ce fichier décrit ce qui est en vente : l'identifiant, le nom, ce que
 * l'article montre ou dit. Les prix, eux, sont tenus par la base
 * (`supabase/migrations/20260907140000_boutique.sql`) : c'est elle qui débite
 * les jetons, et un prix que le client annoncerait ne vaudrait rien. Les deux
 * listes doivent donc concorder, ce qu'un test vérifie en lisant la migration.
 *
 * Le prix figure quand même ici pour être affiché avant l'achat — mais il n'est
 * qu'une copie, et c'est la base qui tranche.
 */

export type ShopKind = "avatar" | "sticker" | "messages";

export interface ShopItem {
  id: string;
  kind: ShopKind;
  name: string;
  /** Ce que l'article apporte, en une ligne. */
  hint: string;
  price: number;
}

export interface MessagePack extends ShopItem {
  kind: "messages";
  /** Les phrases que le lot met à disposition dans la discussion. */
  phrases: string[];
}

/* ---------- Avatars ---------- */

export const SHOP_AVATARS: ShopItem[] = [
  {
    id: "av_marchand",
    kind: "avatar",
    name: "Le Marchand",
    hint: "Chapeau du grand marché",
    price: 500,
  },
  {
    id: "av_reine",
    kind: "avatar",
    name: "La Reine du marché",
    hint: "Foulard haut et collier d'or",
    price: 750,
  },
  {
    id: "av_griot",
    kind: "avatar",
    name: "Le Griot",
    hint: "Celui qui connaît toutes les parties",
    price: 1000,
  },
  {
    id: "av_elegante",
    kind: "avatar",
    name: "L'Élégante",
    hint: "Tresses longues et grands anneaux",
    price: 1500,
  },
  {
    id: "av_roi",
    kind: "avatar",
    name: "Le Roi Aztèque",
    hint: "La couronne, rien de moins",
    price: 2500,
  },
];

/* ---------- Stickers ---------- */

export const SHOP_STICKERS: ShopItem[] = [
  { id: "st_bravo", kind: "sticker", name: "Bravo", hint: "Applaudir un beau coup", price: 200 },
  {
    id: "st_rire",
    kind: "sticker",
    name: "Éclat de rire",
    hint: "Rire du malheur d'autrui",
    price: 300,
  },
  { id: "st_pitie", kind: "sticker", name: "Grâce", hint: "Rendre les armes", price: 300 },
  { id: "st_atout", kind: "sticker", name: "Atout", hint: "Annoncer la couleur", price: 500 },
  { id: "st_feu", kind: "sticker", name: "En feu", hint: "Trois tours d'affilée", price: 700 },
  { id: "st_couronne", kind: "sticker", name: "Couronne", hint: "Le champ est à vous", price: 900 },
];

/* ---------- Lots de messages ---------- */

export const SHOP_MESSAGES: MessagePack[] = [
  {
    id: "ms_salutations",
    kind: "messages",
    name: "Salutations",
    hint: "Ouvrir et fermer une partie comme il faut",
    price: 400,
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
    phrases: [
      "Double la mise, si tu l'oses.",
      "Ce tour est déjà joué dans ma tête.",
      "Je te laisse la devanture, profites-en.",
      "Compte tes bonnes tant qu'il t'en reste.",
      "Le champ se décide maintenant.",
    ],
  },
];

export const SHOP_ITEMS: ShopItem[] = [...SHOP_AVATARS, ...SHOP_STICKERS, ...SHOP_MESSAGES];

export function shopItem(id: string): ShopItem | undefined {
  return SHOP_ITEMS.find((i) => i.id === id);
}

/** Les phrases débloquées par les lots possédés. */
export function ownedPhrases(owned: ReadonlySet<string>): string[] {
  return SHOP_MESSAGES.filter((p) => owned.has(p.id)).flatMap((p) => p.phrases);
}

/** Les stickers possédés, dans l'ordre du catalogue. */
export function ownedStickers(owned: ReadonlySet<string>): ShopItem[] {
  return SHOP_STICKERS.filter((s) => owned.has(s.id));
}
