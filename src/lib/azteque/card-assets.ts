import cardBack from "@/assets/cards/card_back.svg";

/**
 * Le dos de carte, seul dessin encore livré en fichier.
 *
 * Les trente-deux faces l'étaient aussi jusqu'ici. Elles sont désormais
 * dessinées par `PlayingCard` : leur index était calibré pour une carte
 * regardée de près, pas pour les trente pixels qu'elle occupe dans une main sur
 * téléphone, et trente-deux fichiers ne suivent pas un changement de palette.
 */
export const CARD_BACK_ASSET = cardBack;
