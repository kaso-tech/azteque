import { useCallback, useEffect, useRef, useState } from "react";
import { getMatch, subscribeMatch, type MatchRow } from "@/lib/azteque/online";
import { withRetry } from "@/lib/azteque/net";

/**
 * Synchronisation résistante aux réseaux faibles.
 *
 * Le temps réel (websocket) est le chemin rapide, mais il tombe facilement sur
 * une connexion instable — et une fois tombé, plus rien n'arrive : la table
 * paraît figée alors que la partie a avancé côté serveur. On double donc
 * l'abonnement d'un rattrapage périodique par simple lecture de la ligne, plus
 * rapide quand le temps réel est en panne, et déclenché aussi au retour du
 * réseau ou de l'onglet au premier plan.
 *
 * Les lignes plus anciennes que celle déjà affichée sont ignorées : un
 * rattrapage lent ne doit jamais faire reculer la table.
 */

const FAST_POLL_MS = 2_500;
const SLOW_POLL_MS = 9_000;
/**
 * Au bout de ce temps sans canal temps réel établi, on le reconstruit.
 *
 * Le client Supabase se reconnecte de lui-même dans les cas ordinaires, mais
 * un canal tombé sur `CHANNEL_ERROR` ou `TIMED_OUT` peut rester mort sans que
 * rien ne le relance : la table ne vit alors plus que du rattrapage
 * périodique, et chaque coup se paie une à neuf secondes d'attente. On le
 * refait donc à neuf plutôt que d'espérer.
 */
const RESUBSCRIBE_AFTER_MS = 15_000;

export interface MatchSync {
  /** Le canal temps réel est établi. */
  live: boolean;
  /** Le navigateur se déclare hors ligne. */
  offline: boolean;
  /** Vrai tant qu'on n'a pas reçu de nouvelle depuis un moment. */
  stale: boolean;
  /** Force une relecture immédiate. */
  refresh: () => void;
}

export function useMatchSync(
  matchId: string,
  enabled: boolean,
  onRow: (row: MatchRow) => void,
): MatchSync {
  const [live, setLive] = useState(false);
  const [offline, setOffline] = useState(false);
  const [stale, setStale] = useState(false);

  const lastAt = useRef(0);
  const lastSeen = useRef(Date.now());
  const onRowRef = useRef(onRow);
  onRowRef.current = onRow;

  const accept = useCallback((row: MatchRow) => {
    const at = new Date(row.updated_at).getTime();
    lastSeen.current = Date.now();
    setStale(false);
    if (at < lastAt.current) return;
    lastAt.current = at;
    onRowRef.current(row);
  }, []);

  const refresh = useCallback(() => {
    if (!enabled) return;
    void withRetry(() => getMatch(matchId), { attempts: 2, deadlineMs: 10_000 })
      .then((r) => {
        if (r) accept(r);
      })
      .catch(() => {
        /* la prochaine passe réessaiera */
      });
  }, [enabled, matchId, accept]);

  // Canal temps réel : chemin rapide, avec suivi de son état de santé.
  // `generation` est incrémenté pour forcer la reconstruction du canal.
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const unsub = subscribeMatch(matchId, accept, setLive);
    return () => {
      setLive(false);
      unsub();
    };
  }, [enabled, matchId, accept, generation]);

  // Canal muet depuis trop longtemps : on le reconstruit. Le compteur ne part
  // que lorsqu'il est effectivement tombé, et s'annule dès qu'il revient.
  useEffect(() => {
    if (!enabled || live) return;
    const t = setTimeout(() => setGeneration((n) => n + 1), RESUBSCRIBE_AFTER_MS);
    return () => clearTimeout(t);
  }, [enabled, live]);

  // Rattrapage périodique — cadence resserrée quand le temps réel est muet.
  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      if (Date.now() - lastSeen.current > 12_000) setStale(true);
      refresh();
    };
    const t = setInterval(tick, live ? SLOW_POLL_MS : FAST_POLL_MS);
    return () => clearInterval(t);
  }, [enabled, live, refresh]);

  // Retour du réseau ou de l'onglet : on se remet à jour tout de suite.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const up = () => {
      setOffline(false);
      refresh();
    };
    const down = () => setOffline(true);
    const visible = () => {
      if (!document.hidden) refresh();
    };
    setOffline(navigator.onLine === false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh]);

  return { live, offline, stale, refresh };
}
