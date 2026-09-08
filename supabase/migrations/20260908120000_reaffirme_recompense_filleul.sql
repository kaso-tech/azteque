-- Réaffirme la récompense du filleul, après un rejeu qui l'aurait défaite.
--
-- Le pipeline Lovable a dupliqué la migration 20260908000000_parrainage.sql
-- sous un nom généré par sa plateforme
-- (20260908091351_d8c53f62-b5eb-4f90-b0a9-55846256ff5e.sql), avec un contenu
-- identique. Ce nom de fichier trie APRÈS 20260908010000_recompense_filleul.sql
-- : si les migrations sont un jour rejouées dans l'ordre de leur nom, ce
-- doublon écraserait silencieusement la fonction `create_profile` corrigée
-- par l'ancienne version, qui ne verse rien au filleul.
--
-- Plutôt que de parier sur l'ordre effectif d'application, cette migration
-- réaffirme la version voulue de `create_profile`, à un horodatage
-- postérieur au doublon : elle est donc, par construction, la dernière à
-- s'appliquer et la seule qui compte. Contenu strictement identique à
-- 20260908010000_recompense_filleul.sql.

CREATE OR REPLACE FUNCTION public.create_profile(_username text, _referral_code text DEFAULT NULL)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _me uuid := auth.uid();
  _profil public.profiles;
  _parrain uuid;
  _code text;
  _bonus_filleul constant integer := 200;
BEGIN
  IF _me IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  _username := TRIM(BOTH FROM COALESCE(_username, ''));
  IF _username !~ '^[A-Za-z0-9_-]{3,20}$' THEN
    RAISE EXCEPTION 'Pseudo : 3 à 20 caractères, lettres, chiffres, tiret ou souligné.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = _me) THEN
    RAISE EXCEPTION 'Vous avez déjà un compte.';
  END IF;

  _code := NULLIF(UPPER(TRIM(BOTH FROM COALESCE(_referral_code, ''))), '');
  IF _code IS NOT NULL THEN
    SELECT id INTO _parrain FROM public.profiles WHERE upper(referral_code) = _code;
    IF _parrain IS NULL THEN
      RAISE EXCEPTION 'Ce code de parrainage n''existe pas.';
    END IF;
    IF _parrain = _me THEN
      RAISE EXCEPTION 'On ne se parraine pas soi-même.';
    END IF;
  END IF;

  INSERT INTO public.profiles (id, username, tokens, referral_code)
  VALUES (_me, _username, 100 + CASE WHEN _parrain IS NOT NULL THEN _bonus_filleul ELSE 0 END,
          public.generate_referral_code())
  RETURNING * INTO _profil;

  IF _parrain IS NOT NULL THEN
    INSERT INTO public.referrals (sponsor_id, invited_id, code, reward, invitee_reward)
    VALUES (_parrain, _me, _code, 500, _bonus_filleul);
    UPDATE public.profiles SET tokens = tokens + 500, updated_at = now() WHERE id = _parrain;
  END IF;

  RETURN _profil;
END;
$$;

REVOKE ALL ON FUNCTION public.create_profile(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_profile(text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
