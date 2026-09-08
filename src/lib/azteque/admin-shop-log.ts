import { supabase } from "@/integrations/supabase/client";

/**
 * Boutique & journal — agrégats et annulation.
 *
 * Trois fonctions RPC nouvelles, créées par la migration
 * `20260908170000_admin_shop_and_revert.sql` :
 * - `admin_shop_sales_summary` : ventes par article sur 7 j
 * - `admin_list_log` : journal filtré et paginé
 * - `admin_revert_log_entry` : annulation d'une action réversible
 *
 * Comme partout dans la console : on appelle, le serveur décide.
 */

const rpc = (name: string, args: Record<string, unknown> = {}) =>
  (
    supabase as unknown as {
      rpc: (n: string, a: Record<string, unknown>) => ReturnType<typeof supabase.rpc>;
    }
  ).rpc(name, args);

export interface ShopSalesRow {
  item_id: string;
  ventes_7j: number;
  ca_7j: number;
  dernier_achat: string | null;
}

export async function adminShopSalesSummary(): Promise<ShopSalesRow[]> {
  const { data, error } = await rpc("admin_shop_sales_summary");
  if (error) throw error;
  return (data as unknown as ShopSalesRow[]) ?? [];
}

export interface AdminLogEntryV2 {
  id: number;
  admin_id: string | null;
  admin_username: string | null;
  action: string;
  target: string | null;
  details: Record<string, unknown>;
  at: string;
}

export interface AdminLogFilters {
  action?: string;
  adminId?: string;
  since?: string;
  until?: string;
  limit?: number;
  offset?: number;
}

export async function adminListLog(filters: AdminLogFilters = {}): Promise<AdminLogEntryV2[]> {
  const { data, error } = await rpc("admin_list_log", {
    _action: filters.action ?? null,
    _admin_id: filters.adminId ?? null,
    _since: filters.since ?? null,
    _until: filters.until ?? null,
    _limit: filters.limit ?? 50,
    _offset: filters.offset ?? 0,
  });
  if (error) throw error;
  return (data as AdminLogEntryV2[]) ?? [];
}

/**
 * Annule l'action d'une ligne du journal. Retourne le type d'action
 * annulée (« tokens », « ban » ou « admin »), ou lève une erreur si
 * l'entrée est non réversible.
 */
export async function adminRevertLogEntry(id: number): Promise<string> {
  const { data, error } = await rpc("admin_revert_log_entry", { _id: id });
  if (error) throw error;
  return String(data ?? "");
}
