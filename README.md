# Aztèque

Jeu de cartes traditionnel d'Afrique de l'Ouest — plis, bonnes, comptes et atout — jouable seul contre l'IA ou en ligne à deux.

**Application en ligne** : https://azteque.lovable.app

## Build with Lovable

This project was built with [Lovable](https://lovable.dev). Continue developing this project in the [Lovable editor](https://lovable.dev/projects/4a15b175-f308-4e09-9f55-0eddcc127428).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

### Les adversaires IA

Cinq niveaux, du plus faible au plus fort : **Facile**, **Normal**, **Expert**,
**Maître**, **Légende**.

- _Facile_ et _Normal_ jouent une heuristique simple, volontairement faillible.
- _Expert_ applique une évaluation tactique complète : encaisser les As
  imprenables à l'entame, ne jamais lâcher une bonne sur un pli perdu, protéger
  les Rois et Dames qui valent un compte, et traquer le 10 d'atout adverse.
- _Maître_ y ajoute la résolution exacte de la fin de partie : une fois la
  pioche vide, les cartes encore invisibles sont exactement la main adverse, et
  la position se calcule intégralement.
- _Légende_ déclenche cette résolution plus tôt (dès quatre cartes restantes)
  en échantillonnant les mains adverses possibles.

Le banc d'essai `npm run bench` fait s'affronter deux niveaux sur des donnes
identiques et mesure l'écart réel :

```sh
npm run bench                          # matrice de tous les niveaux
npm run bench legende expert 300       # un duel précis, sur 300 tours
```

`scripts/legacy-ai.ts` fige l'IA d'avant la refonte de septembre 2026 : un
niveau préfixé `old:` la rejoue, ce qui permet de vérifier qu'une modification
fait bien progresser le jeu (`npm run bench legende old:legende 300`).

---

# Règlement officiel — Version 1.0

_Crée une application profetionnelle de jeux et de carte avec les règles suivantes :_

## 1. Présentation

Aztèque est un jeu traditionnel de cartes pratiqué en Afrique de l'Ouest. Il se joue principalement à deux joueurs, mais possède également une variante à quatre joueurs, chacun jouant pour soi.

Le jeu repose sur la conquête des plis, la collecte des bonnes, la réalisation des comptes, la création d'un atout en cours de partie et la maîtrise de la phase finale lorsque la pioche est épuisée.

Le but est de remporter les tours puis le champ.

## 2. Matériel

Le jeu utilise :

- Deux jeux de 52 cartes.
- Les Jokers sont retirés.
- Les cartes de 2 à 6 sont retirées.

Les cartes utilisées sont donc : 7, 8, 9, Valet, Dame, Roi, 10, As.

Le jeu comprend 64 cartes.

## 3. Nombre de joueurs

Aztèque se joue :

- à 2 joueurs ;
- à 4 joueurs.

À quatre joueurs :

- chacun joue pour soi ;
- le sens du jeu est contraire au sens des aiguilles d'une montre.

## 4. Objectif

Remporter davantage de points que son adversaire en obtenant :

- les bonnes ;
- les comptes ;
- la main.

Le premier joueur qui remporte trois tours gagne le champ.

Un joueur gagne également immédiatement le champ s'il obtient au moins treize bonnes au cours d'un même tour.

## 5. Distribution

Les cartes sont mélangées.

Chaque joueur reçoit six cartes.

Le reste constitue la pioche, placée face cachée au centre.

Au premier tour, le premier joueur est désigné par tirage au sort.

Pour les tours suivants :

- le joueur ayant remporté la main du tour précédent distribue les cartes ;
- le joueur qui n'a pas remporté la main joue le premier pli.

## 6. Hiérarchie des cartes

De la plus faible à la plus forte :

**7 < 8 < 9 < Valet < Dame < Roi < 10 < As**

## 7. Déroulement d'un pli

Le joueur ayant la main joue une carte.

Tant que la pioche contient encore des cartes :

- le deuxième joueur peut jouer la carte de son choix ;
- il n'est pas obligé de fournir la même couleur ;
- il n'est pas obligé de battre la carte adverse.

Le vainqueur du pli :

- récupère les cartes jouées ;
- les place dans son tas de gains ;
- pioche la première carte ;
- mène le pli suivant.

Les cartes gagnées ne sont plus remises en jeu pendant le tour.

## 8. Détermination du vainqueur d'un pli

**Même couleur**

La carte la plus forte remporte le pli.

**Couleurs différentes**

En l'absence d'atout, la première carte jouée reste toujours dominante.

> Exemple : Premier joueur : ♥7. Deuxième joueur : ♣As. Le ♥7 remporte le pli.

**Cartes identiques**

Lorsque deux cartes parfaitement identiques sont jouées (possible avec deux jeux), la première carte jouée remporte le pli.

**Atout**

Toute carte d'atout domine toute carte d'une autre couleur.

Même un 7 d'atout bat un As d'une autre couleur.

## 9. Les comptes

Un compte est constitué de cartes de même couleur.

Il existe deux types :

- Compte simple : Roi + Dame.
- Compte triple : Roi + Dame + Valet.

L'annonce d'un compte est facultative.

Un joueur n'est jamais obligé de compter, même s'il possède les cartes nécessaires.

Pour annoncer un compte :

- le joueur doit venir de remporter un pli ;
- la pioche doit contenir au moins une carte.

Les cartes du compte sont déposées face visible mais restent dans la main du joueur.

Elles pourront être reprises et jouées normalement.

## 10. Plusieurs comptes

Un joueur peut posséder plusieurs comptes.

Il peut les annoncer tous simultanément lors de la même annonce.

Si cette annonce est la première du tour, il choisit librement lequel de ses comptes détermine l'atout.

Les autres comptes sont simplement enregistrés.

## 11. L'atout

Le premier compte annoncé crée l'atout.

Si plusieurs comptes sont annoncés simultanément lors de cette première annonce, le joueur choisit lequel fixe l'atout.

Toutes les cartes de cette couleur deviennent des atouts.

Une carte d'atout domine toute carte d'une autre couleur.

Valeur des comptes :

|                                  | Compte simple | Compte triple |
| -------------------------------- | ------------- | ------------- |
| Premier compte (créant l'atout)  | 4 points      | 5 points      |
| Comptes suivants (autre couleur) | 2 points      | 3 points      |

**Second compte à l'atout**

Le jeu utilise deux jeux de 52 cartes : un second Roi + Dame (+ Valet) de la couleur d'atout peut donc exister. Ce second compte à l'atout est annonçable — par le même joueur ou par l'adversaire — et se compte exactement comme le premier compte (4 points pour un compte simple, 5 points pour un compte triple), et non au barème réduit des comptes d'une autre couleur.

> Exemple : un joueur annonce un compte à Trèfle qui fixe l'atout et vaut 4 points (5 s'il s'agit d'un trio). Plus tard dans le tour, ce même joueur ou son adversaire peut encore annoncer le deuxième compte à Trèfle, formé avec les cartes du second jeu : il vaut lui aussi 4 points (ou 5).

## 12. Compléter un compte

Après avoir annoncé un compte simple (Roi + Dame), si le joueur pioche immédiatement le Valet correspondant lors de son premier tirage suivant l'annonce, il peut transformer ce compte en compte triple.

Cette possibilité n'existe que lors de ce premier tirage.

## 13. Fin de la pioche

Lorsque la pioche est entièrement épuisée :

- aucun nouveau compte ne peut être annoncé ;
- la partie continue uniquement avec les cartes restant dans les mains des joueurs.

## 14. Règles lorsque la pioche est vide

Le deuxième joueur doit :

- fournir la couleur demandée s'il la possède ;
- battre la carte adverse s'il en est capable.

S'il ne peut pas battre, il doit jouer la plus forte carte qu'il possède dans cette couleur.

**Exception : protection d'une bonne**

Si cette carte la plus forte est une bonne (10 ou As) et qu'elle serait perdue, le joueur est autorisé à jouer la carte immédiatement inférieure afin de conserver sa bonne.

> Exemple : Premier joueur : As de cœur. Deuxième joueur : 10 de cœur, Valet de cœur, 7 de cœur. Le deuxième joueur peut jouer le Valet afin de protéger son 10.
>
> En revanche, s'il ne possède que le 10, il est obligé de le jouer.

## 15. Les bonnes

Les bonnes sont :

- tous les 10 ;
- tous les As.

Chaque bonne vaut 1 point.

## 16. La main

Le joueur qui remporte le dernier pli obtient la main.

La main vaut 1 point.

## 17. Capture du 10 d'atout

Le 10 d'atout possède un pouvoir particulier.

Lorsqu'un joueur capture le 10 d'atout appartenant à son adversaire, il récupère immédiatement toutes les bonnes que cet adversaire avait gagnées jusqu'à cet instant.

Les comptes restent définitivement acquis à leur propriétaire et ne sont jamais transférés.

## 18. Décompte d'un tour

À la fin du tour, chaque joueur additionne :

- les bonnes ;
- les comptes ;
- la main.

Le joueur totalisant le plus grand nombre de points remporte le tour.

## 19. Victoire

Le champ est remporté :

- par le premier joueur ayant gagné trois tours ;

ou

- immédiatement par tout joueur ayant obtenu au moins treize bonnes au cours d'un seul tour.

## 20. Résumé des points

| Élément               | Valeur   |
| --------------------- | -------- |
| Bonne (10 ou As)      | 1 point  |
| Main                  | 1 point  |
| Premier compte simple | 4 points |
| Premier compte triple | 5 points |
| Compte simple suivant | 2 points |
| Compte triple suivant | 3 points |

## 21. Principes fondamentaux

- Compter est toujours facultatif.
- Plusieurs comptes peuvent être annoncés simultanément.
- Le premier compte annoncé détermine l'atout.
- Si plusieurs comptes sont annoncés lors de cette première annonce, le joueur choisit celui qui fixe l'atout.
- Le second compte à la couleur d'atout (issu du second jeu de cartes), annoncé par le même joueur ou par l'adversaire, se compte comme le premier compte.
- Une fois la pioche épuisée, aucun compte ne peut plus être annoncé.
- Les cartes d'un compte restent dans la main du joueur.
- Les cartes gagnées dans les plis ne reviennent jamais dans le jeu pendant le tour.
- Le 10 d'atout permet de récupérer toutes les bonnes déjà gagnées par l'adversaire.
- Lors de la phase finale, les joueurs doivent fournir la couleur, battre si possible et appliquer la règle de protection des bonnes.

_Fin du règlement officiel – Version 1.0_
