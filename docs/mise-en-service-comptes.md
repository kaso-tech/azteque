# Mise en service des comptes joueurs

Le code des comptes (connexion Google, pseudo unique, amis, invitations,
jetons conservés, historique des confrontations) est en place dans le dépôt,
mais **il ne fonctionnera pas tant que les deux étapes ci-dessous n'auront pas
été faites sur le projet Supabase**. Elles demandent un accès à la console du
projet, que l'agent n'a pas.

## 1. Appliquer la migration

Fichier : `supabase/migrations/20260906200000_accounts_friends_invites.sql`

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
> `award_ai_win`. Elle active aussi l'extension `citext` et ajoute
> `game_invites` à la publication temps réel `supabase_realtime`.
> Ensuite, régénère le fichier de types TypeScript
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
- **Le solde de jetons du navigateur est reporté une seule fois** sur le
  premier compte créé depuis ce navigateur, puis le compte fait foi.
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
