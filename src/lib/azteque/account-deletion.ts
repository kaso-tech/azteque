/**
 * Suppression de compte.
 *
 * Play Store impose, pour toute application qui permet de créer un compte,
 * de pouvoir aussi le supprimer depuis l'application elle-même — pas
 * seulement par un formulaire web ou une adresse e-mail à contacter.
 *
 * La suppression est immédiate et définitive, sans purge différée : le jeu
 * ne conserve aucune donnée qui justifierait un délai de grâce (pas de
 * transaction réelle, aucune obligation comptable), et un délai n'ajouterait
 * qu'une infrastructure de purge différée dont le projet n'a pas besoin.
 *
 * Le graphe de clés étrangères depuis `auth.users` a été vérifié : les
 * tables qui appartiennent au joueur (profiles, friendships, game_invites,
 * purchases, player_reports, referrals) sont en CASCADE ; celles qui gardent
 * une trace historique (matches.host_id/guest_id/winner_id, admin_log.admin_id,
 * sound_files.updated_by, player_reports.resolved_by) passent à NULL. La
 * suppression du compte `auth.users` est donc sans orphelin ni contrainte
 * bloquante — nul besoin de nettoyer les tables une à une ici.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireAztequeAuth } from "@/lib/azteque/auth-middleware-azteque";

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireAztequeAuth])
  .handler(async ({ context }): Promise<void> => {
    const userId = context.userId;
    if (!userId) throw new Error("Unauthorized");

    const { supabaseAdmin } = await import("@/lib/azteque/admin-client.server");

    // Se révoquer soi-même comme administrateur est déjà refusé
    // (`admin_set_admin`) pour ne jamais laisser la console sans personne
    // pour l'ouvrir : une suppression de compte ferait la même chose par un
    // autre chemin, donc la même garde s'applique.
    const { data: moi, error: eMoi } = await supabaseAdmin
      .from("profiles")
      .select("is_admin")
      .eq("id", userId)
      .maybeSingle();
    if (eMoi) throw new Error(eMoi.message);
    if (moi?.is_admin) {
      const { count, error: eCompte } = await supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("is_admin", true);
      if (eCompte) throw new Error(eCompte.message);
      if ((count ?? 0) <= 1) {
        throw new Error(
          "Dernier administrateur : nommez un autre administrateur avant de supprimer ce compte.",
        );
      }
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);
  });
