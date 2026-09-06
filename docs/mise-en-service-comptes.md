# Mise en service des comptes joueurs

Le code des comptes (connexion Google, pseudo unique, amis, invitations,
jetons conservés, historique des confrontations) est en place dans le dépôt,
mais **il ne fonctionnera pas tant que les deux étapes ci-dessous n'auront pas
été faites sur le projet Supabase**. Elles demandent un accès à la console du
projet, que l'agent n'a pas.

## 1. Appliquer les migrations

Fichiers, dans cet ordre :

1. `supabase/migrations/20260906200000_accounts_friends_invites.sql`
2. `supabase/migrations/20260906210000_sync_offline_tokens.sql`

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
> `supabase/migrations/20260906210000_sync_offline_tokens.sql`, qui ajoute la
> colonne `local_tokens_total` à `profiles` et remplace la fonction
> `claim_local_tokens`. Enfin, régénère le fichier de types TypeScript
> `src/integrations/supabase/types.ts` pour qu'il inclue ces nouvelles tables.

## 2. Activer la connexion Google

Dans la console Supabase du projet, **Authentication → Providers → Google** :

1. Activer le fournisseur.
2. Renseigner le *Client ID* et le *Client Secret* d'un identifiant OAuth
   Google (console Google Cloud → API et services → Identifiants → ID client
   OAuth, type « Application Web »).
3. Côté Google Cloud, autoriser l'URI de redirection que Supabase affiche sur
   cette même page (de la forme `https://<projet>.supabase.co/auth/v1/callback`).
4. Dans **Authentication → URL Configuration**, ajouter aux *Redirect URLs* :
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
