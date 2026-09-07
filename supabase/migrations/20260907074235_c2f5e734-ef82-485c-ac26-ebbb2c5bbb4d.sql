-- Console d'administration.
--
-- Tout ce qui suit repose sur un principe : l'interface ne fait qu'appeler, la
-- base décide. Cacher un bouton n'a jamais empêché personne d'appeler la
-- fonction qu'il déclenche — chaque opération d'administration vérifie donc
-- elle-même que l'appelant est administrateur, et le droit d'administrer ne
-- s'écrit pas depuis le client.

/* ------------------------------------------------------------------ */
/* Qui administre                                                      */
/* ------------------------------------------------------------------ */

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS banned boolean NOT NULL DEFAULT false;

-- `is_admin` et `banned` ne figurent pas dans le GRANT UPDATE du client : il ne
-- peut ni se sacrer administrateur, ni se débannir. Seules les fonctions
-- ci-dessous y touchent, et le premier administrateur se désigne à la main
-- depuis la console du projet (voir docs/mise-en-service-comptes.md).

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_admin FROM public.profiles WHERE id = auth.uid()), false);
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- Refuse l'opération si l'appelant n'administre pas. Toutes les fonctions
-- d'administration commencent par là.
CREATE OR REPLACE FUNCTION public.require_admin()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;
END;
$$;

/* ------------------------------------------------------------------ */
/* Journal                                                             */
/* ------------------------------------------------------------------ */

-- Toute action d'administration laisse une trace. Une console qui distribue
-- des jetons sans mémoire est une console qu'on ne peut pas auditer.
CREATE TABLE IF NOT EXISTS public.admin_log (
  id bigserial PRIMARY KEY,
  admin_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  action text NOT NULL,
  target text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_log FROM anon, authenticated;
GRANT SELECT ON public.admin_log TO authenticated;
GRANT ALL ON public.admin_log TO service_role;

DROP POLICY IF EXISTS "Journal réservé aux administrateurs" ON public.admin_log;
CREATE POLICY "Journal réservé aux administrateurs" ON public.admin_log
FOR SELECT TO authenticated USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.log_admin(_action text, _target text, _details jsonb)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.admin_log (admin_id, action, target, details)
  VALUES (auth.uid(), _action, _target, COALESCE(_details, '{}'::jsonb));
$$;

/* ------------------------------------------------------------------ */
/* Réglages partagés                                                   */
/* ------------------------------------------------------------------ */

-- Les réglages que l'administration peut changer sans redéploiement : le son,
-- pour l'instant. Lisibles de tous, écrits par les seuls administrateurs.
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_settings FROM anon, authenticated;
GRANT SELECT ON public.app_settings TO anon, authenticated;
GRANT ALL ON public.app_settings TO service_role;

DROP POLICY IF EXISTS "Réglages visibles de tous" ON public.app_settings;
CREATE POLICY "Réglages visibles de tous" ON public.app_settings
FOR SELECT TO anon, authenticated USING (true);

CREATE OR REPLACE FUNCTION public.admin_set_setting(_key text, _value jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin();
  INSERT INTO public.app_settings (key, value, updated_at)
  VALUES (_key, _value, now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  PERFORM public.log_admin('setting', _key, _value);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_setting(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_setting(text, jsonb) TO authenticated;

/* ------------------------------------------------------------------ */
/* Joueurs                                                             */
/* ------------------------------------------------------------------ */

-- La liste des joueurs, avec ce qu'il faut pour décider : solde, classement,
-- parties, achats, état. Passe par une fonction plutôt que par une lecture
-- directe, parce qu'elle agrège des tables que le client n'a pas le droit de
-- lire pour autrui.
CREATE OR REPLACE FUNCTION public.admin_list_players(_query text DEFAULT '', _limit int DEFAULT 50)
RETURNS TABLE (
  id uuid,
  username text,
  tokens integer,
  rating integer,
  rated_games integer,
  avatar_kind text,
  avatar_url text,
  is_admin boolean,
  banned boolean,
  purchases integer,
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
  SELECT p.id, p.username, p.tokens, p.rating, p.rated_games, p.avatar_kind, p.avatar_url,
         p.is_admin, p.banned,
         (SELECT count(*)::int FROM public.purchases pu WHERE pu.user_id = p.id),
         p.created_at
  FROM public.profiles p
  WHERE COALESCE(_query, '') = '' OR p.username ILIKE '%' || _query || '%'
  ORDER BY p.created_at DESC
  LIMIT least(greatest(COALESCE(_limit, 50), 1), 200);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_players(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_players(text, int) TO authenticated;

-- Crédite ou débite un joueur. Le solde ne descend jamais sous zéro, et la
-- raison est consignée : c'est ce qui distingue un geste d'un caprice.
CREATE OR REPLACE FUNCTION public.admin_grant_tokens(_user uuid, _amount integer, _reason text DEFAULT '')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new integer;
BEGIN
  PERFORM public.require_admin();
  IF _amount IS NULL OR _amount = 0 THEN
    RAISE EXCEPTION 'Montant nul';
  END IF;
  IF abs(_amount) > 1000000 THEN
    RAISE EXCEPTION 'Montant hors limites';
  END IF;

  UPDATE public.profiles
     SET tokens = greatest(0, tokens + _amount)
   WHERE id = _user
  RETURNING tokens INTO _new;

  IF _new IS NULL THEN
    RAISE EXCEPTION 'Joueur introuvable';
  END IF;

  PERFORM public.log_admin('tokens', _user::text,
    jsonb_build_object('amount', _amount, 'reason', COALESCE(_reason, ''), 'balance', _new));
  RETURN _new;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_grant_tokens(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_grant_tokens(uuid, integer, text) TO authenticated;

-- Suspend ou rétablit un joueur.
CREATE OR REPLACE FUNCTION public.admin_set_banned(_user uuid, _banned boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin();
  IF _user = auth.uid() THEN
    RAISE EXCEPTION 'On ne se suspend pas soi-même';
  END IF;
  UPDATE public.profiles SET banned = _banned WHERE id = _user;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Joueur introuvable';
  END IF;
  PERFORM public.log_admin('ban', _user::text, jsonb_build_object('banned', _banned));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_banned(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_banned(uuid, boolean) TO authenticated;

-- Nomme ou révoque un administrateur.
CREATE OR REPLACE FUNCTION public.admin_set_admin(_user uuid, _is_admin boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin();
  -- Se révoquer soi-même fermerait la porte de l'intérieur, et il pourrait ne
  -- rester personne pour la rouvrir.
  IF _user = auth.uid() AND NOT _is_admin THEN
    RAISE EXCEPTION 'On ne se révoque pas soi-même';
  END IF;
  UPDATE public.profiles SET is_admin = _is_admin WHERE id = _user;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Joueur introuvable';
  END IF;
  PERFORM public.log_admin('admin', _user::text, jsonb_build_object('is_admin', _is_admin));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_admin(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_admin(uuid, boolean) TO authenticated;

/* ------------------------------------------------------------------ */
/* Ce qu'un joueur suspendu ne peut plus faire                         */
/* ------------------------------------------------------------------ */

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
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS matches_refuse_banned ON public.matches;
CREATE TRIGGER matches_refuse_banned BEFORE INSERT ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.refuse_banned_host();

/* ------------------------------------------------------------------ */
/* Boutique administrable                                              */
/* ------------------------------------------------------------------ */

ALTER TABLE public.shop_items
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.admin_set_item(_item_id text, _price integer, _active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin();
  IF _price < 0 OR _price > 1000000 THEN
    RAISE EXCEPTION 'Prix hors limites';
  END IF;
  UPDATE public.shop_items SET price = _price, active = _active WHERE id = _item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Article inconnu';
  END IF;
  PERFORM public.log_admin('item', _item_id,
    jsonb_build_object('price', _price, 'active', _active));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_item(text, integer, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_item(text, integer, boolean) TO authenticated;

-- L'achat tient compte du retrait de la vente et de la suspension.
CREATE OR REPLACE FUNCTION public.buy_item(_item_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _price integer;
  _active boolean;
  _tokens integer;
  _banned boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT price, active INTO _price, _active FROM public.shop_items WHERE id = _item_id;
  IF _price IS NULL THEN
    RAISE EXCEPTION 'Article inconnu';
  END IF;
  IF NOT _active THEN
    RAISE EXCEPTION 'Article retiré de la vente';
  END IF;

  SELECT tokens, banned INTO _tokens, _banned FROM public.profiles WHERE id = auth.uid() FOR UPDATE;
  IF _tokens IS NULL THEN
    RAISE EXCEPTION 'Profil introuvable';
  END IF;
  IF _banned THEN
    RAISE EXCEPTION 'Compte suspendu';
  END IF;

  IF EXISTS (SELECT 1 FROM public.purchases WHERE user_id = auth.uid() AND item_id = _item_id) THEN
    RETURN jsonb_build_object('bought', false, 'reason', 'owned', 'tokens', _tokens);
  END IF;

  IF _tokens < _price THEN
    RETURN jsonb_build_object('bought', false, 'reason', 'tokens', 'tokens', _tokens);
  END IF;

  UPDATE public.profiles SET tokens = tokens - _price WHERE id = auth.uid()
  RETURNING tokens INTO _tokens;
  INSERT INTO public.purchases (user_id, item_id) VALUES (auth.uid(), _item_id);

  RETURN jsonb_build_object('bought', true, 'reason', 'ok', 'tokens', _tokens);
END;
$$;

REVOKE ALL ON FUNCTION public.buy_item(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.buy_item(text) TO authenticated;

-- Un compte suspendu ne gagne plus rien non plus.
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
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND banned) THEN
    RAISE EXCEPTION 'Compte suspendu';
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
/* Chiffres de tête                                                    */
/* ------------------------------------------------------------------ */

CREATE OR REPLACE FUNCTION public.admin_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _r jsonb;
BEGIN
  PERFORM public.require_admin();
  SELECT jsonb_build_object(
    'players', (SELECT count(*) FROM public.profiles),
    'banned', (SELECT count(*) FROM public.profiles WHERE banned),
    'admins', (SELECT count(*) FROM public.profiles WHERE is_admin),
    'tokens', (SELECT COALESCE(sum(tokens), 0) FROM public.profiles),
    'purchases', (SELECT count(*) FROM public.purchases),
    'matches', (SELECT count(*) FROM public.matches),
    'finished', (SELECT count(*) FROM public.matches WHERE winner_id IS NOT NULL),
    'active_7d', (SELECT count(*) FROM public.profiles WHERE updated_at > now() - interval '7 days')
  ) INTO _r;
  RETURN _r;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_stats() TO authenticated;

NOTIFY pgrst, 'reload schema';