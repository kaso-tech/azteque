DROP FUNCTION IF EXISTS public.admin_shop_sales_summary();

CREATE OR REPLACE FUNCTION public.admin_shop_sales_summary()
RETURNS TABLE (
  item_id text,
  ventes_7j bigint,
  ca_7j bigint,
  dernier_achat timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin();
  RETURN QUERY
  SELECT
    si.id,
    COALESCE((
      SELECT count(*) FROM public.purchases pu
      WHERE pu.item_id = si.id
        AND pu.bought_at > now() - interval '7 days'
    ), 0)::bigint AS ventes_7j,
    COALESCE((
      SELECT count(*) FROM public.purchases pu
      WHERE pu.item_id = si.id
        AND pu.bought_at > now() - interval '7 days'
    ), 0) * si.price AS ca_7j,
    (
      SELECT max(pu.bought_at) FROM public.purchases pu
      WHERE pu.item_id = si.id
    ) AS dernier_achat
  FROM public.shop_items si
  ORDER BY si.sort ASC, si.id ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_shop_sales_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_shop_sales_summary() TO authenticated;

DROP FUNCTION IF EXISTS public.admin_list_log(text, uuid, timestamptz, timestamptz, int, int);

CREATE OR REPLACE FUNCTION public.admin_list_log(
  _action text DEFAULT NULL,
  _admin_id uuid DEFAULT NULL,
  _since timestamptz DEFAULT NULL,
  _until timestamptz DEFAULT NULL,
  _limit int DEFAULT 50,
  _offset int DEFAULT 0
)
RETURNS TABLE (
  id bigint,
  admin_id uuid,
  admin_username text,
  action text,
  target text,
  details jsonb,
  at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin();
  _limit := least(greatest(COALESCE(_limit, 50), 1), 200);
  _offset := greatest(COALESCE(_offset, 0), 0);
  RETURN QUERY
  SELECT
    l.id,
    l.admin_id,
    p.username AS admin_username,
    l.action,
    l.target,
    l.details,
    l.at
  FROM public.admin_log l
  LEFT JOIN public.profiles p ON p.id = l.admin_id
  WHERE (_action IS NULL OR l.action = _action)
    AND (_admin_id IS NULL OR l.admin_id = _admin_id)
    AND (_since IS NULL OR l.at >= _since)
    AND (_until IS NULL OR l.at < _until)
  ORDER BY l.at DESC
  LIMIT _limit OFFSET _offset;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_log(text, uuid, timestamptz, timestamptz, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_log(text, uuid, timestamptz, timestamptz, int, int) TO authenticated;

DROP FUNCTION IF EXISTS public.admin_revert_log_entry(bigint);

CREATE OR REPLACE FUNCTION public.admin_revert_log_entry(_id bigint)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _l public.admin_log;
  _reverted text;
BEGIN
  PERFORM public.require_admin();

  SELECT * INTO _l FROM public.admin_log WHERE id = _id;
  IF _l.id IS NULL THEN
    RAISE EXCEPTION 'Événement introuvable';
  END IF;

  IF _l.action LIKE 'revert:%' THEN
    RAISE EXCEPTION 'Une annulation ne s''annule pas';
  END IF;

  IF _l.action = 'tokens' THEN
    DECLARE
      _amount int := (_l.details ->> 'amount')::int;
      _target uuid := _l.target::uuid;
    BEGIN
      IF _target IS NULL OR _amount IS NULL THEN
        RAISE EXCEPTION 'Entrée « tokens » mal formée';
      END IF;
      UPDATE public.profiles
        SET tokens = greatest(0, tokens - _amount)
        WHERE id = _target;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Joueur introuvable';
      END IF;
      _reverted := 'tokens';
    END;

  ELSIF _l.action = 'ban' THEN
    DECLARE
      _target uuid := _l.target::uuid;
    BEGIN
      IF _target IS NULL THEN
        RAISE EXCEPTION 'Entrée « ban » mal formée';
      END IF;
      UPDATE public.profiles SET banned = false WHERE id = _target;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Joueur introuvable';
      END IF;
      _reverted := 'ban';
    END;

  ELSIF _l.action = 'admin' THEN
    DECLARE
      _target uuid := _l.target::uuid;
    BEGIN
      IF _target IS NULL THEN
        RAISE EXCEPTION 'Entrée « admin » mal formée';
      END IF;
      IF (
        SELECT count(*) FROM public.profiles WHERE is_admin = true
      ) <= 1 AND _l.details ->> 'is_admin' = 'true' THEN
        RAISE EXCEPTION 'Dernier administrateur : annulation refusée';
      END IF;
      UPDATE public.profiles SET is_admin = false WHERE id = _target;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Joueur introuvable';
      END IF;
      _reverted := 'admin';
    END;

  ELSIF _l.action IN ('item', 'item_delete', 'setting', 'sound_file', 'sound_file_clear', 'sound_settings') THEN
    RAISE EXCEPTION 'Action « % » non réversible', _l.action;

  ELSE
    RAISE EXCEPTION 'Action inconnue : %', _l.action;
  END IF;

  PERFORM public.log_admin(
    'revert:' || _reverted,
    _l.target,
    jsonb_build_object('reverted_log_id', _l.id, 'original_action', _l.action)
  );

  RETURN _reverted;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_revert_log_entry(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_revert_log_entry(bigint) TO authenticated;

NOTIFY pgrst, 'reload schema';