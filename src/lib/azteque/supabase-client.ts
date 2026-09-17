/**
 * Client Supabase du navigateur.
 *
 * Équivalent de `src/integrations/supabase/client.ts` (généré automatiquement,
 * non modifiable), à une différence près : l'URL et la clé viennent de
 * `supabase-projet.ts` et non des variables injectées par la plateforme, qui
 * pointent encore vers son projet interne.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { brokeredPreviewStorage } from "@/integrations/supabase/previewAuthStorage";
import {
  PROJET_PUBLISHABLE_KEY,
  PROJET_URL,
  createSupabaseFetch,
} from "@/lib/azteque/supabase-projet";

function createSupabaseClient() {
  return createClient<Database>(PROJET_URL, PROJET_PUBLISHABLE_KEY, {
    global: {
      fetch: createSupabaseFetch(PROJET_PUBLISHABLE_KEY),
    },
    auth: {
      storage: brokeredPreviewStorage(),
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

let _supabase: ReturnType<typeof createSupabaseClient> | undefined;

export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();
    return Reflect.get(_supabase, prop, receiver);
  },
});
