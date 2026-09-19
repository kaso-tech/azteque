-- Le balayage des parties abandonnées ne pouvait rien clore.
--
-- `terminer_parties_abandonnees()` écrit l'état de la table pour y inscrire
-- l'abandon, mais le garde-fou `protect_match_mutable_columns` n'autorise
-- cette écriture qu'au rôle de service. Exécuté en SECURITY DEFINER, le
-- balayage se présente sous le rôle `postgres` : chaque passage échouait donc
-- sur « state and settings can only be written by the match-action server
-- function », et les tables bloquées restaient éternellement « en cours ».
--
-- Deux corrections :
--   1. un drapeau posé pour la seule durée de la transaction du balayage, que
--      le garde-fou accepte ; aucun client ne peut le poser, il n'existe
--      aucune fonction exposée qui appelle set_config ;
--   2. les tables sans adversaire (nées d'une invitation jamais honorée) sont
--      closes elles aussi, sans vainqueur ni mise : elles n'entraient pas dans
--      le balayage, qui exigeait deux joueurs assis.

CREATE OR REPLACE FUNCTION public.protect_match_mutable_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF (NEW.state IS DISTINCT FROM OLD.state OR NEW.settings IS DISTINCT FROM OLD.settings)
     AND current_user <> 'service_role'
     AND COALESCE(current_setting('azteque.balayage', true), '') <> 'on' THEN
    RAISE EXCEPTION 'state and settings can only be written by the match-action server function';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.terminer_parties_abandonnees()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _m public.matches;
  _tour int;
  _champ int;
  _finies int := 0;
BEGIN
  PERFORM set_config('azteque.balayage', 'on', true);

  FOR _m IN
    SELECT * FROM public.matches
    WHERE status = 'playing'
      AND settled_at IS NULL
      AND updated_at < now() - public.abandon_delai()
    ORDER BY updated_at
    FOR UPDATE SKIP LOCKED
  LOOP
    IF _m.state IS NULL OR _m.host_id IS NULL OR _m.guest_id IS NULL THEN
      -- Table jamais distribuée, ou siège vide : rien à trancher, rien à payer.
      UPDATE public.matches
        SET status = 'finished', finished_at = now(), settled_at = now()
        WHERE id = _m.id;
    ELSIF _m.state ->> 'phase' = 'gameEnd' THEN
      PERFORM public._settle_match_impl(_m.id);
    ELSE
      _tour := COALESCE((_m.state ->> 'turn')::int, 0);
      _champ := CASE WHEN _tour = 0 THEN 1 ELSE 0 END;
      UPDATE public.matches
        SET state = jsonb_set(
              jsonb_set(
                jsonb_set(_m.state, '{phase}', '"gameEnd"'::jsonb, true),
                '{champWinner}', to_jsonb(_champ), true),
              '{forfeit}',
              jsonb_build_object('loser', _tour, 'reason', 'disconnect'),
              true)
        WHERE id = _m.id;
      PERFORM public._settle_match_impl(_m.id);
    END IF;
    _finies := _finies + 1;
  END LOOP;

  PERFORM set_config('azteque.balayage', 'off', true);
  RETURN _finies;
END;
$function$;

REVOKE ALL ON FUNCTION public.terminer_parties_abandonnees() FROM PUBLIC;
