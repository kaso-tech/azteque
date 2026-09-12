CREATE OR REPLACE FUNCTION public.award_ai_win(_difficulty text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _reward integer;
  _new integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND banned) THEN
    RAISE EXCEPTION 'Compte suspendu';
  END IF;

  _reward := CASE _difficulty
    WHEN 'facile' THEN 20
    WHEN 'normal' THEN 40
    WHEN 'expert' THEN 60
    WHEN 'maitre' THEN 80
    WHEN 'grand_maitre' THEN 100
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
$function$;

REVOKE ALL ON FUNCTION public.award_ai_win(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.award_ai_win(text) TO authenticated;