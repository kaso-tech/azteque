/**
 * PR19 — Garde serveur : vérifie que l'utilisateur courant est admin.
 *
 * À utiliser dans les server functions (createServerFn) qui font des
 * opérations sensibles (upload d'asset boutique). Le contexte est
 * rempli par `requireSupabaseAuth` (id + supabase). On lit la table
 * `profiles` côté serveur avec service_role.
 */

interface AuthContext {
  userId?: string;
  supabase?: import("@supabase/supabase-js").SupabaseClient;
}

export async function isAdminRpcServer(context: AuthContext): Promise<boolean> {
  const userId = context.userId;
  if (!userId) return false;
  const { supabaseAdmin } = await import("@/lib/azteque/admin-client.server");
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return false;
  return data.is_admin === true;
}
