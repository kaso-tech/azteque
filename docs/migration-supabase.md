# Migrer vers un projet Supabase qui vous appartient

Aztèque tourne aujourd'hui sur le projet Supabase fourni par Lovable
(`xmjavwgntcwijmrlnbjp`). Ce document décrit le passage vers un projet créé et
détenu par vous, sur supabase.com.

La bonne nouvelle tient en une phrase : **le code ne connaît aucune adresse en
dur**. Les deux clients Supabase lisent des variables d'environnement, les 75
migrations n'emploient que des rôles Supabase standards, et il n'existe ni
fonction edge, ni tâche planifiée, ni extension Postgres à recréer. L'essentiel
du travail est donc de la configuration, pas de la réécriture.

## Ce qui est attaché à la plateforme, et ce qui ne l'est pas

| Élément                                            | État                                                         |
| -------------------------------------------------- | ------------------------------------------------------------ |
| Clients Supabase (`client.ts`, `client.server.ts`) | Pilotés par variables d'environnement, rien à changer        |
| 75 migrations SQL                                  | Rejouables telles quelles sur un projet neuf                 |
| Seaux de stockage `sounds` et `shop-assets`        | Créés et protégés par les migrations                         |
| Fonctions edge, `pg_cron`, extensions              | Aucune                                                       |
| Connexion Google                                   | **Passait par le courtier Lovable** — corrigé, voir plus bas |
| `.env` et `supabase/config.toml`                   | Portent l'identifiant de l'ancien projet, à changer          |
| Données (comptes, profils, achats, parties)        | À exporter et réimporter                                     |
| Fichiers des seaux                                 | À recopier                                                   |

### Le seul verrou de code, déjà levé

La connexion Google empruntait `@lovable.dev/cloud-auth-js`, le courtier de
l'éditeur. Sur un projet qui vous appartient, c'est Supabase qui doit connecter.

`src/lib/azteque/connexion-google.ts` tranche désormais ainsi :

- **dans l'aperçu de l'éditeur, en iframe** → le courtier, car une redirection
  OAuth ordinaire ne revient pas depuis un domaine jetable en iframe ;
- **partout ailleurs** (production, application Android, poste de
  développement) → `supabase.auth.signInWithOAuth`, directement ;
- **si Supabase refuse** parce que le fournisseur Google n'est pas encore
  activé, l'ancien chemin reprend la main.

Ce repli est ce qui rend la bascule sans coupure : l'application fonctionne
pendant tout l'intervalle, y compris entre le branchement du nouveau projet et
la configuration de son fournisseur Google.

## La procédure

### 1. Créer le projet et rejouer le schéma

Créer le projet sur supabase.com, dans la région la plus proche de vos joueurs,
et noter le mot de passe de la base — il ne sera plus affiché.

Puis rejouer les migrations **dans l'ordre des noms de fichiers**, qui est
l'ordre chronologique :

```sh
supabase link --project-ref <nouveau-ref>
supabase db push
```

À défaut de la CLI, concaténer les fichiers dans l'ordre et les passer à l'éditeur
SQL du tableau de bord :

```sh
for f in supabase/migrations/*.sql; do printf '\n-- %s\n' "$f"; cat "$f"; done > /tmp/schema.sql
```

Vérifier ensuite que les onze tables sont là : `admin_log`, `app_settings`,
`friendships`, `game_invites`, `matches`, `player_reports`, `profiles`,
`purchases`, `referrals`, `shop_items`, `sound_files`, plus la vue
`public_profiles`.

### 2. Activer la connexion Google

Dans **Authentication → Providers → Google** du nouveau projet, activer le
fournisseur et y coller l'identifiant et le secret du client OAuth Google.

Puis, dans la console Google Cloud, ajouter aux **URI de redirection
autorisés** du même client :

```
https://<nouveau-ref>.supabase.co/auth/v1/callback
```

Ne pas retirer l'ancienne URI tant que la bascule n'est pas terminée : les deux
peuvent coexister, et c'est ce qui permet de revenir en arrière.

Enfin, dans **Authentication → URL Configuration**, renseigner l'adresse du
site et les adresses de redirection autorisées (domaine de production, et
`http://localhost:3000` pour le développement).

### 3. Reprendre les comptes

C'est la partie délicate : les identifiants d'utilisateur (`auth.users.id`) sont
des clés étrangères de `profiles`, `matches`, `purchases`, `friendships` et le
reste. **Ils doivent être conservés à l'identique**, sinon toutes les données
liées deviennent orphelines.

L'export de `auth.users` depuis le tableau de bord n'est pas proposé ; il faut
passer par une connexion directe à la base, avec la chaîne trouvée dans
**Project Settings → Database**, en exportant les seules données :

```sh
pg_dump "<url-ancienne-base>" \
  --data-only --no-owner --no-privileges \
  --table 'auth.users' --table 'auth.identities' \
  > /tmp/comptes.sql

psql "<url-nouvelle-base>" -f /tmp/comptes.sql
```

Puis les tables applicatives, dans cet ordre (`profiles` d'abord, les autres en
dépendent) :

```sh
pg_dump "<url-ancienne-base>" --data-only --no-owner --no-privileges \
  --table 'public.profiles' --table 'public.shop_items' \
  --table 'public.purchases' --table 'public.friendships' \
  --table 'public.referrals' --table 'public.matches' \
  --table 'public.game_invites' --table 'public.player_reports' \
  --table 'public.app_settings' --table 'public.sound_files' \
  --table 'public.admin_log' \
  > /tmp/donnees.sql

psql "<url-nouvelle-base>" -f /tmp/donnees.sql
```

Les parties terminées n'ont pas besoin d'être reprises ; si l'on veut alléger,
`matches` est la table qu'on peut sacrifier sans conséquence pour les joueurs.

### 4. Recopier les fichiers des seaux

Deux seaux portent des fichiers : `sounds` et `shop-assets`. Les migrations les
recréent vides, avec leurs policies ; leur contenu se recopie à part.

Ces fichiers sont publics en lecture : les télécharger depuis les URL publiques
de l'ancien projet et les téléverser dans le nouveau suffit. Le plus simple
reste la console d'administration de l'application, qui sait déjà téléverser un
son ou une icône.

**Attention** : `shop_items.asset_url` et `data.iconUrl` contiennent des URL
absolues qui pointent vers l'ANCIEN projet. Après recopie, les réécrire :

```sql
UPDATE public.shop_items
SET asset_url = replace(asset_url, '<ancien-ref>', '<nouveau-ref>')
WHERE asset_url LIKE '%<ancien-ref>%';

UPDATE public.shop_items
SET data = jsonb_set(
      data, '{iconUrl}',
      to_jsonb(replace(data ->> 'iconUrl', '<ancien-ref>', '<nouveau-ref>'))
    )
WHERE data ->> 'iconUrl' LIKE '%<ancien-ref>%';
```

Sans cela les icônes et les sons continueraient d'être servis par l'ancien
projet, et cesseraient de l'être le jour où il est supprimé.

### 5. Se redonner les droits d'administration

**Ce point est un piège, et il est silencieux.** Le rang d'administrateur a été
posé par une migration qui exécute :

```sql
UPDATE public.profiles SET is_admin = true WHERE username = 'Wallace';
```

Rejouée sur une base neuve, cette instruction ne trouve aucun profil — la table
est vide à ce moment-là — et **ne promeut personne**. La console
d'administration reste alors inaccessible, sans message d'erreur qui explique
pourquoi.

Après avoir repris les comptes, se connecter une fois à l'application, puis
exécuter dans l'éditeur SQL :

```sql
UPDATE public.profiles SET is_admin = true WHERE username = '<votre-pseudo>';
SELECT id, username, is_admin FROM public.profiles WHERE is_admin;
```

La seconde ligne doit renvoyer au moins un résultat. Les fonctions
d'administration refusent de retirer le dernier administrateur, donc une fois
ce rang posé, il ne peut plus être perdu par mégarde.

### 6. Changer les variables

Trois endroits, et un seul contient un secret.

**`.env`** (versionné volontairement, valeurs publiques seulement) :

```
SUPABASE_PROJECT_ID="<nouveau-ref>"
SUPABASE_URL="https://<nouveau-ref>.supabase.co"
SUPABASE_PUBLISHABLE_KEY="<clé publishable du nouveau projet>"
VITE_SUPABASE_PROJECT_ID="<nouveau-ref>"
VITE_SUPABASE_URL="https://<nouveau-ref>.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="<clé publishable du nouveau projet>"
```

**`supabase/config.toml`** : `project_id = "<nouveau-ref>"`.

**`SUPABASE_SERVICE_ROLE_KEY`** : dans les secrets du déploiement, jamais dans
le dépôt. Sans elle, créer une partie fonctionne mais jouer un coup échoue —
c'est l'arbitre serveur des parties en ligne qui s'en sert.

### 7. Vérifier avant de couper

Dans cet ordre, parce que chaque étape dépend de la précédente :

1. La page d'accueil s'affiche sans erreur Supabase en console.
2. La connexion Google aboutit et le pseudo apparaît.
3. La boutique affiche ses articles, avec leurs icônes et leurs sons.
4. Une partie en ligne se crée, et **un coup se joue** — c'est ce qui éprouve
   la clé de service.
5. La console d'administration s'ouvre.
6. Le classement et l'historique montrent les données reprises.

Ne supprimer l'ancien projet qu'une fois ces six points vérifiés, et pas le jour
même : tant qu'il existe, le retour en arrière ne coûte qu'un changement de
variables.

## Ce qui reste attaché à Lovable après la bascule

Migrer la base ne quitte pas la plateforme. Si c'est aussi le but :

- `src/integrations/supabase/*` et `src/integrations/lovable/index.ts` portent
  l'en-tête « automatically generated ». Tant que Lovable construit le projet,
  il peut les réécrire — c'est pourquoi la correction de la connexion vit dans
  `src/lib/azteque/connexion-google.ts` plutôt que dans ces fichiers.
- Les messages d'erreur de ces fichiers disent encore « Connect Supabase in
  Lovable Cloud », ce qui sera trompeur. Cosmétique, mais à corriger le jour où
  ces fichiers cessent d'être régénérés.
- `.env` n'est versionné que parce que la plateforme n'a pas d'autre source
  pour ces valeurs. Sur un hébergement ordinaire, le sortir du dépôt et passer
  par les variables du déploiement est préférable.
- La dépendance `@lovable.dev/cloud-auth-js` ne sert plus qu'au courtier
  d'aperçu : elle peut être retirée en même temps que `src/integrations/lovable/`
  le jour où l'éditeur n'est plus utilisé.
