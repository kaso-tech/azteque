-- La boutique : avatars, stickers et lots de messages.
--
-- Le catalogue vit ici parce que c'est ici qu'on débite. Un prix annoncé par le
-- client ne vaudrait rien : il suffirait de le mettre à zéro. Le client garde
-- le dessin et le libellé de chaque article (`src/lib/azteque/shop.ts`), la
-- base garde l'identifiant et le prix, et un test vérifie que les deux listes
-- concordent.

/* ------------------------------------------------------------------ */
/* Catalogue                                                           */
/* ------------------------------------------------------------------ */

CREATE TABLE IF NOT EXISTS public.shop_items (
  id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('avatar', 'sticker', 'messages')),
  price integer NOT NULL CHECK (price >= 0)
);

ALTER TABLE public.shop_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shop_items FROM anon, authenticated;
GRANT SELECT ON public.shop_items TO authenticated;
GRANT ALL ON public.shop_items TO service_role;

DROP POLICY IF EXISTS "Catalogue visible des joueurs connectés" ON public.shop_items;
CREATE POLICY "Catalogue visible des joueurs connectés" ON public.shop_items
FOR SELECT TO authenticated USING (true);

-- Rejouable : relancer la migration remet les prix au barème sans toucher aux
-- achats déjà faits.
INSERT INTO public.shop_items (id, kind, price) VALUES
  ('av_marchand',    'avatar',    500),
  ('av_reine',       'avatar',    750),
  ('av_griot',       'avatar',   1000),
  ('av_elegante',    'avatar',   1500),
  ('av_roi',         'avatar',   2500),
  ('st_bravo',       'sticker',   200),
  ('st_rire',        'sticker',   300),
  ('st_pitie',       'sticker',   300),
  ('st_atout',       'sticker',   500),
  ('st_feu',         'sticker',   700),
  ('st_couronne',    'sticker',   900),
  ('ms_salutations', 'messages',  400),
  ('ms_moqueries',   'messages',  600),
  ('ms_defis',       'messages',  800)
ON CONFLICT (id) DO UPDATE SET kind = EXCLUDED.kind, price = EXCLUDED.price;

/* ------------------------------------------------------------------ */
/* Achats                                                              */
/* ------------------------------------------------------------------ */

CREATE TABLE IF NOT EXISTS public.purchases (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  item_id text NOT NULL REFERENCES public.shop_items (id) ON DELETE CASCADE,
  bought_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id)
);

ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
-- Le client lit ses achats mais n'en écrit aucun : seul `buy_item` en crée, et
-- il débite en même temps. Sans cette restriction, s'offrir le catalogue
-- entier tiendrait en une requête.
REVOKE ALL ON public.purchases FROM anon, authenticated;
GRANT SELECT ON public.purchases TO authenticated;
GRANT ALL ON public.purchases TO service_role;

DROP POLICY IF EXISTS "Chacun voit ses achats" ON public.purchases;
CREATE POLICY "Chacun voit ses achats" ON public.purchases
FOR SELECT TO authenticated USING (user_id = auth.uid());

/* ------------------------------------------------------------------ */
/* Acheter                                                             */
/* ------------------------------------------------------------------ */

-- Achète un article et débite les jetons, ou explique pourquoi il n'en est
-- rien. Le profil est verrouillé le temps de l'opération : deux achats lancés
-- en même temps ne peuvent pas dépenser deux fois le même solde.
CREATE OR REPLACE FUNCTION public.buy_item(_item_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _price integer;
  _tokens integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT price INTO _price FROM public.shop_items WHERE id = _item_id;
  IF _price IS NULL THEN
    RAISE EXCEPTION 'Article inconnu';
  END IF;

  SELECT tokens INTO _tokens FROM public.profiles WHERE id = auth.uid() FOR UPDATE;
  IF _tokens IS NULL THEN
    RAISE EXCEPTION 'Profil introuvable';
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

/* ------------------------------------------------------------------ */
/* On ne porte que ce qu'on possède                                    */
/* ------------------------------------------------------------------ */

-- L'ancienne contrainte n'admettait que les deux avatars libres. Un avatar
-- acheté est un identifiant du catalogue, et le droit de le porter ne se lit
-- pas dans la valeur elle-même : il faut aller voir les achats. C'est donc un
-- déclencheur, et non plus une contrainte de colonne.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_avatar_kind_valid;

CREATE OR REPLACE FUNCTION public.check_avatar_owned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.avatar_kind IN ('google', 'homme', 'femme') THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.purchases p
    JOIN public.shop_items i ON i.id = p.item_id
    WHERE p.user_id = NEW.id AND p.item_id = NEW.avatar_kind AND i.kind = 'avatar'
  ) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Avatar non possédé : %', NEW.avatar_kind;
END;
$$;

DROP TRIGGER IF EXISTS profiles_avatar_owned ON public.profiles;
CREATE TRIGGER profiles_avatar_owned BEFORE INSERT OR UPDATE OF avatar_kind ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.check_avatar_owned();

NOTIFY pgrst, 'reload schema';