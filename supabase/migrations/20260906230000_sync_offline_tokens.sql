-- Report des jetons gagnés hors connexion vers un compte existant.
--
-- Datée après 20260906224310, qui reprend à l'identique la migration des
-- comptes : appliquée ensuite, elle rétablirait l'ancienne fonction et
-- annulerait tout ce fichier. L'ordre des noms est ici la seule garantie.
--
-- La première version de `claim_local_tokens` n'acceptait qu'un seul report
-- par compte (`claimed_local_tokens`). Elle couvrait la création d'un compte,
-- mais laissait de côté le cas courant : un joueur déjà inscrit qui joue
-- contre l'IA sans être connecté, puis se connecte. Ses gains restaient dans
-- le navigateur.
--
-- Le report devient donc répétable. Rien ne permet au serveur de vérifier une
-- partie jouée hors connexion : le montant annoncé est fait de confiance, on
-- se contente de le borner. Deux plafonds, l'un par appel et l'autre sur la
-- durée de vie du compte, limitent ce qu'un client malveillant peut
-- s'attribuer par cette voie ; le décompte cumulé les rend vérifiables.
--
-- Côté client, le solde local est remis à zéro après un report réussi, et les
-- gains d'un joueur connecté ne passent plus par le navigateur mais par
-- `award_ai_win` : en usage normal, la fonction n'est appelée qu'à la
-- connexion, avec ce qui a été gagné depuis la déconnexion.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS local_tokens_total integer NOT NULL DEFAULT 0;

-- Les comptes ayant déjà bénéficié de l'ancien report à usage unique gardent
-- une trace de ce qu'ils ont reçu : le plafond cumulé reste sincère. Le
-- montant exact n'ayant pas été conservé, on retient le plafond d'un report,
-- soit la borne haute de ce qu'ils ont pu obtenir.
UPDATE public.profiles
SET local_tokens_total = greatest(local_tokens_total, least(tokens, 10000))
WHERE claimed_local_tokens = true AND local_tokens_total = 0;

CREATE OR REPLACE FUNCTION public.claim_local_tokens(_amount integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _per_call constant integer := 10000;  -- soit 40 victoires au niveau Légende
  _lifetime constant integer := 50000;  -- report cumulé maximal par compte
  _add integer;
  _new integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT least(
           least(greatest(COALESCE(_amount, 0), 0), _per_call),
           greatest(_lifetime - local_tokens_total, 0)
         )
    INTO _add
    FROM public.profiles
   WHERE id = auth.uid();

  IF _add IS NULL THEN
    RAISE EXCEPTION 'Profil introuvable';
  END IF;

  UPDATE public.profiles
     SET tokens = tokens + _add,
         local_tokens_total = local_tokens_total + _add,
         claimed_local_tokens = true
   WHERE id = auth.uid()
  RETURNING tokens INTO _new;

  RETURN _new;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_local_tokens(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_local_tokens(integer) TO authenticated;

-- Sans ce signal, PostgREST continue d'exposer l'ancienne signature et la
-- nouvelle colonne reste invisible jusqu'au prochain redémarrage de l'API.
NOTIFY pgrst, 'reload schema';
