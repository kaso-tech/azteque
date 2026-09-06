import { useEffect, useState } from "react";

/**
 * Compte à rebours d'un tour de jeu (local contre l'IA ou en ligne).
 *
 * Redémarre à `limit` chaque fois que `resetKey` change, et se fige à
 * `limit` tant que `active` est faux. `resetKey` doit encoder tout ce qui
 * doit relancer le décompte (à qui le tour, phase de jeu, etc.) : c'est la
 * même valeur que l'appelant utilisait déjà comme clé d'effet avant
 * l'extraction de ce hook.
 */
export function useTurnCountdown(active: boolean, resetKey: string, limit: number): number {
  const [left, setLeft] = useState(limit);

  useEffect(() => {
    if (!active) {
      setLeft(limit);
      return;
    }
    const start = Date.now();
    setLeft(limit);
    const t = setInterval(() => {
      setLeft(Math.max(0, limit - Math.round((Date.now() - start) / 1000)));
    }, 500);
    return () => clearInterval(t);
  }, [resetKey, active, limit]);

  return left;
}
