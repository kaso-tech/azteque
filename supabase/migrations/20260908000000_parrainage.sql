-- Parrainage, et jetons de bienvenue à la création d'un compte.
--
-- Deux versements, tous deux décidés par la base et jamais par le client :
--
--   * 100 jetons de bienvenue à tout compte créé à partir de maintenant ;
--   * 500 jetons au parrain pour chaque filleul qui s'inscrit avec son code.
--
-- Ces montants sont écrits ici ET dans `src/lib/azteque/tokens.ts`, où ils ne
-- servent qu'à l'affichage : c'est cette migration qui fait foi. Les changer
-- d'un seul côté ferait mentir l'interface, pas les comptes.
--
-- Le parrainage passe entièrement par `create_profile` : il se règle à
-- l'inscription, en une seule transaction avec la création du profil. Un
-- filleul ne peut donc pas être parrainé deux fois, ni changer de parrain
-- après coup, ni se parrainer lui-même — les trois abus évidents d'un tel
-- système, et les seuls qu'on puisse fermer sans se donner l'illusion de
-- reconnaître les faux comptes.

/* ------------------------------------------------------------------ */
/* Code de parrainage                                                  */
/* ------------------------------------------------------------------ */

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_code text;

-- Unicité insensible à la casse : un code se recopie à la main depuis un
-- message, et personne ne fait attention aux majuscules en le tapant.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_referral_code_unique
  ON public.profiles (upper(referral_code))
  WHERE referral_code IS NOT NULL;

-- La colonne se lit (le joueur doit voir son code, et le code d'un autre ne
-- vaut rien de plus qu'une invitation à le créditer) mais ne s'écrit pas
-- depuis le client : seules les fonctions ci-dessous y touchent.

/* ------------------------------------------------------------------ */
/* Parrainages                                                         */
/* ------------------------------------------------------------------ */

CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  -- Un joueur n'est le filleul que d'une seule personne, et une seule fois :
  -- c'est cette contrainte, et non un contrôle applicatif, qui l'impose.
  invited_id uuid NOT NULL UNIQUE REFERENCES public.profiles (id) ON DELETE CASCADE,
  code text NOT NULL,
  reward integer NOT NULL CHECK (reward >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT referrals_pas_soi_meme CHECK (sponsor_id <> invited_id)
);

CREATE INDEX IF NOT EXISTS referrals_sponsor_idx
  ON public.referrals (sponsor_id, created_at DESC);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.referrals FROM anon, authenticated;
GRANT SELECT ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;

DROP POLICY IF EXISTS "Chacun voit ses parrainages" ON public.referrals;
CREATE POLICY "Chacun voit ses parrainages" ON public.referrals FOR SELECT TO authenticated
USING (sponsor_id = auth.uid() OR invited_id = auth.uid());

/* ------------------------------------------------------------------ */
/* Génération d'un code                                                */
/* ------------------------------------------------------------------ */

-- Huit caractères d'un alphabet sans I, O, 0 ni 1 : un code se dicte au
-- téléphone et se recopie depuis une capture d'écran, deux situations où ces
-- quatre-là se confondent.
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  _code text;
  _essai int;
  _i int;
BEGIN
  FOR _essai IN 1..40 LOOP
    _code := '';
    FOR _i IN 1..8 LOOP
      _code := _code || substr(_alphabet, 1 + floor(random() * length(_alphabet))::int, 1);
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE upper(referral_code) = _code) THEN
      RETURN _code;
    END IF;
  END LOOP;
  RAISE EXCEPTION 'Impossible de tirer un code de parrainage libre';
END;
$$;

REVOKE ALL ON FUNCTION public.generate_referral_code() FROM PUBLIC;

/**
 * Le code du joueur connecté, créé au premier appel.
 *
 * Les comptes existants n'en ont pas : plutôt qu'un remplissage massif, le
 * code naît la première fois que son propriétaire le demande.
 */
CREATE OR REPLACE FUNCTION public.my_referral_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _code text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT referral_code INTO _code FROM public.profiles WHERE id = auth.uid();
  IF _code IS NOT NULL THEN
    RETURN _code;
  END IF;

  UPDATE public.profiles
  SET referral_code = public.generate_referral_code(), updated_at = now()
  WHERE id = auth.uid() AND referral_code IS NULL
  RETURNING referral_code INTO _code;

  -- Deux onglets ouverts ensemble : le second n'a rien mis à jour, mais le
  -- code existe désormais.
  IF _code IS NULL THEN
    SELECT referral_code INTO _code FROM public.profiles WHERE id = auth.uid();
  END IF;
  RETURN _code;
END;
$$;

REVOKE ALL ON FUNCTION public.my_referral_code() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_referral_code() TO authenticated;

/* ------------------------------------------------------------------ */
/* Création d'un compte                                                */
/* ------------------------------------------------------------------ */

/**
 * Crée le profil du joueur connecté, verse ses jetons de bienvenue et règle
 * le parrainage — le tout en une transaction.
 *
 * Le client insérait jusqu'ici la ligne lui-même. Il ne peut plus : les
 * jetons ne s'écrivent pas depuis le navigateur, et un parrainage réglé en
 * deux temps laisserait la porte ouverte à un compte créé sans sa
 * récompense, ou à une récompense versée sans compte.
 *
 * Un code de parrainage inconnu ARRÊTE l'inscription au lieu d'être ignoré :
 * le joueur qui a pris la peine de le saisir doit savoir qu'il s'est trompé,
 * pendant qu'il peut encore le corriger. C'est le seul instant où il le peut.
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
  VALUES (_me, _username, 100, public.generate_referral_code())
  RETURNING * INTO _profil;

  IF _parrain IS NOT NULL THEN
    INSERT INTO public.referrals (sponsor_id, invited_id, code, reward)
    VALUES (_parrain, _me, _code, 500);
    UPDATE public.profiles SET tokens = tokens + 500, updated_at = now() WHERE id = _parrain;
  END IF;

  RETURN _profil;
END;
$$;

REVOKE ALL ON FUNCTION public.create_profile(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_profile(text, text) TO authenticated;

-- La création passant désormais par la fonction ci-dessus, le client n'a plus
-- à insérer lui-même : on lui retire ce droit, faute de quoi il resterait un
-- chemin d'inscription sans jetons de bienvenue ni parrainage.
REVOKE INSERT ON public.profiles FROM authenticated;

/* ------------------------------------------------------------------ */
/* Tableau de bord du parrain                                          */
/* ------------------------------------------------------------------ */

/** Les filleuls du joueur connecté, du plus récent au plus ancien. */
CREATE OR REPLACE FUNCTION public.my_referrals()
RETURNS TABLE (username text, reward integer, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.username, r.reward, r.created_at
  FROM public.referrals r
  JOIN public.profiles p ON p.id = r.invited_id
  WHERE r.sponsor_id = auth.uid()
  ORDER BY r.created_at DESC
  LIMIT 200;
$$;

REVOKE ALL ON FUNCTION public.my_referrals() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_referrals() TO authenticated;

NOTIFY pgrst, 'reload schema';
