/**
 * Helpers pour exporter des données en CSV côté client.
 *
 * L'export reste local : on sérialise, on crée un blob, on déclenche un
 * téléchargement. Pas de round-trip serveur, c'est la console qui
 * télécharge ce qu'elle voit.
 *
 * Le séparateur est `;` plutôt que `,` parce qu'Excel en France lit
 * mieux les CSV avec `;` (la virgule sert de séparateur décimal). Si
 * tu changes ce comportement, adapte aussi l'encodage et le BOM.
 */

const SEPARATEUR = ";";
const SAUT_LIGNE = "\r\n";
const BOM = "\uFEFF";

/** Échappe une cellule : entoure de guillemets si elle contient le séparateur, un saut de ligne, ou un guillemet. */
function echapper(valeur: unknown): string {
  if (valeur === null || valeur === undefined) return "";
  const s = String(valeur);
  if (s.includes(SEPARATEUR) || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv<T>(
  lignes: T[],
  colonnes: { entete: string; getter: (l: T) => unknown }[],
): string {
  const entete = colonnes.map((c) => echapper(c.entete)).join(SEPARATEUR);
  const corps = lignes
    .map((l) => colonnes.map((c) => echapper(c.getter(l))).join(SEPARATEUR))
    .join(SAUT_LIGNE);
  return BOM + entete + SAUT_LIGNE + corps + SAUT_LIGNE;
}

export function telechargerCsv(nomFichier: string, contenu: string): void {
  // BOM + contenu = bon encodage pour Excel FR
  const blob = new Blob([contenu], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomFichier.endsWith(".csv") ? nomFichier : `${nomFichier}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Laisse le navigateur traiter le téléchargement avant de révoquer.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
