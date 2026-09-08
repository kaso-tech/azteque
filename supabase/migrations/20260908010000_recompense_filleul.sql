-- Le filleul touche lui aussi une récompense de parrainage : 200 jetons, en
-- plus de ses 100 jetons de bienvenue (300 au total pour qui s'inscrit avec
-- un code valide).
--
-- La migration précédente (20260908000000_parrainage.sql) est déjà poussée :
-- on ne la modifie pas, on la complète ici, comme convenu pour toute
-- évolution ultérieure d'une migration déjà publiée.
--
-- `referrals.reward` continue de désigner ce que touche le PARRAIN (500) ;
-- une colonne dédiée `invitee_reward` garde trace de ce que le filleul a
-- reçu, pour que le tableau de bord puisse un jour l'afficher sans deviner un
-- montant qui pourrait changer entre-temps.

ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS invitee_reward integer NOT NULL DEFAULT 0 CHECK (invitee_reward >= 0);

/**
 * Crée le profil du joueur connecté, verse ses jetons de bienvenue et règle
 * le parrainage — le tout en une transaction.
 *
 * Reprise à l'identique de la version précédente, à un seul changement : le
 * filleul reçoit désormais 200 jetons de parrainage en plus de ses 100
 * jetons de bienvenue, quand il s'inscrit avec un code valide.
 */
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
