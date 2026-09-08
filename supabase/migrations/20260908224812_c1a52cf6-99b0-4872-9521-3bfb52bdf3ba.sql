-- 1. Retirer l'accès anonyme aux fonctions d'administration
REVOKE EXECUTE ON FUNCTION public.admin_dashboard_series(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_dashboard_top_countries(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_dashboard_top_players(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_player_purchase_count(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_player_rating_series(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_player_recent_matches(uuid, integer) FROM anon;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

-- 2. Profils : élargir la protection des colonnes sensibles
CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user IN ('service_role', 'postgres') THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.referral_code IS DISTINCT FROM OLD.referral_code
     OR NEW.first_name IS DISTINCT FROM OLD.first_name
     OR NEW.last_name IS DISTINCT FROM OLD.last_name
  THEN
    RAISE EXCEPTION 'Colonnes non modifiables : identité, code de parrainage, date de création.';
  END IF;

  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.tokens IS DISTINCT FROM OLD.tokens
     OR NEW.claimed_local_tokens IS DISTINCT FROM OLD.claimed_local_tokens
     OR NEW.daily_bonus_at IS DISTINCT FROM OLD.daily_bonus_at
     OR NEW.local_tokens_total IS DISTINCT FROM OLD.local_tokens_total
     OR NEW.is_admin IS DISTINCT FROM OLD.is_admin
     OR NEW.banned IS DISTINCT FROM OLD.banned
     OR NEW.rating IS DISTINCT FROM OLD.rating
     OR NEW.peak_rating IS DISTINCT FROM OLD.peak_rating
     OR NEW.rated_games IS DISTINCT FROM OLD.rated_games
     OR NEW.rounds_played IS DISTINCT FROM OLD.rounds_played
  THEN
    RAISE EXCEPTION 'Colonnes protégées : jetons, statut admin, suspension, cote, parties classées.';
  END IF;

  RETURN NEW;
END;
$function$;

-- Le rôle « authenticated » ne peut écrire que les colonnes de présentation
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (username, avatar_kind, avatar_url, country, last_seen_at)
  ON public.profiles TO authenticated;
REVOKE ALL ON public.profiles FROM anon;

-- 3. Parties : pas de suppression ni de référence directe
REVOKE ALL ON public.matches FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.matches TO authenticated;
REVOKE ALL ON public.matches FROM anon;

-- 4. Achats et parrainages : lecture seule côté client, écriture par les fonctions serveur
REVOKE INSERT, UPDATE, DELETE ON public.purchases FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.referrals FROM authenticated;
REVOKE ALL ON public.purchases FROM anon;
REVOKE ALL ON public.referrals FROM anon;
GRANT SELECT ON public.purchases TO authenticated;
GRANT SELECT ON public.referrals TO authenticated;
GRANT ALL ON public.purchases TO service_role;
GRANT ALL ON public.referrals TO service_role;

-- 5. Rétablir les exécutions légitimes pour les joueurs connectés
GRANT EXECUTE ON FUNCTION public.accept_game_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.award_ai_win(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buy_item(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_daily_bonus() TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_local_tokens(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_profile(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_match_by_code(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_referral_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_referrals() TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_player_report(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_google_identity() TO authenticated;
GRANT EXECUTE ON FUNCTION public.touch_last_seen() TO authenticated;
GRANT EXECUTE ON FUNCTION public.settle_match(uuid) TO authenticated;

DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname LIKE 'admin\_%'
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';