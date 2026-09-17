/**
 * Vérification du jeton porteur côté serveur.
 *
 * Équivalent de `requireSupabaseAuth` (`src/integrations/supabase/auth-middleware.ts`,
 * généré automatiquement), mais validé contre le projet Supabase de
 * l'application (`supabase-projet.ts`) et non contre celui de la plateforme :
 * un jeton émis par notre projet serait sinon refusé.
 */
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  PROJET_PUBLISHABLE_KEY,
  PROJET_URL,
  createSupabaseFetch,
} from "@/lib/azteque/supabase-projet";

export const requireAztequeAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const request = getRequest();

  if (!request?.headers) {
    throw new Error("Unauthorized: No request headers available");
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    throw new Error("Unauthorized: No authorization header provided");
  }
  if (!authHeader.startsWith("Bearer ")) {
    throw new Error("Unauthorized: Only Bearer tokens are supported");
  }

  const token = authHeader.replace("Bearer ", "");
  if (!token || token.split(".").length !== 3) {
    throw new Error("Unauthorized: Invalid token");
  }

  const supabase = createClient<Database>(PROJET_URL, PROJET_PUBLISHABLE_KEY, {
    global: {
      fetch: createSupabaseFetch(PROJET_PUBLISHABLE_KEY),
      headers: { Authorization: `Bearer ${token}` },
    },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims) {
    throw new Error("Unauthorized: Invalid token");
  }
  if (!data.claims.sub) {
    throw new Error("Unauthorized: No user ID found in token");
  }

  return next({
    context: {
      supabase,
      userId: data.claims.sub,
      claims: data.claims,
    },
  });
});
