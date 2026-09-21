-- Notifications push : à qui envoyer, et ce que chacun accepte de recevoir.
--
-- (Migration à appliquer sur le projet Supabase externe jwhrkxqwhvfpdxuufbwz.
-- Le dossier supabase/migrations/ du dépôt est réservé au backend interne de
-- la plateforme ; ce fichier fait foi pour rejouer le schéma ailleurs.)
--
-- Deux tables, et la distinction compte :
--
-- — Un ABONNEMENT appartient à un appareil, pas à un joueur. Le même compte
--   ouvert sur un téléphone et sur un ordinateur en a deux, et chacun doit
--   recevoir. L'adresse d'abonnement (`endpoint`) est donc la clé : c'est elle
--   que le service de push connaît, elle qui est unique au monde, et elle qui
--   doit changer de propriétaire si un autre compte se connecte sur le même
--   appareil.
--
-- — Une PRÉFÉRENCE appartient au joueur : couper les annonces d'amis doit les
--   couper partout, pas seulement sur le téléphone où on a décoché la case.
--
-- Le serveur lit ces tables avec la clé de service (hors RLS) pour envoyer.
-- Les politiques ci-dessous ne concernent donc que ce qu'un joueur fait de ses
-- propres lignes depuis son navigateur.

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  -- L'adresse que le service de push nous a remise. Unique : un appareil qui
  -- se réabonne sous un autre compte déplace sa ligne au lieu d'en créer une
  -- seconde, sans quoi l'ancien compte continuerait de recevoir dessus.
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  /** Pour distinguer deux appareils dans l'écran de réglages. */
  agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx
  ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.push_subscriptions FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.push_subscriptions_id_seq TO authenticated;

DROP POLICY IF EXISTS "Mes abonnements" ON public.push_subscriptions;
CREATE POLICY "Mes abonnements" ON public.push_subscriptions
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

/* ------------------------------------------------------------------ */
/* Ce que chacun accepte de recevoir                                   */
/* ------------------------------------------------------------------ */

CREATE TABLE IF NOT EXISTS public.push_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  -- Quelqu'un vous attend à une table : le cas qui justifie à lui seul tout
  -- ce mécanisme.
  invitation boolean NOT NULL DEFAULT true,
  -- La file d'attente vous a trouvé un adversaire.
  appariement boolean NOT NULL DEFAULT true,
  -- Un mot de l'administration (voir `player_messages`).
  message boolean NOT NULL DEFAULT true,
  -- Votre adversaire propose de rejouer.
  revanche boolean NOT NULL DEFAULT true,
  -- Un ami se connecte. Le plus bavard des cinq, d'où le verrou ci-dessous.
  ami_en_ligne boolean NOT NULL DEFAULT true,
  -- Dernière fois que CE joueur a annoncé son arrivée à ses amis. Un
  -- rechargement de page, une coupure de réseau, un passage de la 4G au
  -- wifi : autant de reconnexions qui ne doivent pas réveiller tout le monde.
  ami_annonce_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.push_preferences ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.push_preferences FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.push_preferences TO authenticated;
GRANT ALL ON public.push_preferences TO service_role;

DROP POLICY IF EXISTS "Mes préférences de notification" ON public.push_preferences;
CREATE POLICY "Mes préférences de notification" ON public.push_preferences
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

NOTIFY pgrst, 'reload schema';
