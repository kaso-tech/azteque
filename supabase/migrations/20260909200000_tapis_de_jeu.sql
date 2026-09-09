/* ------------------------------------------------------------------ */
/* Les fonds deviennent des tapis                                       */
/* ------------------------------------------------------------------ */

-- La migration précédente les décrivait comme des fonds de page d'accueil :
-- c'était un malentendu. Ils habillent le TAPIS, le carré central où les deux
-- joueurs posent leurs cartes. Leurs images sont donc redessinées pour ce
-- cadre — lumière au centre, là où les cartes se posent, et vignettage tout
-- autour — et leurs descriptions corrigées.
--
-- Ces quatre articles ont été livrés à l'instant et personne n'a encore pu les
-- retoucher : les réécrire sans condition ne détruit le travail de personne.

UPDATE public.shop_items SET
  hint = 'Le soleil se lève sur le tapis',
  data = jsonb_build_object('css',
    'radial-gradient(ellipse 48% 34% at 50% 40%, oklch(0.86 0.14 92 / 0.42), transparent 70%), '
    'radial-gradient(ellipse 128% 112% at 50% 46%, oklch(0.55 0.14 98), oklch(0.25 0.07 70) 96%)')
 WHERE id = 'bg_aurore';

UPDATE public.shop_items SET
  hint = 'Pourpre du soir et braise au centre',
  data = jsonb_build_object('css',
    'radial-gradient(ellipse 46% 32% at 50% 40%, oklch(0.62 0.18 350 / 0.55), transparent 70%), '
    'radial-gradient(ellipse 128% 112% at 50% 46%, oklch(0.43 0.16 322), oklch(0.2 0.08 308) 96%)')
 WHERE id = 'bg_crepuscule';

UPDATE public.shop_items SET
  hint = 'Jouer à la belle étoile',
  data = jsonb_build_object('css',
    'radial-gradient(2px 2px at 14% 12%, oklch(0.98 0.02 95 / 0.9), transparent 60%), '
    'radial-gradient(1.5px 1.5px at 29% 24%, oklch(0.96 0.03 95 / 0.75), transparent 60%), '
    'radial-gradient(2.5px 2.5px at 45% 9%, oklch(0.99 0.02 95 / 0.85), transparent 60%), '
    'radial-gradient(1.5px 1.5px at 64% 19%, oklch(0.96 0.03 95 / 0.7), transparent 60%), '
    'radial-gradient(2px 2px at 82% 11%, oklch(0.98 0.02 95 / 0.85), transparent 60%), '
    'radial-gradient(1.5px 1.5px at 90% 28%, oklch(0.95 0.03 95 / 0.65), transparent 60%), '
    'radial-gradient(1.5px 1.5px at 11% 78%, oklch(0.95 0.03 95 / 0.6), transparent 60%), '
    'radial-gradient(2px 2px at 88% 84%, oklch(0.97 0.02 95 / 0.65), transparent 60%), '
    'radial-gradient(ellipse 50% 36% at 50% 42%, oklch(0.48 0.13 258 / 0.55), transparent 72%), '
    'radial-gradient(ellipse 128% 112% at 50% 46%, oklch(0.33 0.11 262), oklch(0.15 0.06 268) 96%)')
 WHERE id = 'bg_nuit';

UPDATE public.shop_items SET
  hint = 'Trois anneaux d''or autour de la pioche',
  data = jsonb_build_object('css',
    'radial-gradient(ellipse 28% 20% at 50% 42%, oklch(0.86 0.15 88 / 0.42), transparent 62%), '
    'radial-gradient(ellipse 50% 36% at 50% 42%, oklch(0.72 0.13 82 / 0.26), transparent 70%), '
    'radial-gradient(ellipse 76% 56% at 50% 42%, oklch(0.6 0.1 76 / 0.16), transparent 78%), '
    'radial-gradient(ellipse 128% 112% at 50% 46%, oklch(0.47 0.13 152), oklch(0.19 0.06 152) 96%)')
 WHERE id = 'bg_or';

NOTIFY pgrst, 'reload schema';
