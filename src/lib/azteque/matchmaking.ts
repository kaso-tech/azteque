import { supabase } from "@/lib/azteque/supabase-client";

/**
 * La file d'attente : trouver un adversaire sans avoir à en connaître un.
 *
 * Jouer en ligne supposait jusqu'ici une invitation à un ami ou un code
 * échangé de la main à la main. Un joueur qui se connecte seul n'avait donc
 * personne à affronter — c'est le vrai frein d'une petite communauté, où
 * chacun attend que l'autre propose.
 *
 * Tout le travail délicat est dans la base (voir la migration
 * `file_attente`) : apparier deux joueurs doit être atomique, faute de quoi
 * deux chercheurs simultanés créent chacun leur table et s'assoient face à un
 * adversaire qui n'arrivera jamais. Ce module n'est que le guichet.
 */

/** Ce que rend une recherche : une table trouvée, ou l'attente. */
export type Recherche =
  { trouve: true; matchId: string; seat: "host" | "guest" } | { trouve: false; devant: number };

interface LigneJoin {
  match_id: string | null;
  seat: string | null;
}

export interface LignePoll extends LigneJoin {
  devant: number | null;
}

const rpc = (nom: string) =>
  (
    supabase as unknown as {
      rpc: (n: string, a: Record<string, unknown>) => ReturnType<typeof supabase.rpc>;
    }
  ).rpc(nom, {});

/**
 * Ce que dit la base, traduit sans complaisance.
 *
 * Une table n'est tenue pour trouvée que si l'identifiant ET le siège sont là.
 * Un siège manquant ou incompris enverrait le joueur s'asseoir à la place de
 * son adversaire : mieux vaut continuer d'attendre que partir de travers.
 */
export function lireRecherche(ligne: LignePoll | undefined): Recherche {
  if (ligne?.match_id && (ligne.seat === "host" || ligne.seat === "guest")) {
    return { trouve: true, matchId: ligne.match_id, seat: ligne.seat };
  }
  return { trouve: false, devant: ligne?.devant ?? 0 };
}

/**
 * Entrer dans la file, et s'apparier si quelqu'un y attend déjà.
 *
 * À appeler UNE fois, quand le joueur décide de chercher. L'attente qui suit
 * se tient avec `interrogerFile`, qui ne tente aucun appariement : deux
 * clients qui chercheraient en boucle finiraient par s'apparier chacun de son
 * côté, ce que le verrou de la base empêche mais qu'il est plus propre de ne
 * pas provoquer.
 */
export async function chercherAdversaire(): Promise<Recherche> {
  const { data, error } = await rpc("mm_join");
  if (error) throw error;
  return lireRecherche((data as unknown as LignePoll[] | null)?.[0]);
}

/**
 * Prendre des nouvelles, et tenir sa place.
 *
 * Chaque appel rafraîchit le battement de cœur : c'est lui qui distingue un
 * joueur qui patiente d'un joueur dont l'application est fermée depuis dix
 * minutes, et qu'il serait absurde d'apparier.
 */
export async function interrogerFile(): Promise<Recherche> {
  const { data, error } = await rpc("mm_poll");
  if (error) throw error;
  return lireRecherche((data as unknown as LignePoll[] | null)?.[0]);
}

/** Renoncer. Une table déjà trouvée n'est pas perdue pour autant. */
export async function quitterFile(): Promise<void> {
  const { error } = await rpc("mm_leave");
  if (error) throw error;
}
