ALTER TABLE public.shop_items
  DROP CONSTRAINT IF EXISTS shop_items_kind_check;

ALTER TABLE public.shop_items
  ADD CONSTRAINT shop_items_kind_check
  CHECK (kind IN ('avatar', 'sticker', 'messages', 'background', 'sound'));

INSERT INTO public.shop_items (id, kind, name, hint, price, active, data, sort) VALUES
  ('snd_rire',         'sound', 'Rire',         'Un rire franc, à envoyer après un beau coup', 500, true, '{"soundId":"laugh"}'::jsonb, 200),
  ('snd_pleurer',      'sound', 'Pleurer',      'Un sanglot pour les mauvais sorts',            500, true, '{"soundId":"cry"}'::jsonb,   210),
  ('snd_moquerie',     'sound', 'Moquerie',     'Le rire moqueur, sur un tour perdu',           500, true, '{"soundId":"taunt"}'::jsonb,  220),
  ('snd_felicitations','sound', 'Félicitations', 'L''acclamation, sur un tour gagné',            500, true, '{"soundId":"cheer"}'::jsonb,  230)
ON CONFLICT (id) DO NOTHING;