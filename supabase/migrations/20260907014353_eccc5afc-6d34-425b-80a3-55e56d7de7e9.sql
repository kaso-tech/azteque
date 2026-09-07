-- Photo de profil et pseudo modifiable.
--
-- Le joueur porte désormais une image : celle de son compte Google par défaut,
-- ou l'un des deux avatars dessinés dans l'application. Le choix est public,
-- comme le pseudo et le grade — c'est à cela que les autres le reconnaissent.

/* ------------------------------------------------------------------ */
/* Avatar                                                              */
/* ------------------------------------------------------------------ */

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_kind text NOT NULL DEFAULT 'google',
  ADD COLUMN IF NOT EXISTS avatar_url text;

DO $$
BEGIN
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_avatar_kind_valid
    CHECK (avatar_kind IN ('google', 'homme', 'femme'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- La photo est chargée par le navigateur des AUTRES joueurs : une adresse
-- quelconque y ferait partir une requête vers un serveur choisi par un tiers,
-- qui y lirait leur adresse IP. Seule l'origine des photos Google est donc
-- acceptée, et le moteur le vérifie — le client, lui, écrit ce qu'il veut.
DO $$
BEGIN
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_avatar_url_google
    CHECK (
      avatar_url IS NULL
      OR avatar_url ~ '^https://[a-z0-9-]+\.googleusercontent\.com/[^\s"''<>]*$'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Le joueur choisit son avatar et renomme son compte ; il ne touche toujours
-- ni aux jetons, ni à la cote, ni au cadeau du jour.
GRANT UPDATE (username, avatar_kind, avatar_url, updated_at) ON public.profiles TO authenticated;

/* ------------------------------------------------------------------ */
/* Pseudo modifiable                                                   */
/* ------------------------------------------------------------------ */

-- Le pseudo était donné une fois pour toutes. Il devient modifiable, sans
-- qu'aucune règle ne change par ailleurs : l'index unique sur `lower(username)`
-- refuse toujours un pseudo déjà pris, la contrainte de format s'applique
-- toujours, et rien dans le jeu n'attache d'historique au nom — parties,
-- amitiés et confrontations se rattachent à l'identifiant du compte, que le
-- renommage ne touche pas.

NOTIFY pgrst, 'reload schema';