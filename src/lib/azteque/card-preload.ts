import { CARD_ASSETS, CARD_BACK_ASSET } from "./card-assets";

/**
 * Toutes les images de cartes, dos compris.
 *
 * Les dessins sont des fichiers séparés : sans précaution, le navigateur ne
 * télécharge celui d'une carte qu'au moment PRÉCIS où elle apparaît, ce qui la
 * montre blanche pendant un instant. On les charge donc tous d'avance, dès
 * l'ouverture de l'application, pour qu'ils soient déjà en cache quand une
 * carte entre en scène.
 */
export const TOUTES_LES_IMAGES: readonly string[] = [
  CARD_BACK_ASSET,
  ...Object.values(CARD_ASSETS).flatMap((parCouleur) => Object.values(parCouleur)),
];

let enCours: Promise<void> | null = null;

/** Charge (une seule fois) toutes les images de cartes en arrière-plan. */
export function preloadCardAssets(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (enCours) return enCours;

  enCours = Promise.all(
    TOUTES_LES_IMAGES.map(
      (src) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.decoding = "async";
          // Un échec ne doit rien bloquer : la carte se chargera à l'affichage.
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = src;
        }),
    ),
  ).then(() => undefined);

  return enCours;
}
