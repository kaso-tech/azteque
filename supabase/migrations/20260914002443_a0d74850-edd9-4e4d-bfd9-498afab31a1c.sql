DROP FUNCTION IF EXISTS public.admin_upsert_item(text, text, integer, boolean, text, text, jsonb, integer);
CREATE FUNCTION public.admin_upsert_item(_id text, _kind text, _price integer, _active boolean, _name text, _hint text, _data jsonb, _sort integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
BEGIN
  PERFORM public.require_admin();
  IF _id !~ '^[a-z][a-z0-9_]{2,39}$' THEN
    RAISE EXCEPTION 'Identifiant : 3 à 40 caractères, minuscules, chiffres ou souligné';
  END IF;
  IF _kind NOT IN ('avatar', 'sticker', 'messages', 'background', 'sound') THEN
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
$func$;
GRANT EXECUTE ON FUNCTION public.admin_upsert_item(text, text, integer, boolean, text, text, jsonb, integer) TO authenticated;