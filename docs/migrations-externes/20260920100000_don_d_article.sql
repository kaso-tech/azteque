-- Offrir un article à un joueur, depuis la console.
--
-- (Migration à appliquer sur le projet Supabase externe jwhrkxqwhvfpdxuufbwz.
-- Le dossier supabase/migrations/ du dépôt est réservé au backend interne de
-- la plateforme ; ce fichier fait foi pour rejouer le schéma ailleurs.)
--
-- La fiche joueur proposait « 🎁 Offrir un article » sans que rien n'existe
-- derrière — le bouton n'avait même pas de gestionnaire de clic. Un administrateur
-- pouvait déjà créditer des jetons (`admin_grant_tokens`) mais pas donner
-- directement un avatar, un sticker ou un tapis : il fallait verser de quoi
-- l'acheter et espérer que le joueur comprenne.
--
-- Un don est une ligne d'`purchases` comme une autre : le reste du jeu lit
-- cette table pour savoir ce qu'un joueur possède (voir `listPurchases`), et
-- ne fait aucune différence entre acheté et offert. Rien d'autre à prévoir.
--
-- Le don est IDEMPOTENT : offrir deux fois le même article ne change rien et
-- ne lève pas d'erreur. La clé primaire (user_id, item_id) l'interdit de
-- toute façon, et un administrateur qui clique deux fois ne mérite pas un
-- message d'échec.

CREATE OR REPLACE FUNCTION public.admin_grant_item(
  _user uuid,
  _item_id text,
  _reason text DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _deja boolean;
BEGIN
  PERFORM public.require_admin();

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user) THEN
    RAISE EXCEPTION 'Joueur introuvable';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.shop_items WHERE id = _item_id) THEN
    RAISE EXCEPTION 'Article introuvable';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.purchases WHERE user_id = _user AND item_id = _item_id
  ) INTO _deja;

  INSERT INTO public.purchases (user_id, item_id)
  VALUES (_user, _item_id)
  ON CONFLICT (user_id, item_id) DO NOTHING;

  -- Journalisé même quand le joueur l'avait déjà : la trace dit ce que
  -- l'administrateur a fait, pas seulement ce qui a changé.
  PERFORM public.log_admin('grant_item', _user::text,
    jsonb_build_object('item_id', _item_id, 'reason', COALESCE(_reason, ''), 'deja_possede', _deja));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_grant_item(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_grant_item(uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
