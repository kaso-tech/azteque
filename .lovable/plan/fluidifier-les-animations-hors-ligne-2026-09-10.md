# Fluidifier les animations hors ligne

## Modifications

- Ralentir légèrement le mélange, l’intervalle de distribution et le vol des cartes contre l’IA, sans modifier le rythme du jeu en ligne.
- Synchroniser l’arrivée de la carte piochée avec son insertion réelle dans la main, puis empêcher l’animation d’apparition de se rejouer sur cette carte.
- Retirer les libellés « Vous (mène) » et « Adversaire (mène) » sous les cartes posées, tout en conservant des emplacements de taille stable.

## Vérification

- Lancer une partie contre l’IA et contrôler visuellement le mélange et les douze cartes distribuées.
- Jouer plusieurs plis avec pioche par les deux joueurs et vérifier qu’aucune carte ne disparaît ou ne réapparaît à l’arrivée.
- Confirmer que les libellés sous le pli ont disparu et que la disposition du tapis reste stable sur mobile.
- Exécuter les tests ciblés et vérifier que l’aperçu se construit sans erreur.
