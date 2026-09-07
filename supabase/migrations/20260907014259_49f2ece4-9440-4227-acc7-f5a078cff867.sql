-- Cadeau quotidien et barème des victoires contre l'IA.
--
-- Deux ajustements de l'économie du jeu, qui n'ont d'effet que sur les jetons.
-- Le classement, lui, reste étranger à tout cela : il ne se joue qu'entre
-- comptes, sur des parties dont le serveur lit lui-même le vainqueur.

/* ------------------------------------------------------------------ */
/* Victoires contre l'IA                                               */
/* ------------------------------------------------------------------ */

-- Barème resserré : le jeu contre l'IA n'engage rien et se répète à volonté,
-- il ne doit donc pas rapporter davantage qu'un champ disputé face à un autre
-- joueur. Il reste la seule source de jetons hors connexion.
CREATE OR REPLACE FUNCTION public.award_ai_win(_difficulty text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _reward integer;
  _new integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  _reward := CASE _difficulty
    WHEN 'facile' THEN 20
    WHEN 'normal' THEN 40
    WHEN 'expert' THEN 60
    WHEN 'maitre' THEN 80
    WHEN 'legende' THEN 100
    ELSE 0
  END;
  IF _reward = 0 THEN
    RAISE EXCEPTION 'Niveau inconnu';
  END IF;

  UPDATE public.profiles SET tokens = tokens + _reward
  WHERE id = auth.uid()
  RETURNING tokens INTO _new;
  RETURN _new;
END;
$$;

REVOKE ALL ON FUNCTION public.award_ai_win(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.award_ai_win(text) TO authenticated;

/* ------------------------------------------------------------------ */
/* Cadeau quotidien                                                    */
/* ------------------------------------------------------------------ */

-- Date du dernier cadeau perçu. Une date, et non un horodatage : le cadeau se
-- rattache à une journée civile, pas à un délai de vingt-quatre heures, de
-- sorte qu'un joueur qui ouvre le jeu chaque matin ne voie pas l'heure du
-- rendez-vous glisser un peu plus loin chaque jour.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS daily_bonus_at date NOT NULL DEFAULT DATE '1970-01-01';

-- Verse le cadeau du jour, une fois par journée civile.
--
-- C'est la base qui décide : le client ne fait que demander. Il reçoit en
-- retour ce qui a été versé — zéro si le cadeau du jour était déjà pris — et
-- le solde à jour, ce qui lui évite une seconde lecture.
CREATE OR REPLACE FUNCTION public.claim_daily_bonus()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _amount constant integer := 50;
  _granted integer := 0;
  _new integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  UPDATE public.profiles
     SET tokens = tokens + _amount,
         daily_bonus_at = current_date
   WHERE id = auth.uid()
     AND daily_bonus_at < current_date
  RETURNING tokens INTO _new;

  IF _new IS NULL THEN
    -- Déjà pris aujourd'hui : on rend le solde tel quel, sans erreur. Deux
    -- onglets ouverts au même moment ne doivent pas produire d'incident.
    SELECT tokens INTO _new FROM public.profiles WHERE id = auth.uid();
  ELSE
    _granted := _amount;
  END IF;

  RETURN jsonb_build_object('granted', _granted, 'tokens', COALESCE(_new, 0));
END;
$$;

REVOKE ALL ON FUNCTION public.claim_daily_bonus() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_daily_bonus() TO authenticated;

NOTIFY pgrst, 'reload schema';