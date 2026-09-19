-- Retire `my_open_match()` et `match_inactivity_limit()`, posées par
-- `20260919150000_partie_abandonnee_se_termine_seule.sql` puis remplacées par
-- le balayage de `20260919170000_balayage_abandons_debloque.sql`.
--
-- Cette première tentative de fermer une partie abandonnée était cassée dès
-- l'origine : son UPDATE sur `state` s'exécute en SECURITY DEFINER, donc sous
-- le rôle `postgres` — pas `service_role` — et se heurtait donc à chaque
-- appel au déclencheur `protect_match_mutable_columns` (« state and settings
-- can only be written by the match-action server function »). L'échec était
-- silencieux côté client (voir le `.catch` de `myOpenMatch` dans
-- online.tsx), ce qui a masqué le problème le temps de le diagnostiquer.
--
-- `terminer_parties_abandonnees()` fait le même travail correctement (via un
-- drapeau de transaction que le déclencheur accepte) et tourne en plus à
-- chaque battement de présence et sondage de file d'attente, plutôt qu'à la
-- seule initiative du joueur qui rouvre sa propre partie coincée. Ces deux
-- fonctions n'ont donc plus aucun appelant et ne servent qu'à confondre.

DROP FUNCTION IF EXISTS public.my_open_match();
DROP FUNCTION IF EXISTS public.match_inactivity_limit();
