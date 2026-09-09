import type { CSSProperties } from "react";
import { equippedBackground, useCatalogue } from "@/lib/azteque/shop";

/**
 * Le fond de salon acheté en boutique, posé sur l'accueil.
 *
 * Il ne se glisse pas DERRIÈRE la page mais devient la première couche de son
 * fond, au-dessus du feutre et du projecteur central : c'est du dessin, pas un
 * calque à empiler, et rien n'a donc à se disputer un `z-index` avec le titre
 * et les boutons. Un joueur qui n'a choisi aucun fond ne reçoit aucun style —
 * l'accueil garde exactement celui du code.
 */
export function useSalonSurface(
  kind: string | null | undefined,
  base: string,
): CSSProperties | undefined {
  const catalogue = useCatalogue();
  const image = equippedBackground(kind, catalogue);
  return image ? { background: `${image}, ${base}` } : undefined;
}
