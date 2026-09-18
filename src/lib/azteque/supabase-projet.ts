/**
 * Coordonnées du projet Supabase de l'application.
 *
 * Pourquoi en dur dans le dépôt plutôt qu'en variables d'environnement : la
 * plateforme réécrit `.env` et injecte ses propres `VITE_SUPABASE_*` à chaque
 * build, avec les valeurs de son projet interne. Tant que l'application vit sur
 * un projet Supabase externe, ces valeurs-là sont les bonnes et doivent gagner.
 *
 * Ce ne sont que des valeurs « publishable », de toute façon présentes en clair
 * dans le JavaScript servi au navigateur ; l'accès aux données reste protégé
 * par les policies RLS. Aucune clé de service ici (voir
 * `admin-client.server.ts`, qui lit `AZTEQUE_SERVICE_ROLE_KEY` dans les
 * secrets du déploiement).
 */
export const PROJET_ID = "jwhrkxqwhvfpdxuufbwz";
export const PROJET_URL = "https://jwhrkxqwhvfpdxuufbwz.supabase.co";
export const PROJET_PUBLISHABLE_KEY = "sb_publishable_6Zvqv5qoRVMj8RJNAfCHJA_oJHkbsKj";

/** Les nouvelles clés Supabase sont opaques, pas des JWT porteurs. */
export function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

/**
 * `fetch` qui envoie la clé en en-tête `apikey` et retire l'`Authorization`
 * que supabase-js remplit avec la clé elle-même (invalide pour ce format).
 */
export function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    if (
      isNewSupabaseApiKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }

    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}
