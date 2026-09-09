import { equippedBackground, useCatalogue } from "@/lib/azteque/shop";

/**
 * Le fond du salon : l'image achetée en boutique, posée à l'endroit du halo
 * central, derrière le menu et le salon en ligne.
 *
 * Elle se pose SUR le feutre et s'éteint sur ses bords — la table reste
 * reconnaissable, le fond n'est qu'une lumière de plus. Un joueur qui n'en a
 * choisi aucun ne voit rien de nouveau : le halo du feutre, comme avant.
 */
export function SalonBackdrop({ kind }: { kind: string | null | undefined }) {
  const catalogue = useCatalogue();
  const image = equippedBackground(kind, catalogue);
  if (!image) return null;
  return <div aria-hidden="true" className="salon-backdrop" style={{ backgroundImage: image }} />;
}
