-- Sons locaux : remplacer un effet synthétisé par un vrai enregistrement.
--
-- Le jeu fabrique ses onze sons au vol, sans aucun fichier. C'est ce qui les
-- rend réglables, mais un vrai rire enregistré vaudra toujours mieux qu'un
-- appareil vocal simplifié. La console permet donc de téléverser un fichier
-- par son ; le jeu le joue à la place de la synthèse, et le retirer suffit à
-- revenir à celle-ci.
--
-- Les octets vivent ici, en base64 dans une table, plutôt que dans un seau de
-- stockage : c'est la même mécanique de migration que tout le reste du projet,
-- les mêmes droits, et rien de nouveau à configurer. En échange, les fichiers
-- doivent rester courts — ce sont des effets d'une ou deux secondes, pas de la
-- musique.

CREATE TABLE IF NOT EXISTS public.sound_files (
  -- L'identifiant du son du jeu qu'il remplace : « cheer », « taunt »…
  id text PRIMARY KEY,
  mime text NOT NULL,
  -- Le nom du fichier d'origine, pour que la console dise ce qui est en place.
  name text NOT NULL DEFAULT '',
  -- La taille des octets décodés, affichée telle quelle.
  bytes integer NOT NULL DEFAULT 0,
  -- Le fichier lui-même, en base64.
  data text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

ALTER TABLE public.sound_files ENABLE ROW LEVEL SECURITY;

-- Lisible de tous, y compris sans compte : le jeu contre l'IA n'en demande pas,
-- et il doit s'entendre pareil. L'écriture ne passe que par les fonctions
-- ci-dessous, qui vérifient elles-mêmes qui appelle.
REVOKE ALL ON public.sound_files FROM anon, authenticated;
GRANT SELECT ON public.sound_files TO anon, authenticated;
GRANT ALL ON public.sound_files TO service_role;

DROP POLICY IF EXISTS "Sons visibles de tous" ON public.sound_files;
CREATE POLICY "Sons visibles de tous" ON public.sound_files
FOR SELECT TO anon, authenticated USING (true);

/* ------------------------------------------------------------------ */
/* Installer et retirer                                                */
/* ------------------------------------------------------------------ */

-- Remplace un son par un fichier. Un identifiant déjà pris est écrasé : on
-- change un son, on n'en empile pas deux.
CREATE OR REPLACE FUNCTION public.admin_set_sound_file(
  _id text, _mime text, _name text, _bytes integer, _data text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin();

  IF _id !~ '^[a-zA-Z][a-zA-Z0-9_]{1,39}$' THEN
    RAISE EXCEPTION 'Identifiant de son invalide';
  END IF;
  IF COALESCE(_mime, '') !~ '^audio/' THEN
    RAISE EXCEPTION 'Ce fichier n''est pas un son';
  END IF;
  IF COALESCE(_data, '') = '' THEN
    RAISE EXCEPTION 'Fichier vide';
  END IF;
  -- Un effet de jeu dure une à deux secondes. Au-delà de 700 ko, ce n'est plus
  -- un effet, et chaque joueur le téléchargerait à l'ouverture.
  IF length(_data) > 960000 THEN
    RAISE EXCEPTION 'Fichier trop lourd : 700 ko au maximum';
  END IF;

  INSERT INTO public.sound_files (id, mime, name, bytes, data, updated_at, updated_by)
  VALUES (_id, _mime, COALESCE(_name, ''), GREATEST(COALESCE(_bytes, 0), 0), _data, now(), auth.uid())
  ON CONFLICT (id) DO UPDATE SET
    mime = EXCLUDED.mime, name = EXCLUDED.name, bytes = EXCLUDED.bytes,
    data = EXCLUDED.data, updated_at = now(), updated_by = EXCLUDED.updated_by;

  -- Le journal retient ce qui a été posé, pas les octets : une trace se relit.
  PERFORM public.log_admin('sound_file', _id,
    jsonb_build_object('mime', _mime, 'name', _name, 'bytes', COALESCE(_bytes, 0)));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_sound_file(text, text, text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_sound_file(text, text, text, integer, text) TO authenticated;

-- Retire le fichier : le son revient à la synthèse, et ses curseurs avec.
CREATE OR REPLACE FUNCTION public.admin_clear_sound_file(_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin();
  DELETE FROM public.sound_files WHERE id = _id;
  PERFORM public.log_admin('sound_file_clear', _id, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_clear_sound_file(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_clear_sound_file(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
