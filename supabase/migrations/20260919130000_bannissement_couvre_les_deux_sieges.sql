-- Un joueur suspendu pouvait rejoindre une table comme INVITÉ.
--
-- Le déclencheur `matches_refuse_banned` ne protégeait que `host_id`, et ne se
-- déclenchait qu'à la création (`BEFORE INSERT`). Deux chemins laissaient donc
-- passer un compte banni :
--
-- 1. `join_match_by_code` : rejoindre une table par son code écrit
--    `guest_id = auth.uid()` par une UPDATE, jamais vérifiée pour le
--    bannissement — ni par le déclencheur (qui n'écoute que les insertions),
--    ni par sa condition (qui ne regarde que `host_id`). Ce trou existe depuis
--    l'introduction du bannissement.
--
-- 2. `mm_join` (file d'attente) : quand deux joueurs s'apparient, celui qui
--    vient d'appeler la fonction devient l'INVITÉ de la table créée pour
--    celui qui attendait. L'insertion déclenche bien le contrôle, mais
--    celui-ci ne regarde toujours que `host_id` — jamais le sien.
--
-- Un compte banni pouvait donc continuer à jouer, tant qu'il entrait par la
-- porte de l'invité plutôt que par celle de l'hôte. La correction porte sur
-- la RAISON du trou, pas sur ses deux symptômes : le contrôle regarde
-- désormais les DEUX sièges, et le déclencheur écoute aussi les mises à jour.

CREATE OR REPLACE FUNCTION public.refuse_banned_host()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.host_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.host_id AND banned) THEN
    RAISE EXCEPTION 'Compte suspendu';
  END IF;
  IF NEW.guest_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.guest_id AND banned) THEN
    RAISE EXCEPTION 'Compte suspendu';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS matches_refuse_banned ON public.matches;
CREATE TRIGGER matches_refuse_banned
BEFORE INSERT OR UPDATE OF host_id, guest_id ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.refuse_banned_host();
