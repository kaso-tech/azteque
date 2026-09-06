-- Le client ne doit plus jamais écrire directement l'état de partie
-- (`state`) ni les paramètres (`settings`, dont la mise en jetons) : toute
-- action de jeu passe désormais par la fonction serveur `applyMatchAction`
-- (src/lib/azteque/match-actions.ts), qui rejoue et valide chaque coup avec
-- la même logique que le moteur de jeu avant d'écrire quoi que ce soit.
--
-- Ce déclencheur fait respecter cette règle au niveau de la base, quelle que
-- soit la policy RLS en vigueur sur la table : seules les écritures faites
-- avec le rôle Postgres service_role (celui utilisé par la fonction serveur
-- via la clé de service) peuvent modifier ces deux colonnes. Les policies
-- existantes sur matches restent inchangées (elles couvrent les autres
-- colonnes, par exemple la lecture de la partie par ses participants).
--
-- On vérifie current_user (le rôle réel de la connexion), pas auth.role()
-- (qui lit une revendication JWT et peut ne rien renvoyer selon le type de
-- clé d'API utilisé) — et surtout PAS SECURITY DEFINER sur cette fonction,
-- qui changerait current_user pour celui du propriétaire de la fonction au
-- lieu de l'appelant réel.
CREATE OR REPLACE FUNCTION public.protect_match_mutable_columns()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.state IS DISTINCT FROM OLD.state OR NEW.settings IS DISTINCT FROM OLD.settings)
     AND current_user <> 'service_role' THEN
    RAISE EXCEPTION 'state and settings can only be written by the match-action server function';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER matches_protect_mutable_columns
BEFORE UPDATE ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.protect_match_mutable_columns();
