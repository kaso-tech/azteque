import { supabase } from "@/integrations/supabase/client";

/**
 * Console d'administration — gestion des parties.
 *
 * Trois RPC côté serveur, créées par la migration
 * `20260908180000_admin_matches.sql` :
 * - `admin_list_matches(...)` — liste filtrée et paginée
 * - `admin_match_void(uuid, text)` — annule une partie (rend la mise)
 * - `admin_match_forfeit(uuid, uuid, text)` — désigne un gagnant par forfait
 *
 * Comme partout dans la console : on appelle, le serveur décide.
 */

const rpc = (name: string, args: Record<string, unknown> = {}) =>
  (
    supabase as unknown as {
      rpc: (n: string, a: Record<string, unknown>) => ReturnType<typeof supabase.rpc>;
    }
  ).rpc(name, args);

export type MatchStatusFilter = "all" | "playing" | "waiting" | "finished" | "settled";

export interface AdminMatchRow {
  id: string;
  code: string;
  host_id: string | null;
  host_username: string | null;
  guest_id: string | null;
  guest_username: string | null;
  winner_id: string | null;
  status: "playing" | "waiting" | "finished" | "settled";
  rounds_host: number;
  rounds_guest: number;
  bet_amount: number;
  rating_delta_host: number;
  rating_delta_guest: number;
  finished_at: string | null;
  settled_at: string | null;
  created_at: string;
}

export interface MatchFilters {
  status?: MatchStatusFilter;
  since?: string;
  until?: string;
  hostId?: string;
  guestId?: string;
  limit?: number;
  offset?: number;
}

export async function adminListMatches(filters: MatchFilters = {}): Promise<AdminMatchRow[]> {
  const { data, error } = await rpc("admin_list_matches", {
    status: filters.status ?? null,
    since: filters.since ?? null,
    until: filters.until ?? null,
    host: filters.hostId ?? null,
    guest: filters.guestId ?? null,
    limit: filters.limit ?? 50,
    offset: filters.offset ?? 0,
  });
  if (error) throw error;
  return (data as AdminMatchRow[]) ?? [];
}

export async function adminMatchVoid(matchId: string, reason: string): Promise<void> {
  const { error } = await rpc("admin_match_void", { id: matchId, reason });
  if (error) throw error;
}

export async function adminMatchForfeit(
  matchId: string,
  winnerId: string,
  reason: string,
): Promise<void> {
  const { error } = await rpc("admin_match_forfeit", {
    id: matchId,
    winner_id: winnerId,
    reason,
  });
  if (error) throw error;
}
