# Mise en service des comptes joueurs

Le code des comptes (connexion Google, pseudo unique, amis, invitations,
jetons conservés, historique des confrontations) est en place dans le dépôt,
mais **il ne fonctionnera pas tant que les deux étapes ci-dessous n'auront pas
été faites sur le projet Supabase**. Elles demandent un accès à la console du
projet, que l'agent n'a pas.

## 1. Appliquer les migrations

Fichiers, dans cet ordre :

1. `20260906200000_accounts_friends_invites.sql` — comptes, amis, invitations
2. `20260906230000_sync_offline_tokens.sql` — report des jetons hors connexion
3. `20260906240000_player_ranks.sql` — cote et grades
4. `20260907090000_daily_bonus.sql` — cadeau du jour, barème des victoires IA
5. `20260907120000_avatars_and_rename.sql` — avatars, pseudo modifiable
6. `20260907140000_boutique.sql` — boutique et achats
7. `20260907160000_administration.sql` — console d'administration
8. `20260907190000_console_complete.sql` — fiches détaillées, catalogue en base
9. `20260907220000_sons_locaux.sql` — sons remplaçables par des fichiers (base64)
10. `20260907230000_sons_storage.sql` — remplace le n° 9 par un seau Storage
11. `20260907240000_identite_google_verrouillee.sql` — prénom et nom non modifiables

Tous sont dans `supabase/migrations/` et écrits pour être rejoués sans risque :
`IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP POLICY IF EXISTS`. Les relancer ne
casse rien.

Le second doit passer **après** `20260906224310_...`, la copie du premier
appliquée par Lovable : celle-ci recrée l'ancienne fonction
`claim_local_tokens`, et l'ordre des noms de fichiers est ce qui l'en empêche.

### Prompt à donner à l'agent Lovable

> Applique sur la base de ce projet, telles quelles et sans les modifier, les
> migrations SQL suivantes, dans cet ordre — celles qui sont déjà passées
> peuvent être relancées sans risque :
>
> 1. `supabase/migrations/20260906200000_accounts_friends_invites.sql` — crée
>    `profiles`, `friendships`, `game_invites`, ajoute `winner_id`,
>    `finished_at` et `settled_at` à `matches`, et les fonctions
>    `accept_game_invite`, `claim_local_tokens`, `settle_match`, `award_ai_win`.
> 2. `supabase/migrations/20260906230000_sync_offline_tokens.sql` — ajoute
>    `local_tokens_total` à `profiles`, remplace `claim_local_tokens`.
> 3. `supabase/migrations/20260906240000_player_ranks.sql` — ajoute `rating`,
>    `peak_rating`, `rated_games` à `profiles`, `rating_delta_host` et
>    `rating_delta_guest` à `matches`, crée `elo_k`, `rating_floor`,
>    `apply_match_rating`, remplace `settle_match`.
> 4. `supabase/migrations/20260907090000_daily_bonus.sql` — ajoute
>    `daily_bonus_at` à `profiles`, crée `claim_daily_bonus`, met à jour
>    `award_ai_win`.
> 5. `supabase/migrations/20260907120000_avatars_and_rename.sql` — ajoute
>    `avatar_kind` et `avatar_url` à `profiles`.
> 6. `supabase/migrations/20260907140000_boutique.sql` — crée `shop_items`,
>    `purchases`, `buy_item` et le déclencheur `profiles_avatar_owned`.
> 7. `supabase/migrations/20260907160000_administration.sql` — ajoute `is_admin`
>    et `banned` à `profiles`, `active` à `shop_items`, crée `admin_log`,
>    `app_settings` et les fonctions d'administration.
> 8. `supabase/migrations/20260907190000_console_complete.sql` — ajoute
>    `first_name`, `last_name`, `country`, `rounds_played` et `last_seen_at` à
>    `profiles`, `name`, `hint`, `data` et `sort` à `shop_items`, crée
>    `touch_last_seen`, `admin_upsert_item` et `admin_delete_item`.
> 9. `supabase/migrations/20260907220000_sons_locaux.sql` — crée `sound_files`,
>    `admin_set_sound_file` et `admin_clear_sound_file`.
> 10. `supabase/migrations/20260907230000_sons_storage.sql` — retire ce que le
>     n° 9 avait posé (base64 en colonne), crée à la place le seau Storage
>     `sounds`, ses policies, et la fonction `admin_log_sound_change`.
> 11. `supabase/migrations/20260907240000_identite_google_verrouillee.sql` —
>     retire à `authenticated` le droit d'écrire `first_name` et `last_name`
>     sur `profiles`, crée la fonction `sync_google_identity`.
>
> Régénère ensuite le fichier de types TypeScript
> `src/integrations/supabase/types.ts` pour qu'il inclue ces nouvelles tables et
> colonnes.

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

## La console d'administration

Elle vit à l'adresse `/admin`, et un lien n'apparaît au menu que pour les
administrateurs. Ce lien n'est qu'une commodité : **le droit ne vient pas de
l'interface**. Chaque opération appelle une procédure serveur qui vérifie
elle-même que l'appelant administre, et le droit d'administrer ne s'écrit pas
depuis le client. Cacher un bouton n'a jamais empêché personne d'appeler ce
qu'il déclenche.

### Se désigner premier administrateur

Le premier administrateur ne peut pas être nommé depuis la console — il n'y en
a aucun pour le faire. Une fois connecté au moins une fois avec le compte
voulu, exécuter ceci dans l'éditeur SQL du projet Supabase :

```sql
UPDATE public.profiles SET is_admin = true WHERE lower(username) = 'votre_pseudo';
```

La page `/admin` affiche d'ailleurs cette requête toute prête, avec le pseudo du
compte connecté déjà dedans. Les suivants se nomment depuis la console. On ne
peut ni se révoquer, ni se suspendre soi-même : ce serait fermer la porte de
l'intérieur, et il pourrait ne rester personne pour la rouvrir.

### Ce qu'elle permet

- **Joueurs** — la fiche complète : pseudo, nom et prénom, pays, grade et cote,
  jetons, tours joués, champs classés, achats, statut en ligne ou hors ligne, et
  date d'inscription. La recherche porte aussi sur le nom et le prénom. De là :
  **envoyer ou retirer des jetons** avec un motif, suspendre ou rétablir, nommer
  ou révoquer un administrateur.
- **Boutique** — le catalogue entier est modifiable et extensible : nom,
  description, prix, mise en vente, ordre d'affichage, et selon la nature les
  phrases d'un lot ou le dessin emprunté au jeu. On crée un avatar, un sticker
  ou un lot de messages du même geste qu'on en modifie un. Un article retiré
  reste acquis à ceux qui l'ont déjà ; il ne se supprime que s'il n'a jamais été
  acheté. Les dessins, eux, restent dans le code — on ne dessine pas un avatar
  depuis une page web — et un article nouveau choisit parmi ceux qui existent.
- **Sons** — les quinze sons du jeu, réglables en volume, hauteur et vitesse, et,
  pour les rires, en nombre de syllabes, descente et voyelle ; pour les
  acclamations, en nombre de voix et densité d'applaudissements. Un bouton
  d'écoute, un volume général. Enregistré, le réglage vaut pour tous les joueurs
  à leur prochaine ouverture. Chaque son peut aussi être **remplacé par un
  fichier local** — un vrai rire, de vraies acclamations : le fichier s'installe
  aussitôt, sans passer par « Enregistrer », et le retirer rend au son sa
  synthèse. 700 ko au maximum, puisque chaque joueur les télécharge à
  l'ouverture ; un fichier que le navigateur n'ouvre pas est refusé sur place,
  avant d'atteindre la base.
- **Journal** — toute action laisse une trace horodatée avec son motif. Une
  console qui distribue des jetons sans mémoire est une console qu'on ne peut
  pas auditer.

Un compte suspendu ne peut plus créer de table, ni acheter, ni gagner de jetons
contre l'IA ; les règles sont appliquées par la base, pas par l'écran.

## Identité du joueur

Outre son pseudo, un joueur voit son **prénom, son nom et son pays** depuis son
profil. Le prénom et le nom viennent de Google, et de lui seul : la fonction
`sync_google_identity` les relit à chaque connexion depuis la métadonnée que
Supabase Auth y a posée, et `authenticated` n'a plus le droit d'écrire ces deux
colonnes directement — un joueur ne peut donc pas se donner un autre nom que
celui de son compte Google. Le pays, lui, reste un choix manuel : Google n'en
transmet pas de fiable — son seul champ approchant, la `locale` du compte,
n'est qu'une préférence de langue d'interface, pas un pays de résidence.
Ces champs ne s'affichent pas aux autres joueurs ; ils ne servent qu'à la
console.

Le **statut en ligne** se lit sur une trace horodatée (`last_seen_at`), écrite à
chaque ouverture du jeu : en ligne signifie « vu il y a moins de cinq minutes ».
Une présence en direct supposerait une connexion ouverte, qu'une console
consultée de loin n'a pas.

Les **tours joués** sont comptés au règlement de chaque champ, qui sait combien
de tours il a duré — plutôt qu'une écriture à chaque fin de tour.

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
11. Se désigner administrateur par la requête ci-dessus, ouvrir `/admin`,
    envoyer des jetons à un compte d'essai et vérifier la trace au journal ;
    suspendre ce compte et constater qu'il ne peut plus créer de table ; créer
    un lot de messages et le retrouver en boutique.
12. Jouer un champ en ligne et vérifier, en fin de partie, la variation de cote
    affichée sous le score — puis le grade mis à jour dans le salon et sur le
    profil. L'adversaire doit voir la variation opposée.
