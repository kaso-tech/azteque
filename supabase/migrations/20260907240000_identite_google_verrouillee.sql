-- Prénom et nom viennent désormais de Google, et de lui seul.
--
-- Jusqu'ici, le prénom et le nom étaient recopiés depuis Google une fois
-- (client, `syncGoogleIdentity`), mais restaient ensuite des champs de
-- formulaire ordinaires : rien n'empêchait un joueur de les changer à sa
-- guise après coup. On ferme cette porte.
--
-- Un simple retrait du GRANT ne suffirait pas : la synchronisation elle-même
-- passe par une écriture du client, qui se retrouverait bloquée en même
-- temps que la modification qu'on veut interdire. La bonne coupure est entre
-- la source (le fournisseur d'identité, que le client ne choisit pas) et la
-- destination (la colonne) : une fonction qui lit elle-même la métadonnée
-- posée par Supabase Auth au moment de la connexion Google, plutôt que de
-- faire confiance à ce que le client prétend que Google a dit.

REVOKE UPDATE (first_name, last_name) ON public.profiles FROM authenticated;

-- Relit le prénom et le nom que Google a transmis à la dernière connexion, et
-- les recopie sur le profil — en écrasant une éventuelle valeur antérieure :
-- après ce verrouillage, la seule source possible redevient Google, donc
-- resynchroniser ne peut que corriger un écart, jamais en introduire un.
CREATE OR REPLACE FUNCTION public.sync_google_identity()
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _meta jsonb;
  _prenom text;
  _nom text;
  _profil public.profiles;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT raw_user_meta_data INTO _meta FROM auth.users WHERE id = auth.uid();
  _prenom := NULLIF(TRIM(BOTH FROM (_meta ->> 'given_name')), '');
  _nom := NULLIF(TRIM(BOTH FROM (_meta ->> 'family_name')), '');

  UPDATE public.profiles
  SET first_name = _prenom, last_name = _nom, updated_at = now()
  WHERE id = auth.uid()
  RETURNING * INTO _profil;

  RETURN _profil;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_google_identity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_google_identity() TO authenticated;

NOTIFY pgrst, 'reload schema';
