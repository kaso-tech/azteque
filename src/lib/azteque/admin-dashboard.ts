import { supabase } from "@/integrations/supabase/client";

/**
 * Console d'administration — agrégats pour le tableau de bord.
 *
 * Quatre fonctions lisibles côté client, branchées sur les RPC
 * `admin_dashboard_*` créées par la migration
 * `20260908160000_admin_dashboard.sql`. Toutes sont `STABLE` et
 * `SECURITY DEFINER` : le client n'a pas besoin de droits spéciaux sur
 * les tables sous-jacentes.
 */

const rpc = (name: string, args: Record<string, unknown> = {}) =>
  (
    supabase as unknown as {
      rpc: (n: string, a: Record<string, unknown>) => ReturnType<typeof supabase.rpc>;
    }
  ).rpc(name, args);

export interface DashboardStats {
  active_24h: number;
  matches_24h: number;
  tokens_circulation: number;
  revenue_7d: number;
  active_24h_delta: number | null;
  matches_24h_delta: number | null;
  stuck_matches: number;
}

export interface DashboardSeriesPoint {
  jour: string;
  parties: number;
  nouveaux_joueurs: number;
}

export interface DashboardTopCountry {
  country: string;
  joueurs: number;
}

export interface DashboardTopPlayer {
  user_id: string;
  username: string;
  country: string | null;
  rating: number;
  delta: number;
  parties: number;
}

/** Chiffres de tête du tableau de bord. */
export async function adminDashboardStats(): Promise<DashboardStats> {
  const { data, error } = await rpc("admin_dashboard_stats");
  if (error) throw error;
  return (data as DashboardStats) ?? {
    active_24h: 0,
    matches_24h: 0,
    tokens_circulation: 0,
    revenue_7d: 0,
    active_24h_delta: null,
    matches_24h_delta: null,
    stuck_matches: 0,
  };
}

/** Série quotidienne : parties jouées + nouveaux comptes par jour. */
export async function adminDashboardSeries(days = 14): Promise<DashboardSeriesPoint[]> {
  const { data, error } = await rpc("admin_dashboard_series", { days });
  if (error) throw error;
  return (data as DashboardSeriesPoint[]) ?? [];
}

/** Top pays par nombre de joueurs, avec leur code ISO à deux lettres. */
export async function adminDashboardTopCountries(limit = 5): Promise<DashboardTopCountry[]> {
  const { data, error } = await rpc("admin_dashboard_top_countries", { limit });
  if (error) throw error;
  return (data as DashboardTopCountry[]) ?? [];
}

/** Top joueurs par gain de cote net sur 7 jours. */
export async function adminDashboardTopPlayers(limit = 5): Promise<DashboardTopPlayer[]> {
  const { data, error } = await rpc("admin_dashboard_top_players", { limit });
  if (error) throw error;
  return (data as DashboardTopPlayer[]) ?? [];
}
