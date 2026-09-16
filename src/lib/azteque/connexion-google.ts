import { supabase } from "@/integrations/supabase/client";

/**
 * Par où passe la connexion Google.
 *
 * Il existe deux chemins, et le projet n'en empruntait qu'un — celui du
 * courtier Lovable. C'est le seul point du code qui attachait réellement
 * l'application à la plateforme : tout le reste (les deux clients Supabase,
 * les 75 migrations, les deux seaux de stockage) ne lit que des variables
 * d'environnement et suivrait n'importe quel projet.
 *
 * Le courtier existe pour une raison précise : dans l'aperçu de l'éditeur, la
 * page tourne en iframe sur un domaine jetable, où une redirection OAuth
 * ordinaire ne revient pas. Il y règle un vrai problème, et seulement là.
 *
 * Partout ailleurs — le domaine de production, l'application Android, un poste
 * de développement, un hébergement quelconque — Supabase sait faire la
 * connexion lui-même, à condition que le fournisseur Google soit activé dans
 * le projet. C'est donc ce chemin qu'on prend par défaut.
 */

/** Les domaines où l'éditeur sert ses aperçus. */
const ZONES_APERCU = [
  "lovableproject.com",
  "lovableproject-dev.com",
  "lovable.app",
  "gpt-eng.com",
  "gptengineer.run",
];

/**
 * Faut-il passer par le courtier plutôt que par Supabase ?
 *
 * Les deux conditions comptent, et aucune ne suffit seule. Hors iframe, même
 * sur un domaine d'aperçu, la redirection ordinaire revient très bien. Et dans
 * une iframe sur un autre domaine, le courtier n'aurait de toute façon pas
 * d'éditeur à qui parler.
 */
export function passerParLeCourtier(hostname: string, encadre: boolean): boolean {
  if (!encadre) return false;
  return ZONES_APERCU.some((z) => hostname === z || hostname.endsWith("." + z));
}

/**
 * Ouvre la connexion Google.
 *
 * Le repli sur le courtier n'est pas de la superstition : tant que le
 * fournisseur Google n'est pas activé dans le projet Supabase visé, l'appel
 * direct échoue SANS rediriger, et Supabase le dit (« Unsupported provider »).
 * Reprendre alors l'ancien chemin laisse l'application fonctionner pendant
 * toute la bascule, y compris entre le moment où le nouveau projet est branché
 * et celui où son fournisseur est configuré.
 */
export async function signInWithGoogle(): Promise<void> {
  const encadre = typeof window !== "undefined" && window.parent !== window;
  const hote = typeof location !== "undefined" ? location.hostname : "";

  if (!passerParLeCourtier(hote, encadre)) {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    // Pas d'erreur : le navigateur est déjà parti vers Google, rien ne suit.
    if (!error) return;
    console.warn("[connexion] Google refusé par Supabase, repli sur le courtier :", error.message);
  }

  const { lovable } = await import("@/integrations/lovable");
  await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
}
