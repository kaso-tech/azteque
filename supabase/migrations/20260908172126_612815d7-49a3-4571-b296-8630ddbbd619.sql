ALTER FUNCTION public.elo_k(integer, integer) SET search_path = public;
ALTER FUNCTION public.rating_floor() SET search_path = public;

DO $$
DECLARE
  f record;
  allowed text[] := ARRAY[
    'accept_game_invite','award_ai_win','buy_item','claim_daily_bonus','claim_local_tokens',
    'create_profile','is_admin','join_match_by_code','my_referral_code','my_referrals',
    'settle_match','submit_player_report','sync_google_identity','touch_last_seen'
  ];
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
    IF f.proname LIKE 'admin\_%' OR f.proname = ANY(allowed) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
    END IF;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';