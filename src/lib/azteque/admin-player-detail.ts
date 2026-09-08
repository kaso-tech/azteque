import { supabase } from "@/integrations/supabase/client";

/**
 * Détails de la fiche joueur.
 *
 * Trois RPC côté serveur :
 * - `admin_player_recent_matches` : les N dernières parties
 * - `admin_player_rating_series` : la série quotidienne de cote reconstituée
 *   en annulant les deltas à rebours depuis la cote actuelle
 * - `admin_player_purchase_count` : le nombre d'achats (un simple count)
 *
 * Les trois sont appelés en parallèle : on n'attend pas l'un pour l'autre,
 * et on tolère qu'un des trois échoue pour afficher ce qu'on a.
 */

const rpc = (name: string, args: Record<string, unknown> = {}) =>
  (
    supabase as unknown as {
      rpc: (n: string, a: Record<string, unknown>) => ReturnType<typeof supabase.rpc>;
    }
  ).rpc(name, args);

export interface PlayerRecentMatch {
  id: string;
  finished_at: string;
  opponent: string;
  result: "gagne" | "perdu" | "nul";
  score: string;
  rating_delta: number;
}

export interface PlayerRatingPoint {
  jour: string;
  rating: number;
}

export interface PlayerDetail {
  recent: PlayerRecentMatch[];
  rating_series: PlayerRatingPoint[];
  purchase_count: number;
}

export async function adminPlayerDetail(
  userId: string,
  recentLimit = 8,
  seriesDays = 60,
): Promise<PlayerDetail> {
  const [recentRes, seriesRes, purchasesRes] = await Promise.allSettled([
    rpc("admin_player_recent_matches", { user_id: userId, limit_n: recentLimit }),
    rpc("admin_player_rating_series", { user_id: userId, days_n: seriesDays }),
    rpc("admin_player_purchase_count", { user_id: userId }),
  ]);
  return {
    recent: recentRes.status === "fulfilled"
      ? ((recentRes.value.data as unknown as PlayerRecentMatch[]) ?? [])
      : [],
    rating_series: seriesRes.status === "fulfilled"
      ? ((seriesRes.value.data as unknown as PlayerRatingPoint[]) ?? [])
      : [],
    purchase_count: purchasesRes.status === "fulfilled"
      ? Number(purchasesRes.value.data ?? 0)
      : 0,
  };
}
