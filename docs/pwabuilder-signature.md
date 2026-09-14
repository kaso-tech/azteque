# Régénérer l'application Android depuis PWABuilder sans casser la signature

Aztèque est publié sur Android sous la forme d'une **TWA** (_Trusted Web
Activity_) : une coquille Android qui ouvre le site en plein écran, sans barre
d'adresse. Le plein écran n'est accordé que si Android vérifie que la coquille
et le site appartiennent bien au même éditeur. Cette vérification s'appelle
**Digital Asset Links**, et elle repose sur deux valeurs qui doivent
correspondre exactement :

| Où                                   | Quoi                       | Valeur actuelle    |
| ------------------------------------ | -------------------------- | ------------------ |
| `public/.well-known/assetlinks.json` | `package_name`             | `live.azteque.twa` |
| `public/.well-known/assetlinks.json` | `sha256_cert_fingerprints` | `90:97:…:E4:51`    |
| Le paquet Android                    | son identifiant            | doit valoir le 1er |
| Le certificat qui signe le paquet    | son empreinte SHA-256      | doit valoir le 2nd |

Si l'une des deux diverge, l'application s'ouvre malgré tout — mais avec la
barre d'adresse du navigateur en haut de l'écran. C'est le symptôme classique
d'une TWA regénérée avec une nouvelle clé.

## La question préalable : quelle clé signe réellement l'application ?

Tout dépend de l'activation de **Play App Signing** (signature d'application
par Play) sur la fiche Play Console. Les deux cas ne demandent pas le même
travail, et il faut trancher avant de toucher à PWABuilder.

Ouvrir la Play Console → **Test et publication** → **Configuration** →
**Intégrité de l'application** → onglet **Signature d'application**.

### Cas A — Play App Signing est activé (le cas courant, et le plus confortable)

Google détient la **clé de signature d'application** et resigne chaque version
avec elle. C'est donc son empreinte, et non celle de votre keystore, qui doit
figurer dans `assetlinks.json`. La page affiche deux empreintes :

- **Certificat de clé de signature d'application** → c'est celle-ci qui doit
  être dans `assetlinks.json`. Elle ne change jamais.
- **Certificat de clé d'importation** → celle du keystore avec lequel VOUS
  signez avant d'envoyer.

Conséquence : **la clé que PWABuilder utilise n'a aucune incidence sur
`assetlinks.json`**. Elle doit seulement être la clé d'importation que Play
attend, sinon l'envoi est refusé (« Vous avez importé un APK signé avec un
certificat incorrect »).

Vous n'avez donc rien à modifier côté site. Il faut simplement resigner avec le
keystore d'importation d'origine — ou, si vous l'avez perdu, demander une
**réinitialisation de la clé d'importation** dans la Play Console. La clé de
signature d'application reste la même, `assetlinks.json` reste valable, et
aucun joueur n'a à réinstaller.

### Cas B — Play App Signing n'est pas activé

L'APK est distribué tel que vous le signez. L'empreinte de
`assetlinks.json` est alors celle de votre keystore, et **ce keystore précis
est irremplaçable** : sans lui, impossible de publier une mise à jour de
`live.azteque.twa`, sur Play comme hors Play. Android refuse toute mise à jour
signée par une autre clé.

Si le keystore est perdu dans ce cas, il n'y a pas de procédure de secours :
il faut publier sous un nouvel identifiant de paquet, ajouter la nouvelle
empreinte dans `assetlinks.json`, et les joueurs doivent réinstaller.

## La procédure

1. **Vérifier l'empreinte du keystore que vous vous apprêtez à employer**, avant
   tout le reste :

   ```sh
   keytool -list -v -keystore azteque.jks -alias <votre-alias>
   ```

   Relever la ligne `SHA256:`. En cas A, elle doit égaler le **certificat de
   clé d'importation** de la Play Console. En cas B, elle doit égaler
   l'empreinte inscrite dans `public/.well-known/assetlinks.json`.

2. **Sur pwabuilder.com**, saisir l'adresse du site, puis `Package for stores` →
   `Android` → `Generate package`. Ne pas accepter les valeurs par défaut :
   ouvrir les **options avancées** et régler trois choses.

   - **Package ID** : `live.azteque.twa`, à la lettre près. C'est l'identité de
     l'application pour Android ; la moindre différence en fait une application
     distincte, qui ne peut pas mettre à jour celle des joueurs.
   - **App version / version code** : le `versionCode` doit être strictement
     supérieur à celui de la dernière version publiée, sinon Play refuse
     l'envoi.
   - **Signing key** : choisir **`Use mine`** et téléverser le keystore, avec
     son alias, le mot de passe du keystore et celui de la clé.

   Le choix par défaut est `Create new` : il fabrique une clé neuve et c'est
   précisément ce qu'il ne faut pas ici. Le choix `None` produit un paquet non
   signé, à signer soi-même ensuite avec `apksigner` — acceptable, mais cela
   revient au même travail.

3. **Contrôler le paquet reçu avant de l'envoyer.** L'archive téléchargée
   contient l'AAB, l'APK de test et un `assetlinks.json` que PWABuilder a
   généré pour la clé employée. Comparer ce fichier à celui du site : s'ils
   diffèrent (cas B), c'est que la signature n'est pas celle attendue — ne pas
   publier, reprendre à l'étape 1.

   Sur l'APK directement :

   ```sh
   apksigner verify --print-certs app-release-signed.apk
   ```

   Le `Signer #1 certificate SHA-256 digest` doit correspondre à ce qui a été
   relevé à l'étape 1. Attention au format : `apksigner` et `keytool` affichent
   l'empreinte sans séparateurs, alors que `assetlinks.json` l'écrit en
   hexadécimal séparé par des deux-points, en majuscules.

4. **Tester la vérification avant publication**, en installant l'APK de test sur
   un appareil : si l'application s'ouvre sans barre d'adresse, Digital Asset
   Links est bon. Pour diagnostiquer à distance, l'outil officiel lit le fichier
   publié :

   <https://developers.google.com/digital-asset-links/tools/generator>

   Le fichier doit être servi sur `https://<domaine>/.well-known/assetlinks.json`
   avec le type `application/json`, sans redirection.

## Ce qu'il ne faut pas faire

- **Ne pas laisser PWABuilder créer une clé** en se disant qu'on corrigera
  `assetlinks.json` après coup. En cas A, le paquet sera simplement refusé par
  Play. En cas B, cela publie une application que les installations existantes
  ne peuvent pas mettre à jour.
- **Ne pas modifier le `package_name`** de `assetlinks.json` : il désigne
  l'application déjà installée chez les joueurs.
- **Ne pas committer le keystore ni ses mots de passe** dans ce dépôt. Ils vont
  dans un gestionnaire de secrets, avec une sauvegarde hors ligne — en cas B,
  leur perte est définitive.

## Une alternative plus reproductible : Bubblewrap

PWABuilder est une interface web au-dessus de
[Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap), l'outil officiel.
L'employer directement évite de reparamétrer une page web à chaque version, car
tous les réglages tiennent dans un `twa-manifest.json` versionnable :

```sh
npx @bubblewrap/cli init --manifest=https://<domaine>/manifest.webmanifest
npx @bubblewrap/cli build --signingKeyPath=azteque.jks --signingKeyAlias=<alias>
```

L'identifiant de paquet, le `versionCode` et le chemin du keystore sont alors
inscrits une fois pour toutes dans `twa-manifest.json`, et la commande `build`
redonne exactement le même paquet à chaque appel. C'est la voie à préférer si
une nouvelle version doit sortir régulièrement.
