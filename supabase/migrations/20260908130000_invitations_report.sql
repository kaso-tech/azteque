-- Renvoi différé d'une invitation à jouer.
--
-- Jusqu'ici, une invitation ne connaissait que trois issues : acceptée,
-- refusée, ou annulée par l'hôte. Le joueur invité qui était occupé — en
-- pleine partie, contre l'IA ou en ligne — n'avait d'autre choix que de
-- refuser ou d'ignorer l'invitation, qui restait alors muette pour celui qui
-- l'avait envoyée.
--
-- `snoozed_at` porte l'instant du dernier report. Sa seule fonction est de
-- CHANGER à chaque report : Postgres ne notifie en temps réel que les lignes
-- réellement modifiées, et un simple drapeau ne le serait qu'une fois — or
-- l'expéditeur doit être averti à chaque report, pas seulement au premier.
-- Le report ne change pas le statut : l'invitation reste « pending » jusqu'à
-- ce que l'invité accepte ou refuse pour de bon.

ALTER TABLE public.game_invites ADD COLUMN IF NOT EXISTS snoozed_at timestamptz;

-- La policy d'origine n'admettait que le passage à « declined » ou
-- « cancelled ». Celle-ci resserre en même temps QUI peut faire QUOI :
--   * l'invité (to_id) peut refuser, ou laisser le statut en attente le
--     temps de reporter sa réponse (c'est ce que change `snoozed_at`) ;
--   * l'hôte (from_id) ne peut qu'annuler — jamais refuser à la place de
--     l'invité, ce qu'autorisait par mégarde la policy d'origine.
DROP POLICY IF EXISTS "Répondre à une invitation" ON public.game_invites;
CREATE POLICY "Répondre à une invitation" ON public.game_invites FOR UPDATE TO authenticated
USING (auth.uid() IN (from_id, to_id))
WITH CHECK (
  (auth.uid() = to_id AND status IN ('declined', 'pending'))
  OR (auth.uid() = from_id AND status = 'cancelled')
);

NOTIFY pgrst, 'reload schema';
