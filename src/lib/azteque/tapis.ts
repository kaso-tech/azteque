import type { CSSProperties } from "react";
import { equippedBackground, useCatalogue } from "@/lib/azteque/shop";

/**
 * Le tapis acheté en boutique, posé sur la table de jeu.
 *
 * Il ne se glisse pas DERRIÈRE la table : il devient une couche de son fond,
 * entre le grain du feutre qui reste au-dessus et le feutre vert qui reste
 * en-dessous. C'est du dessin, pas un calque à empiler — rien n'a donc à se
 * disputer un `z-index` avec les cartes, et le tissage continue de courir sur
 * toute la table quelle que soit la couleur choisie.
 *
 * Un joueur qui n'a choisi aucun tapis ne reçoit aucun style : la table garde
 * exactement celle du code.
 */
export function useTapisSurface(kind: string | null | undefined): CSSProperties | undefined {
  const catalogue = useCatalogue();
  const image = equippedBackground(kind, catalogue);
  if (!image) return undefined;
  return {
    background: `var(--gradient-table-grain), ${image}, var(--gradient-table-base)`,
  };
}
