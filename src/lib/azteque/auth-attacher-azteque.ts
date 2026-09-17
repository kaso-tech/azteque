/**
 * Attache le jeton de session aux appels de fonctions serveur.
 *
 * Équivalent de `attachSupabaseAuth` (généré automatiquement), mais lisant la
 * session du client de `supabase-client.ts` : la session est rangée sous une
 * clé propre au projet, celle du client généré serait toujours vide.
 */
import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "@/lib/azteque/supabase-client";

export const attachAztequeAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return next({
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
});
