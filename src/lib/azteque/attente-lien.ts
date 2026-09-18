/**
 * L'attente de la connexion, et ce qu'on en conclut.
 *
 * Quand la table se fige, une seule question se pose : qui manque ? Tant que
 * l'un des deux liens est en difficulté, personne ne réfléchit, donc personne
 * ne doit payer son temps de réflexion — mais cette indulgence ne peut pas
 * durer indéfiniment, sinon le joueur resté devant son écran attend un
 * adversaire qui ne reviendra pas.
 *
 * La règle est donc à deux temps : on patiente `LINK_WAIT_LIMIT` secondes,
 * puis on tranche — à condition de s'estimer en droit de trancher, c'est-à-dire
 * que notre propre lien soit sain. Si c'est le nôtre qui est tombé, nous ne
 * sommes en état d'accuser personne ; on continue d'attendre, pendant que
 * l'adversaire décompte de son côté le même délai contre nous.
 */

/** Secondes d'indulgence avant de déclarer l'adversaire absent. */
export const LINK_WAIT_LIMIT = 60;

export interface EtatLien {
  /** Notre propre liaison est saine (temps réel établi, pas de retard). */
  lienSain: boolean;
  /** L'adversaire est présent sur la table. */
  adversairePresent: boolean;
}

export interface VerdictAttente {
  /** Secondes restantes, à afficher. */
  restant: number;
  /** Le délai est écoulé ET nous sommes en droit de trancher. */
  declarer: boolean;
}

/**
 * Où en est l'attente, et faut-il conclure ?
 *
 * `echeance` est un instant absolu, posé UNE FOIS au début de l'attente. C'est
 * tout l'enjeu : l'ancienne version gardait l'instant de DÉPART dans la portée
 * d'un effet React dont les dépendances changeaient à chaque rendu. Le
 * décompte repartait donc de zéro sans cesse et n'arrivait jamais à son terme.
 * Une échéance calculée d'avance ne se laisse pas repousser.
 */
export function verdictAttente(
  echeance: number,
  maintenant: number,
  lien: EtatLien,
): VerdictAttente {
  const restant = Math.max(0, Math.round((echeance - maintenant) / 1000));
  return {
    restant,
    // On n'accuse que d'une absence constatée, et depuis un lien qui tient.
    declarer: restant === 0 && lien.lienSain && !lien.adversairePresent,
  };
}

/** L'un des deux liens manque : la réflexion est suspendue. */
export function enAttenteDeLien(lien: EtatLien): boolean {
  return !lien.lienSain || !lien.adversairePresent;
}
