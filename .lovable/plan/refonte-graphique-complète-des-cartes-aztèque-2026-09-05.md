# Refonte graphique complète des cartes Aztèque

## Constat actuel

- Les cartes sont définies correctement par `id`, `rank` et `suit` dans le moteur, avec deux instances distinctes de chaque carte : cette logique restera inchangée.
- Un unique composant affiche déjà les cartes dans la main, au centre de la table, dans les animations et pour l’adversaire.
- Les cartes 8 à Roi utilisent actuellement une planche photographique recadrée ; les 7 et As sont dessinés en CSS, et le dos est un motif CSS. Ce système sera entièrement remplacé.
- La pioche est actuellement indiquée par un compteur ; les cartes cachées de l’adversaire passent déjà par le même composant avec `faceDown`.

## Réalisation

1. Créer 33 fichiers SVG indépendants et cohérents dans un dossier dédié : les 32 faces demandées et `card_back.svg`, tous au même format et aux mêmes proportions.
2. Construire les cartes numériques avec exactement 7, 8, 9 ou 10 enseignes, des index opposés cohérents et des formes vectorielles nettes, sans emoji ni dépendance à la planche existante.
3. Créer une famille originale de Valets, Dames et Rois à double tête, inspirée des cartes françaises et de motifs ouest-africains, avec une direction artistique commune aux quatre couleurs.
4. Donner aux quatre As un traitement central distinctif mais assorti, puis créer un dos Aztèque premium, parfaitement symétrique et non orientable.
5. Ajouter un registre central typé `getCardAsset(rank, suit)` qui mappe toute carte vers son SVG, sans modifier les identifiants ni la logique des deux jeux.
6. Simplifier le composant d’affichage pour qu’il utilise uniquement ce registre pour les faces et `card_back.svg` pour toutes les cartes cachées, tout en conservant tailles, clics, états désactivés et animations existantes.
7. Retirer l’ancien spritesheet et les styles de pipés devenus inutiles, sans toucher au moteur ni aux règles.

## Vérification

- Contrôler automatiquement la présence et les dimensions des 33 SVG, les 32 correspondances du registre et le nombre exact d’enseignes centrales sur les cartes 7–10.
- Produire une planche visuelle des 32 faces et du dos, puis l’inspecter pour vérifier alignements, couleurs, cohérence des figures et lisibilité.
- Tester une partie sur smartphone : main, cartes cachées, pli central, animation vers la table et dos de pioche/compteur, sans erreur visible.
- Comparer le moteur avant/après et exécuter ses contrôles afin de confirmer qu’aucune règle n’a changé.
