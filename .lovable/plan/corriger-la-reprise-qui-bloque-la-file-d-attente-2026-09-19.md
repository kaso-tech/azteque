# Corriger la reprise qui bloque la file d’attente

## À modifier
- Ne proposer « Reprendre la partie » que pour une vraie partie commencée avec deux joueurs.
- Ignorer les anciennes tables encore simplement « en attente », afin que « Chercher un adversaire » reste disponible.
- Réinitialiser correctement cette proposition lorsqu’aucune partie réellement active n’est trouvée.

## Vérification
- Ajouter un test ciblé sur la sélection de la partie à reprendre.
- Vérifier le typage, les tests et l’état de construction de l’aperçu.

## Détail technique
La base contient encore de nombreuses anciennes tables `waiting`. Elles ne sont pas des parties en cours, mais la lecture actuelle les confond avec une partie jouable. La sélection sera limitée aux lignes `playing` ayant bien un adversaire.
