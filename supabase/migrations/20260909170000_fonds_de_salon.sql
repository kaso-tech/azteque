/* ------------------------------------------------------------------ */
/* Fonds de salon : une nature d'article de plus                        */
/* ------------------------------------------------------------------ */

-- Un fond de salon est l'image posée sur le halo central de l'accueil,
-- derrière le titre et les boutons. Il s'achète comme un avatar et se porte comme
-- lui — à ceci près que son dessin n'est pas emprunté au code : il tient dans
-- `data.css`, une valeur CSS `background-image` que la console écrit et
-- modifie librement. C'est ce qui permet d'en ajouter de nouveaux sans
-- redéploiement.

ALTER TABLE public.shop_items DROP CONSTRAINT IF EXISTS shop_items_kind_check;
ALTER TABLE public.shop_items
  ADD CONSTRAINT shop_items_kind_check
  CHECK (kind IN ('avatar', 'sticker', 'messages', 'background'));

-- Le fond porté par le joueur. NULL — la valeur par défaut — laisse le halo
-- du feutre, tel qu'il était avant la boutique.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS background_kind text;

-- On ne pose que le fond qu'on possède, comme on ne porte que l'avatar qu'on
-- a acheté : le droit ne se lit pas dans la valeur, il faut aller voir les
-- achats. Retirer son fond (NULL) reste libre.
CREATE OR REPLACE FUNCTION public.check_background_owned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.background_kind IS NULL THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.purchases p
    JOIN public.shop_items i ON i.id = p.item_id
    WHERE p.user_id = NEW.id AND p.item_id = NEW.background_kind AND i.kind = 'background'
  ) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Fond non possédé : %', NEW.background_kind;
END;
$$;

DROP TRIGGER IF EXISTS profiles_background_owned ON public.profiles;
CREATE TRIGGER profiles_background_owned BEFORE INSERT OR UPDATE OF background_kind
ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.check_background_owned();

/* ------------------------------------------------------------------ */
/* La console accepte la nouvelle nature                                */
/* ------------------------------------------------------------------ */

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
  IF _kind NOT IN ('avatar', 'sticker', 'messages', 'background') THEN
    RAISE EXCEPTION 'Nature inconnue';
  END IF;
  IF _price < 0 OR _price > 1000000 THEN
    RAISE EXCEPTION 'Prix hors limites';
  END IF;
  IF COALESCE(_name, '') = '' THEN
    RAISE EXCEPTION 'Le nom ne peut pas être vide';
  END IF;
  -- Un fond sans image ne serait qu'un article qui ne change rien une fois
  -- acheté. Le navigateur écarte de lui-même une valeur qu'il ne sait pas
  -- lire, mais un champ vide passerait, lui, sans bruit.
  IF _kind = 'background' AND COALESCE(_data ->> 'css', '') = '' THEN
    RAISE EXCEPTION 'Un fond de salon doit porter une image';
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

/* ------------------------------------------------------------------ */
/* Les quatre fonds d'origine                                           */
/* ------------------------------------------------------------------ */

-- Rejouable : ne réécrit pas un fond que la console aurait déjà retouché.
INSERT INTO public.shop_items (id, kind, price, active, name, hint, data, sort) VALUES
  ('bg_aurore', 'background', 600, true, 'Aurore',
   'Le soleil se lève derrière le menu',
   jsonb_build_object('css',
     'radial-gradient(ellipse 58% 28% at 50% 12%, oklch(0.93 0.15 90 / 0.32), transparent 72%), '
     'radial-gradient(ellipse 100% 42% at 50% 0%, oklch(0.76 0.17 55 / 0.24), transparent 76%), '
     'radial-gradient(ellipse 130% 60% at 50% 108%, oklch(0.22 0.07 145 / 0.5), transparent 72%)'),
   150),
  ('bg_crepuscule', 'background', 900, true, 'Crépuscule',
   'Pourpre du soir et braise d''horizon',
   jsonb_build_object('css',
     'radial-gradient(ellipse 56% 27% at 50% 13%, oklch(0.72 0.19 350 / 0.32), transparent 70%), '
     'radial-gradient(ellipse 105% 45% at 50% 0%, oklch(0.5 0.2 300 / 0.3), transparent 76%), '
     'radial-gradient(ellipse 120% 40% at 50% 52%, oklch(0.72 0.16 42 / 0.16), transparent 74%), '
     'radial-gradient(ellipse 130% 60% at 50% 108%, oklch(0.2 0.07 300 / 0.5), transparent 72%)'),
   160),
  ('bg_nuit', 'background', 1400, true, 'Nuit étoilée',
   'La voûte bleue et ses étoiles',
   jsonb_build_object('css',
     'radial-gradient(2px 2px at 17% 14%, oklch(0.98 0.02 95 / 0.95), transparent 60%), '
     'radial-gradient(1.5px 1.5px at 31% 27%, oklch(0.96 0.03 95 / 0.8), transparent 60%), '
     'radial-gradient(2.5px 2.5px at 46% 11%, oklch(0.99 0.02 95 / 0.9), transparent 60%), '
     'radial-gradient(1.5px 1.5px at 63% 22%, oklch(0.96 0.03 95 / 0.75), transparent 60%), '
     'radial-gradient(2px 2px at 78% 9%, oklch(0.98 0.02 95 / 0.9), transparent 60%), '
     'radial-gradient(1.5px 1.5px at 87% 30%, oklch(0.95 0.03 95 / 0.7), transparent 60%), '
     'radial-gradient(1.5px 1.5px at 24% 39%, oklch(0.95 0.03 95 / 0.6), transparent 60%), '
     'radial-gradient(2px 2px at 70% 41%, oklch(0.97 0.02 95 / 0.7), transparent 60%), '
     'radial-gradient(ellipse 70% 34% at 50% 12%, oklch(0.5 0.14 265 / 0.4), transparent 72%), '
     'radial-gradient(ellipse 130% 52% at 50% 0%, oklch(0.24 0.09 275 / 0.55), transparent 76%), '
     'radial-gradient(ellipse 130% 60% at 50% 108%, oklch(0.16 0.06 275 / 0.55), transparent 72%)'),
   170),
  ('bg_or', 'background', 2200, true, 'Halo d''or',
   'Trois anneaux d''or, pour les grands soirs',
   jsonb_build_object('css',
     'radial-gradient(ellipse 46% 22% at 50% 14%, oklch(0.9 0.16 88 / 0.3), transparent 62%), '
     'radial-gradient(ellipse 68% 34% at 50% 14%, oklch(0.76 0.14 78 / 0.2), transparent 70%), '
     'radial-gradient(ellipse 96% 48% at 50% 14%, oklch(0.6 0.1 70 / 0.14), transparent 78%), '
     'radial-gradient(ellipse 130% 60% at 50% 108%, oklch(0.22 0.07 145 / 0.5), transparent 72%)'),
   180)
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
