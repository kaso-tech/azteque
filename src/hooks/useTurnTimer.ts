import { useEffect, useRef, useState } from "react";

/**
 * Temps restant, en secondes, à partir du temps DÉJÀ consommé.
 *
 * Extrait du hook pour être éprouvable sans navigateur : c'est ici que vit
 * toute l'arithmétique de la pause, et c'est elle qui finit par décider qu'un
 * joueur perd la partie sur dépassement. Une erreur ici ne se verrait pas —
 * elle ferait juste perdre quelqu'un.
 */
export function remainingSeconds(
  limit: number,
  consumedMs: number,
  runningSinceMs: number | null,
  now: number,
): number {
  const enCours = runningSinceMs === null ? 0 : Math.max(0, now - runningSinceMs);
  return Math.max(0, limit - Math.round((consumedMs + enCours) / 1000));
}

/**
 * Compte à rebours d'un tour de jeu (local contre l'IA ou en ligne).
 *
 * Redémarre à `limit` chaque fois que `resetKey` change, et se fige à `limit`
 * tant que `active` est faux. `resetKey` doit encoder tout ce qui doit
 * relancer le décompte (à qui le tour, phase de jeu, etc.).
 *
 * `paused` SUSPEND le décompte sans le remettre à zéro : le temps déjà écoulé
 * reste acquis et la reprise repart d'où l'on s'était arrêté. C'est ce qui
 * distingue le temps de réflexion du délai d'attente de la connexion — sur un
 * lien instable, le joueur ne doit pas perdre son tour pendant que le réseau
 * cherche son chemin. La pause ne lui rend pas non plus de temps : elle le
 * gèle, elle ne le rembourse pas.
 */
export function useTurnCountdown(
  active: boolean,
  resetKey: string,
  limit: number,
  paused = false,
): number {
  const [left, setLeft] = useState(limit);
  /** Temps de réflexion déjà dépensé sur CE tour, pauses exclues. */
  const consumed = useRef(0);

  // Nouveau tour — ou tour qui cesse d'être actif : le compteur repart à neuf.
  // Cet effet est déclaré AVANT celui qui décompte : à un changement de tour,
  // React exécute d'abord tous les nettoyages, puis les effets dans l'ordre,
  // si bien que la remise à zéro passe après l'encaissement du temps écoulé et
  // avant le redémarrage du décompte.
  useEffect(() => {
    consumed.current = 0;
    setLeft(limit);
  }, [resetKey, limit, active]);

  useEffect(() => {
    if (!active || paused) return;
    const depart = Date.now();
    const tick = () => setLeft(remainingSeconds(limit, consumed.current, depart, Date.now()));
    tick();
    const t = setInterval(tick, 250);
    return () => {
      clearInterval(t);
      // Ce qui vient d'être consommé est acquis avant toute suspension.
      consumed.current += Date.now() - depart;
    };
  }, [resetKey, active, paused, limit]);

  return left;
}
