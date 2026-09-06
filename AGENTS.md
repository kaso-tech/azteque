<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

## Variables d'environnement

Le fichier `.env` est **versionné volontairement** : Lovable reconstruit
l'application depuis le dépôt et inline les variables `VITE_*` dans le bundle
client au moment du build. Il n'a pas d'autre source pour ces valeurs.

Ne pas le retirer du suivi Git : cela casse la création et la connexion aux
parties en ligne, avec l'erreur « Missing Supabase environment variable(s):
SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY. Connect Supabase in Lovable Cloud. »

Il ne doit contenir que des valeurs de niveau « publishable », de toute façon
exposées dans le JavaScript servi au navigateur. La clé de service
(`SUPABASE_SERVICE_ROLE_KEY`) se configure dans les secrets du déploiement et
ne doit jamais y figurer. Voir `.env.example`.
