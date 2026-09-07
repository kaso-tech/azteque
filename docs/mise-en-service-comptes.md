# Mise en service des comptes joueurs

Le code des comptes (connexion Google, pseudo unique, amis, invitations,
jetons conservés, historique des confrontations) est en place dans le dépôt,
mais **il ne fonctionnera pas tant que les deux étapes ci-dessous n'auront pas
été faites sur le projet Supabase**. Elles demandent un accès à la console du
projet, que l'agent n'a pas.

## 1. Appliquer les migrations

Fichiers, dans cet ordre :

1. `supabase/migrations/20260906200000_accounts_friends_invites.sql`
2. `supabase/migrations/20260906230000_sync_offline_tokens.sql`
3. `supabase/migrations/20260906240000_player_ranks.sql`
4. `supabase/migrations/20260907090000_daily_bonus.sql`
5. `supabase/migrations/20260907120000_avatars_and_rename.sql`
6. `supabase/migrations/20260907140000_boutique.sql`

La seconde doit passer **après** `20260906224310_...`, la copie de la première
appliquée par Lovable : celle-ci recrée l'ancienne fonction
`claim_local_tokens`, et l'ordre des noms de fichiers est ce qui l'en empêche.

Il crée les tables `profiles`, `friendships`, `game_invites`, ajoute trois
colonnes de résultat à `matches` (`winner_id`, `finished_at`, `settled_at`) et
quatre fonctions serveur. Il est écrit pour être rejouable : `IF NOT EXISTS`,
`CREATE OR REPLACE`, `DROP POLICY IF EXISTS`. Le relancer ne casse rien.

### Prompt à donner à l'agent Lovable

> Applique la migration SQL du fichier
> `supabase/migrations/20260906200000_accounts_friends_invites.sql` sur la base
> de ce projet, telle quelle, sans la modifier. Elle crée les tables
> `profiles`, `friendships` et `game_invites`, ajoute les colonnes
> `winner_id`, `finished_at` et `settled_at` à la table `matches`, et crée les
> fonctions `accept_game_invite`, `claim_local_tokens`, `settle_match` et
> `award_ai_win`. Elle ajoute aussi `game_invites` à la publication temps réel
> `supabase_realtime`. Applique ensuite, toujours telle quelle, la migration
> `supabase/migrations/20260906230000_sync_offline_tokens.sql`, qui ajoute la
> colonne `local_tokens_total` à `profiles` et remplace la fonction
> `claim_local_tokens`. Applique enfin
> `supabase/migrations/20260906240000_player_ranks.sql`, qui ajoute les
> colonnes `rating`, `peak_rating` et `rated_games` à `profiles`, les colonnes
> `rating_delta_host` et `rating_delta_guest` à `matches`, crée les fonctions
> `elo_k`, `rating_floor` et `apply_match_rating`, et remplace `settle_match`.
> Applique pour finir `supabase/migrations/20260907090000_daily_bonus.sql`, qui
> ajoute la colonne `daily_bonus_at` à `profiles`, crée la fonction
> `claim_daily_bonus` et met à jour le barème de `award_ai_win`. Applique
> enfin `supabase/migrations/20260907120000_avatars_and_rename.sql`, qui ajoute
> les colonnes `avatar_kind` et `avatar_url` à `profiles` avec leurs contraintes
> et étend le droit d'écriture du client à ces deux colonnes. Applique en
> dernier `supabase/migrations/20260907140000_boutique.sql`, qui crée les tables
> `shop_items` et `purchases`, la fonction `buy_item` et le déclencheur
> `profiles_avatar_owned`.
> Ensuite, régénère le fichier de types TypeScript
> `src/integrations/supabase/types.ts` pour qu'il inclue ces nouvelles tables.

## 2. Activer la connexion Google

Dans la console Supabase du projet, **Authentication → Providers → Google** :

1. Activer le fournisseur.
2. Renseigner le _Client ID_ et le _Client Secret_ d'un identifiant OAuth
   Google (console Google Cloud → API et services → Identifiants → ID client
   OAuth, type « Application Web »).
3. Côté Google Cloud, autoriser l'URI de redirection que Supabase affiche sur
   cette même page (de la forme `https://<projet>.supabase.co/auth/v1/callback`).
4. Dans **Authentication → URL Configuration**, ajouter aux _Redirect URLs_ :
   - `https://azteque.lovable.app/online`
   - `http://localhost:3000/online` (pour le développement local)

L'application redirige vers `/online` après connexion ; sans ces URL dans la
liste, Supabase refusera la redirection.

## Si l'application dit « Les tables des comptes sont introuvables »

C'est le code PostgREST `PGRST205` : la table `profiles` n'est pas visible sur
le projet interrogé. Deux causes, dans cet ordre de probabilité.

**1. La migration a échoué en bloc.** Une migration s'exécute dans une
transaction : la moindre instruction refusée annule tout, y compris les tables
déjà créées. La première version de ce fichier commençait par
`CREATE EXTENSION citext`, qui demande un privilège élevé — refusé, il
emportait toute la migration avec lui. La version actuelle n'utilise plus
d'extension et rend l'ajout au canal temps réel non bloquant : **il suffit de
la relancer**, elle est rejouable sans risque.

**2. Le cache de schéma de PostgREST n'a pas été rechargé.** La migration se
termine désormais par `NOTIFY pgrst, 'reload schema';`, ce qui suffit
normalement. À défaut, redémarrer l'API du projet depuis la console Supabase.

Pour savoir laquelle des deux, ouvrir l'éditeur de tables du projet : si
`profiles` n'y figure pas, c'est la cause 1.

## Si l'application dit « La base ne connaît pas encore la colonne… »

C'est le code PostgREST `PGRST204` (ou `42703`) : la table existe, mais pas la
colonne demandée. Une migration reste à appliquer — le message nomme le fichier.

Les migrations de ce dépôt sont appliquées à part, depuis la console du projet :
le code déployé peut donc tourner en avance sur la base. Pour que cet écart ne
casse rien de plus que nécessaire, la lecture des profils redemande sans les
colonnes manquantes : la recherche de joueurs, la liste d'amis et les
invitations continuent de fonctionner, sans image ni grade, jusqu'à ce que la
migration passe. Seule l'action qui a besoin de la colonne — changer d'avatar,
par exemple — reste refusée, avec le nom du fichier à appliquer.

## Vérifier que Google est bien activé sur LE BON projet

L'erreur `{"code":400,"error_code":"validation_failed","msg":"Unsupported
provider: provider is not enabled"}` vient du serveur d'authentification
lui-même : le fournisseur n'est pas actif **sur le projet Supabase que
l'application interroge**. Le cas le plus courant est d'avoir activé Google sur
un autre projet que celui visé par l'application.

Le projet visé est celui de `VITE_SUPABASE_URL` dans `.env`. Pour lever le
doute sans rien installer, ouvrir dans un navigateur :

```
https://<référence-du-projet>.supabase.co/auth/v1/settings
```

La réponse JSON liste les fournisseurs actifs. Il doit s'y trouver :

```json
"external": { "google": true, ... }
```

Si `google` y vaut `false`, c'est bien ce projet-là qu'il faut configurer —
quelle que soit la console où l'activation a déjà été faite.

## Les jetons

Trois sources, et une seule règle : le client ne s'en crédite jamais lui-même
quand un compte est ouvert.

| Source                   | Montant                                 | Décidé par          |
| ------------------------ | --------------------------------------- | ------------------- |
| Victoire contre l'IA     | 20 / 40 / 60 / 80 / 100 selon le niveau | `award_ai_win`      |
| Cadeau du jour           | 50, une fois par journée civile         | `claim_daily_bonus` |
| Mise d'un champ en ligne | ce qui a été misé                       | `settle_match`      |

Le cadeau du jour est proposé à l'ouverture du menu. Sans compte, il est versé
dans le navigateur et rejoindra le compte à la prochaine connexion ; avec un
compte, c'est la base qui tient la date du dernier versement — hors d'atteinte
du client — et qui décide. La journée est comptée en UTC des deux côtés, pour
que le cadeau ne paraisse jamais dû ici et refusé là-bas.

Une longue absence ne cumule pas les cadeaux manqués : le retour en vaut un,
pas trente.

## Visage et pseudo

Le joueur porte la **photo de son compte Google** par défaut, ou l'un des deux
avatars dessinés dans l'application (`src/components/azteque/avatar.tsx`), qui
n'appellent aucune requête. Le choix est public, comme le pseudo et le grade.

L'adresse de la photo est recopiée sur le profil à chaque ouverture, parce que
Google la renouvelle quand le joueur change d'image. Elle n'est acceptée que si
elle vient de `*.googleusercontent.com`, et le moteur le vérifie : cette photo
est chargée par le navigateur des **autres** joueurs, et une adresse quelconque
y ferait partir une requête vers un serveur choisi par un tiers, qui y lirait
leur adresse IP.

Le **pseudo est modifiable**. Sa disponibilité s'affiche pendant la frappe,
mais ne conditionne rien : c'est l'index unique qui tranche au moment de
l'enregistrement, et son refus est montré tel quel. Une vérification qui
n'aboutit pas — réseau lent, projet injoignable — se déclare perdue au bout de
six secondes et laisse tout de même essayer. Renommer un compte est sans
conséquence sur le reste : parties, amitiés, jetons et confrontations se
rattachent à l'identifiant du compte, jamais au nom.

## La boutique

Trois rayons — cinq avatars de 500 à 2500 jetons, six stickers de 200 à 900, et
trois lots de cinq messages de 400 à 800 — payés avec les jetons du compte.

Le catalogue est écrit à deux endroits, et c'est délibéré : le client garde les
dessins et les libellés (`src/lib/azteque/shop.ts`), la base garde les
identifiants et les **prix**. C'est elle qui débite ; un prix annoncé par le
client ne vaudrait rien, il suffirait de le mettre à zéro. Rien dans le code
n'impose que les deux listes concordent : un test le vérifie en lisant la
migration.

Le client ne peut ni s'offrir un achat (aucun droit d'écriture sur
`purchases` : seul `buy_item` en crée, et il débite dans le même mouvement), ni
modifier un prix, ni voir les achats d'autrui. Et l'on ne porte que ce qu'on
possède : un déclencheur sur `profiles` refuse un avatar qui n'a pas été acheté
— la vérification ne pouvait pas rester une contrainte de colonne, puisqu'elle
demande d'aller lire les achats.

## Le classement

Chaque joueur porte une **cote** (un nombre) dont se déduit son **grade** (un
nom parmi dix). La cote vit en base, le barème des grades dans
`src/lib/azteque/rank.ts` — un seul endroit, pour qu'il n'y ait pas deux
barèmes à tenir en accord.

La cote suit la formule d'Elo, celle des échecs : l'écart de cote donne la
probabilité de gagner, et l'on ne gagne ou ne perd que l'écart entre le
résultat et cette attente. D'où le comportement demandé, sans règle
supplémentaire — voici ce qu'un Expert établi (1600 points) gagne ou perd
selon l'adversaire :

| Adversaire          | S'il gagne | S'il perd |
| ------------------- | ---------- | --------- |
| Novice (1150)       | +2         | **−22**   |
| Stratège (1300)     | +4         | −20       |
| Vétéran (1450)      | +7         | −17       |
| Expert (1600)       | +12        | −12       |
| Maître (1750)       | +17        | −7        |
| Grand Maître (1900) | +20        | −4        |
| Légende (2050)      | **+22**    | −2        |

Battre plus faible que soi ne rapporte presque rien ; perdre contre lui coûte
le maximum. Cinq défaites d'affilée contre un Novice font passer un Expert de
1720 à 1607 points, soit un grade perdu.

Trois réglages complètent le barème :

- **Rodage.** Les dix premières parties classées comptent presque double
  (K = 40 au lieu de 24), le temps que la cote rejoigne le niveau réel.
- **Sommet.** Au-dessus de 2000 points, l'amplitude se resserre (K = 16) : une
  cote de Grand Maître se mérite sur la durée.
- **Plancher.** La cote ne descend pas sous 800. La variation affichée tient
  compte du plancher : elle dit ce qui a réellement été retiré.

Seules les **parties en ligne entre deux comptes** sont classées, et le calcul
se fait dans `settle_match`, la fonction qui lit elle-même le vainqueur dans
l'état de la partie. Une victoire contre l'IA est annoncée par le client, qui
pourrait l'inventer : la faire compter viderait le classement de son sens.
Elle continue de rapporter des jetons, pas de la cote.

## Ce qui change pour les joueurs

- **Le jeu en ligne demande désormais un compte.** L'identité anonyme, propre à
  un navigateur et perdue avec lui, ne permettait ni de conserver des jetons ni
  de retrouver un adversaire. Le jeu contre l'IA, lui, reste accessible sans
  compte.
- **Le pseudo du compte remplace celui du navigateur.** Une fois connecté, le
  joueur porte partout le nom sous lequel les autres le trouvent ; le champ du
  panneau de profil devient une simple lecture.
- **Les jetons gagnés hors connexion rejoignent le compte** à la connexion
  suivante, y compris sur un compte ancien. Le solde du navigateur est remis à
  zéro dans le même mouvement, ce qui interdit de le reporter deux fois ; une
  fois connecté, les gains ne passent plus par le navigateur.
  Le serveur n'a aucun moyen de vérifier une partie jouée hors connexion : il
  ne peut que borner ce qu'il accepte, à 10 000 jetons par report et 50 000 sur
  la durée de vie d'un compte (colonne `local_tokens_total`).
- **Chaque joueur porte un grade, visible de tous.** Il apparaît à côté du
  pseudo dans la recherche, la liste d'amis, les invitations et à la table,
  de sorte que chacun sache contre qui il engage une partie.
- **Les jetons ne sont plus crédités par le navigateur.** La récompense d'une
  victoire contre l'IA et le règlement d'une mise entre joueurs passent par des
  fonctions serveur qui relisent elles-mêmes le résultat de la partie. Le
  privilège d'écriture sur la colonne `tokens` est retiré au client.

## Vérifications à faire après la mise en service

Aucune de ces étapes n'a pu être exercée depuis l'environnement de
développement de l'agent, dont l'accès réseau au projet Supabase est bloqué :

1. Se connecter avec Google, choisir un pseudo, vérifier qu'un second compte ne
   peut pas prendre le même.
2. Rechercher ce pseudo depuis un autre compte, l'ajouter en ami, accepter la
   demande.
3. Vérifier la pastille « en ligne » lorsque les deux comptes sont ouverts.
4. Inviter, accepter, jouer un champ complet et vérifier que la mise est bien
   déplacée entre les deux soldes — et une seule fois.
5. Vérifier que le bilan « Face à X » apparaît en fin de champ.
6. Se déconnecter, gagner une partie contre l'IA, se reconnecter : les jetons
   gagnés doivent s'ajouter au solde du compte, et une seconde connexion ne
   doit rien ajouter de plus.
7. Vérifier que la photo Google apparaît d'elle-même sur le profil, la
   remplacer par un avatar, et la voir reparaître en la rechoisissant.
8. Renommer son compte, vérifier que le nouveau nom est bien annoncé libre
   pendant la frappe, puis qu'un second compte se voit refuser le même.
9. Acheter un avatar en boutique, le porter, vérifier que l'adversaire le voit ;
   acheter un sticker et un lot de messages, et les retrouver dans la
   discussion d'une partie en ligne.
10. Ouvrir le jeu connecté : le cadeau du jour doit être proposé une fois, puis
    plus jusqu'au lendemain, y compris après rechargement ou dans un second
    onglet.
11. Jouer un champ en ligne et vérifier, en fin de partie, la variation de cote
    affichée sous le score — puis le grade mis à jour dans le salon et sur le
    profil. L'adversaire doit voir la variation opposée.
