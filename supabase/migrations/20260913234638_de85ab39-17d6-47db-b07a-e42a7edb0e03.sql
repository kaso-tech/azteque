-- 1. Politiques RLS sur storage.objects pour le bucket shop-assets
-- Lecture publique des assets
CREATE POLICY "Assets boutique lisibles par tous" ON storage.objects
FOR SELECT USING (bucket_id = 'shop-assets');

-- Écriture réservée au service_role (la console admin l'utilise)
CREATE POLICY "Seul service_role écrit dans shop-assets" ON storage.objects
FOR INSERT TO service_role WITH CHECK (bucket_id = 'shop-assets');

CREATE POLICY "Seul service_role met à jour shop-assets" ON storage.objects
FOR UPDATE TO service_role USING (bucket_id = 'shop-assets');

CREATE POLICY "Seul service_role supprime dans shop-assets" ON storage.objects
FOR DELETE TO service_role USING (bucket_id = 'shop-assets');

-- 2. Colonne asset_url sur shop_items
ALTER TABLE public.shop_items
  ADD COLUMN IF NOT EXISTS asset_url text;

-- 3. RPC dédiée (plutôt que modifier admin_upsert_item)
CREATE OR REPLACE FUNCTION public.admin_set_item_asset(
  _id text,
  _asset_url text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Vérif d'admin côté base : on ne fait pas confiance au client.
  PERFORM public.require_admin();

  UPDATE public.shop_items
    SET asset_url = _asset_url
    WHERE id = _id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Article % introuvable.', _id;
  END IF;

  -- Colonnes réelles du journal de ce projet : action, target, details.
  PERFORM public.log_admin('set_item_asset', _id,
    jsonb_build_object('asset_url', _asset_url));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_item_asset(text, text) TO authenticated;