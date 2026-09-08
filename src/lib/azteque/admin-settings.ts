import { supabase } from "@/integrations/supabase/client";

/**
 * Console d'administration — Réglages.
 *
 * La table `app_settings` (clé/valeur jsonb) est déjà en place. On a
 * trois RPC :
 * - `admin_list_settings()` — tous les réglages
 * - `admin_get_setting(text)` — un seul réglage
 * - `admin_set_setting(text, jsonb)` — écriture (existait déjà)
 *
 * Côté client, on sérialise les réglages en dictionnaire pour
 * simplifier les lectures/écritures.
 */

const rpc = (name: string, args: Record<string, unknown> = {}) =>
  (
    supabase as unknown as {
      rpc: (n: string, a: Record<string, unknown>) => ReturnType<typeof supabase.rpc>;
    }
  ).rpc(name, args);

export interface AppSetting {
  key: string;
  value: unknown;
  updated_at: string;
}

export async function adminListSettings(): Promise<AppSetting[]> {
  const { data, error } = await rpc("admin_list_settings");
  if (error) throw error;
  return (data as unknown as AppSetting[]) ?? [];
}

export async function adminGetSetting(key: string): Promise<unknown> {
  const { data, error } = await rpc("admin_get_setting", { _key: key });
  if (error) throw error;
  return data;
}

/** Raccourci : on garde la signature existante pour ne rien casser. */
export async function adminSetSetting(key: string, value: unknown): Promise<void> {
  const { error } = await rpc("admin_set_setting", { _key: key, _value: value });
  if (error) throw error;
}
