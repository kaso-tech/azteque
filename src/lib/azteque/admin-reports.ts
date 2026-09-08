import { supabase } from "@/integrations/supabase/client";

/**
 * Console d'administration — Signalements.
 *
 * RPC côté serveur (créées par la migration
 * `20260908190000_admin_reports_and_settings.sql`) :
 * - `admin_list_reports(text, text, int, int)` — liste filtrée
 * - `admin_resolve_report(bigint, text, text)` — résout ou rejette
 * - `submit_player_report(uuid, text, text)` — un joueur signale un autre
 *   joueur (côté client, on ne l'utilise pas dans la console)
 *
 * Comme partout : on appelle, le serveur décide.
 */

const rpc = (name: string, args: Record<string, unknown> = {}) =>
  (
    supabase as unknown as {
      rpc: (n: string, a: Record<string, unknown>) => ReturnType<typeof supabase.rpc>;
    }
  ).rpc(name, args);

export type ReportStatus = "open" | "resolved" | "dismissed";
export type ReportDecision = "resolved" | "dismissed";

export interface AdminReport {
  id: number;
  reporter_id: string;
  reporter_username: string | null;
  target_id: string;
  target_username: string | null;
  target_banned: boolean;
  reason: string;
  details: string | null;
  status: ReportStatus;
  resolution_note: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface ReportFilters {
  status?: ReportStatus;
  reason?: string;
  limit?: number;
  offset?: number;
}

export async function adminListReports(filters: ReportFilters = {}): Promise<AdminReport[]> {
  const { data, error } = await rpc("admin_list_reports", {
    status: filters.status ?? null,
    reason: filters.reason ?? null,
    limit: filters.limit ?? 50,
    offset: filters.offset ?? 0,
  });
  if (error) throw error;
  return (data as AdminReport[]) ?? [];
}

export async function adminResolveReport(
  id: number,
  decision: ReportDecision,
  note: string,
): Promise<void> {
  const { error } = await rpc("admin_resolve_report", { id, decision, note });
  if (error) throw error;
}
