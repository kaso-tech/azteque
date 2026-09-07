-- Console complète : fiches joueurs détaillées et catalogue administrable.
--
-- Deux mouvements. Le profil s'étoffe de ce qu'une console doit montrer — état
-- civil, pays, activité — et le catalogue de la boutique cesse d'être écrit
-- dans le code pour vivre en base, où il devient modifiable et extensible.

/* ------------------------------------------------------------------ */
/* Fiche du joueur                                                     */
/* ------------------------------------------------------------------ */

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS country text,
  -- Tours joués, et non champs gagnés : un champ se joue en plusieurs tours,
  -- et c'est le nombre de tours qui dit combien un joueur a réellement joué.
  ADD COLUMN IF NOT EXISTS rounds_played integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

DO $$
BEGIN
  ALTER TABLE public.profiles ADD CONSTRAINT profiles_country_iso
    CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Le joueur renseigne son identité et son pays ; il ne touche toujours ni aux
-- jetons, ni à la cote, ni au décompte des tours, ni à son droit d'administrer.
GRANT UPDATE (username, avatar_kind, avatar_url, first_name, last_name, country, updated_at)
  ON public.profiles TO authenticated;

/**
 * Présence : plutôt qu'un canal temps réel, une trace horodatée.
 *
 * Une présence en direct suppose une connexion ouverte, qu'une console
 * consultée de loin n'a pas. « Vu il y a moins de cinq minutes » se lit sur une
 * colonne, survit à un rechargement et ne coûte qu'une écriture par ouverture.
 */
CREATE OR REPLACE FUNCTION public.touch_last_seen()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.profiles SET last_seen_at = now() WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.touch_last_seen() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_last_seen() TO authenticated;

/* ------------------------------------------------------------------ */
/* Catalogue en base                                                   */
/* ------------------------------------------------------------------ */

ALTER TABLE public.shop_items
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS hint text,
  -- Ce qui distingue un article d'un autre : les phrases d'un lot de messages,
  -- ou le dessin qu'un avatar et un sticker empruntent au jeu.
  ADD COLUMN IF NOT EXISTS data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS sort integer NOT NULL DEFAULT 0;

-- Reprise des libellés et des phrases écrits jusqu'ici dans le code. Rejouable :
-- ne touche que les lignes dont le nom est encore vide.
UPDATE public.shop_items SET name = v.name, hint = v.hint, data = v.data, sort = v.sort
FROM (VALUES
  ('av_marchand', 'Le Marchand', 'Chapeau du grand marché', '{"art":"av_marchand"}'::jsonb, 10),
  ('av_reine', 'La Reine du marché', 'Foulard haut et collier d''or', '{"art":"av_reine"}'::jsonb, 20),
  ('av_griot', 'Le Griot', 'Celui qui connaît toutes les parties', '{"art":"av_griot"}'::jsonb, 30),
  ('av_elegante', 'L''Élégante', 'Tresses longues et grands anneaux', '{"art":"av_elegante"}'::jsonb, 40),
  ('av_roi', 'Le Roi Aztèque', 'La couronne, rien de moins', '{"art":"av_roi"}'::jsonb, 50),
  ('st_bravo', 'Bravo', 'Applaudir un beau coup', '{"art":"st_bravo"}'::jsonb, 60),
  ('st_rire', 'Éclat de rire', 'Rire du malheur d''autrui', '{"art":"st_rire"}'::jsonb, 70),
  ('st_pitie', 'Grâce', 'Rendre les armes', '{"art":"st_pitie"}'::jsonb, 80),
  ('st_atout', 'Atout', 'Annoncer la couleur', '{"art":"st_atout"}'::jsonb, 90),
  ('st_feu', 'En feu', 'Trois tours d''affilée', '{"art":"st_feu"}'::jsonb, 100),
  ('st_couronne', 'Couronne', 'Le champ est à vous', '{"art":"st_couronne"}'::jsonb, 110),
  ('ms_salutations', 'Salutations', 'Ouvrir et fermer une partie comme il faut',
   '{"phrases":["Bonjour, bonne partie à vous !","Que le meilleur gagne.","Merci pour la partie.","À bientôt sur une autre table.","Beau jeu, vraiment."]}'::jsonb, 120),
  ('ms_moqueries', 'Moqueries', 'Piquer sans méchanceté',
   '{"phrases":["Tu comptais tes cartes ou tes doigts ?","L''atout t''a vu venir de loin.","Encore une comme ça et je m''endors.","Ta pioche te veut du bien, pas moi.","Range ce dix, il te fait honte."]}'::jsonb, 130),
  ('ms_defis', 'Défis', 'Mettre la pression avant le coup',
   '{"phrases":["Double la mise, si tu l''oses.","Ce tour est déjà joué dans ma tête.","Je te laisse la devanture, profites-en.","Compte tes bonnes tant qu''il t''en reste.","Le champ se décide maintenant."]}'::jsonb, 140)
) AS v(id, name, hint, data, sort)
WHERE public.shop_items.id = v.id AND public.shop_items.name IS NULL;

-- Le catalogue est lu par tout le monde, y compris sans compte : la boutique
-- doit pouvoir s'afficher avant que le joueur ne se connecte.
GRANT SELECT ON public.shop_items TO anon;
DROP POLICY IF EXISTS "Catalogue visible de tous" ON public.shop_items;
CREATE POLICY "Catalogue visible de tous" ON public.shop_items
FOR SELECT TO anon, authenticated USING (true);

-- Crée ou modifie un article. Un identifiant nouveau crée, un identifiant connu
-- modifie : la console n'a pas à distinguer les deux gestes.
CREATE OR REPLACE FUNCTION public.admin_upsert_item(
  _id text, _kind text, _price integer, _active boolean,
  _name text, _hint text, _data jsonb, _sort integer DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin();
  IF _id !~ '^[a-z][a-z0-9_]{2,39}$' THEN
    RAISE EXCEPTION 'Identifiant : 3 à 40 caractères, minuscules, chiffres ou souligné';
  END IF;
  IF _kind NOT IN ('avatar', 'sticker', 'messages') THEN
    RAISE EXCEPTION 'Nature inconnue';
  END IF;
  IF _price < 0 OR _price > 1000000 THEN
    RAISE EXCEPTION 'Prix hors limites';
  END IF;
  IF COALESCE(_name, '') = '' THEN
    RAISE EXCEPTION 'Le nom ne peut pas être vide';
  END IF;

  INSERT INTO public.shop_items (id, kind, price, active, name, hint, data, sort)
  VALUES (_id, _kind, _price, _active, _name, COALESCE(_hint, ''), COALESCE(_data, '{}'::jsonb),
          COALESCE(_sort, 0))
  ON CONFLICT (id) DO UPDATE SET
    kind = EXCLUDED.kind, price = EXCLUDED.price, active = EXCLUDED.active,
    name = EXCLUDED.name, hint = EXCLUDED.hint, data = EXCLUDED.data, sort = EXCLUDED.sort;

  PERFORM public.log_admin('item', _id,
    jsonb_build_object('kind', _kind, 'price', _price, 'active', _active, 'name', _name));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_upsert_item(text, text, integer, boolean, text, text, jsonb, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_upsert_item(text, text, integer, boolean, text, text, jsonb, integer) TO authenticated;

-- Supprime un article. Refusé s'il a déjà été acheté : on ne retire pas à un
-- joueur ce qu'il a payé. Le retrait de la vente est là pour cela.
CREATE OR REPLACE FUNCTION public.admin_delete_item(_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin();
  IF EXISTS (SELECT 1 FROM public.purchases WHERE item_id = _id) THEN
    RAISE EXCEPTION 'Déjà acheté : retirez-le de la vente plutôt que de le supprimer';
  END IF;
  DELETE FROM public.shop_items WHERE id = _id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Article inconnu';
  END IF;
  PERFORM public.log_admin('item_delete', _id, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_item(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_item(text) TO authenticated;

/* ------------------------------------------------------------------ */
/* Compte des tours joués                                              */
/* ------------------------------------------------------------------ */

-- Le règlement d'un champ sait combien de tours il a duré : autant le compter
-- au passage, plutôt que d'ajouter une écriture à chaque fin de tour.
CREATE OR REPLACE FUNCTION public.settle_match(_match_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _m public.matches;
  _champ int;
  _winner uuid;
  _loser uuid;
  _bet integer;
  _moved integer;
  _rounds integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO _m FROM public.matches WHERE id = _match_id FOR UPDATE;
  IF _m.id IS NULL THEN
    RAISE EXCEPTION 'Partie introuvable';
  END IF;
  IF auth.uid() NOT IN (_m.host_id, _m.guest_id) THEN
    RAISE EXCEPTION 'Vous ne participez pas à cette partie';
  END IF;
  IF _m.settled_at IS NOT NULL THEN
    RETURN;
  END IF;
  IF _m.state IS NULL OR _m.state ->> 'phase' <> 'gameEnd' THEN
    RETURN;
  END IF;

  _champ := (_m.state ->> 'champWinner')::int;
  IF _champ IS NULL THEN
    RETURN;
  END IF;
  _winner := CASE WHEN _champ = 0 THEN _m.host_id ELSE _m.guest_id END;
  _loser := CASE WHEN _champ = 0 THEN _m.guest_id ELSE _m.host_id END;

  UPDATE public.matches
  SET winner_id = _winner, finished_at = now(), settled_at = now(), status = 'finished'
  WHERE id = _match_id;

  IF _winner IS NULL OR _loser IS NULL THEN
    RETURN;
  END IF;

  _rounds := COALESCE((_m.state -> 'roundsWon' ->> 0)::int, 0)
           + COALESCE((_m.state -> 'roundsWon' ->> 1)::int, 0);
  UPDATE public.profiles SET rounds_played = rounds_played + greatest(_rounds, 1)
   WHERE id IN (_winner, _loser);

  PERFORM public.apply_match_rating(_match_id, _winner, _loser);

  IF (_m.settings -> 'bet' ->> 'status') IS DISTINCT FROM 'accepted' THEN
    RETURN;
  END IF;
  _bet := COALESCE((_m.settings -> 'bet' ->> 'amount')::int, 0);
  IF _bet <= 0 THEN
    RETURN;
  END IF;

  SELECT least(_bet, tokens) INTO _moved FROM public.profiles WHERE id = _loser;
  _moved := COALESCE(_moved, 0);
  IF _moved <= 0 THEN
    RETURN;
  END IF;

  UPDATE public.profiles SET tokens = tokens - _moved WHERE id = _loser;
  UPDATE public.profiles SET tokens = tokens + _moved WHERE id = _winner;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_match(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_match(uuid) TO authenticated;

/* ------------------------------------------------------------------ */
/* La liste des joueurs, étoffée                                       */
/* ------------------------------------------------------------------ */

DROP FUNCTION IF EXISTS public.admin_list_players(text, int);

CREATE OR REPLACE FUNCTION public.admin_list_players(_query text DEFAULT '', _limit int DEFAULT 50)
RETURNS TABLE (
  id uuid,
  username text,
  first_name text,
  last_name text,
  country text,
  tokens integer,
  rating integer,
  rated_games integer,
  rounds_played integer,
  avatar_kind text,
  avatar_url text,
  is_admin boolean,
  banned boolean,
  purchases integer,
  last_seen_at timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin();
  RETURN QUERY
  SELECT p.id, p.username, p.first_name, p.last_name, p.country,
         p.tokens, p.rating, p.rated_games, p.rounds_played,
         p.avatar_kind, p.avatar_url, p.is_admin, p.banned,
         (SELECT count(*)::int FROM public.purchases pu WHERE pu.user_id = p.id),
         p.last_seen_at, p.created_at
  FROM public.profiles p
  WHERE COALESCE(_query, '') = ''
     OR p.username ILIKE '%' || _query || '%'
     OR COALESCE(p.first_name, '') ILIKE '%' || _query || '%'
     OR COALESCE(p.last_name, '') ILIKE '%' || _query || '%'
  ORDER BY p.last_seen_at DESC NULLS LAST, p.created_at DESC
  LIMIT least(greatest(COALESCE(_limit, 50), 1), 200);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_players(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_players(text, int) TO authenticated;

NOTIFY pgrst, 'reload schema';