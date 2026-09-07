-- Protection des champs sensibles contre la modification directe par le client.
--
-- Le client garde le droit de modifier son profil (pseudo, avatar) et sa partie
-- en cours, mais plus les champs qui valent de l'argent ou un résultat :
-- ceux-là ne bougent que via les fonctions SECURITY DEFINER (qui s'exécutent
-- avec le rôle propriétaire) ou via le rôle service_role côté serveur.

/* ------------------------------------------------------------------ */
/* Jetons et bonus du profil                                           */
/* ------------------------------------------------------------------ */

CREATE OR REPLACE FUNCTION public.protect_profile_currency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (NEW.tokens IS DISTINCT FROM OLD.tokens
      OR NEW.claimed_local_tokens IS DISTINCT FROM OLD.claimed_local_tokens
      OR NEW.daily_bonus_at IS DISTINCT FROM OLD.daily_bonus_at)
     AND current_user NOT IN ('service_role', 'postgres') THEN
    RAISE EXCEPTION 'tokens, claimed_local_tokens and daily_bonus_at can only be written by secured server functions';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_currency ON public.profiles;
CREATE TRIGGER profiles_protect_currency BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_currency();

/* ------------------------------------------------------------------ */
/* Résultat et règlement d'une partie                                  */
/* ------------------------------------------------------------------ */

CREATE OR REPLACE FUNCTION public.protect_match_outcome()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (NEW.winner_id IS DISTINCT FROM OLD.winner_id
      OR NEW.settled_at IS DISTINCT FROM OLD.settled_at
      OR NEW.finished_at IS DISTINCT FROM OLD.finished_at)
     AND current_user NOT IN ('service_role', 'postgres') THEN
    RAISE EXCEPTION 'winner_id, finished_at and settled_at can only be written by secured server functions';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS matches_protect_outcome ON public.matches;
CREATE TRIGGER matches_protect_outcome BEFORE UPDATE ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.protect_match_outcome();