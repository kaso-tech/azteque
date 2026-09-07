-- Sons locaux, deuxième version : un vrai seau de stockage plutôt qu'une
-- colonne texte.
--
-- La migration précédente (20260907220000_sons_locaux.sql) posait le fichier
-- entier, encodé en base64, dans une colonne `text`, transmis par une
-- fonction RPC. Trois défauts concrets : le base64 gonfle chaque fichier
-- d'un tiers, rien n'est mis en cache par le navigateur — chaque ouverture
-- retélécharge et redécode tout — et le canal RPC est fait pour de petites
-- requêtes JSON, pas pour du binaire.
--
-- Supabase Storage existe précisément pour ça. On ne réécrit jamais une
-- migration déjà poussée : celle-ci défait proprement ce que la précédente
-- avait posé, puis reconstruit la même fonctionnalité sur un seau.

DROP FUNCTION IF EXISTS public.admin_set_sound_file(text, text, text, integer, text);
DROP FUNCTION IF EXISTS public.admin_clear_sound_file(text);
DROP TABLE IF EXISTS public.sound_files;

/* ------------------------------------------------------------------ */
/* Le seau                                                             */
/* ------------------------------------------------------------------ */

-- Public : même un joueur non connecté doit entendre les sons, et le jeu
-- contre l'IA n'exige pas de compte.
INSERT INTO storage.buckets (id, name, public)
VALUES ('sounds', 'sounds', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Sons lisibles de tous" ON storage.objects;
CREATE POLICY "Sons lisibles de tous" ON storage.objects
FOR SELECT TO anon, authenticated USING (bucket_id = 'sounds');

-- L'écriture est réservée aux administrateurs — la même fonction que partout
-- ailleurs dans la console, appliquée ici en policy plutôt qu'en fonction
-- SECURITY DEFINER : Storage vérifie ces policies lui-même à chaque requête.
-- Le type et la taille sont aussi vérifiés ici, comme le faisait l'ancienne
-- fonction RPC : un chemin plausible ne suffit pas à faire un son.
-- Chaque dépôt prend un chemin neuf (horodaté) — jamais de remplacement sur
-- place — donc INSERT et DELETE suffisent ; pas de policy UPDATE.
DROP POLICY IF EXISTS "Sons déposés par les administrateurs" ON storage.objects;
CREATE POLICY "Sons déposés par les administrateurs" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'sounds'
  AND public.is_admin()
  AND (metadata ->> 'mimetype') LIKE 'audio/%'
  AND COALESCE((metadata ->> 'size')::bigint, 0) <= 716800
);

DROP POLICY IF EXISTS "Sons retirés par les administrateurs" ON storage.objects;
CREATE POLICY "Sons retirés par les administrateurs" ON storage.objects
FOR DELETE TO authenticated USING (bucket_id = 'sounds' AND public.is_admin());

/* ------------------------------------------------------------------ */
/* Journal                                                             */
/* ------------------------------------------------------------------ */

-- Storage n'appelle pas le code de l'application : le dépôt et le retrait
-- d'un fichier passent directement par son API, sans fonction RPC au milieu.
-- Cette petite fonction ne fait que garder la trace dans le journal, comme
-- avant — elle ne touche à aucun fichier elle-même.
CREATE OR REPLACE FUNCTION public.admin_log_sound_change(
  _id text, _action text, _details jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin();
  PERFORM public.log_admin(_action, _id, COALESCE(_details, '{}'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_log_sound_change(text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_log_sound_change(text, text, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
