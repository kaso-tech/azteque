import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/confidentialite")({
  head: () => ({
    meta: [
      { title: "Politique de confidentialité — Aztèque" },
      {
        name: "description",
        content:
          "Comment Aztèque collecte, utilise et protège vos données personnelles (RGPD, Google OAuth, Supabase).",
      },
      { name: "robots", content: "index,follow" },
    ],
  }),
  component: ConfidentialitePage,
});

function ConfidentialitePage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-8 text-foreground sm:px-6 sm:py-10">
      <Link
        to="/"
        className="mb-6 inline-block text-xs text-muted-foreground underline-offset-2 hover:underline"
      >
        ← Retour à l'accueil
      </Link>

      <h1 className="gold-text font-display text-3xl font-bold sm:text-4xl">
        Politique de confidentialité
      </h1>
      <p className="mt-2 text-xs uppercase tracking-wider text-muted-foreground">
        Dernière mise à jour : 14 septembre 2026
      </p>

      <section className="prose prose-invert mt-8 max-w-none space-y-6 text-sm leading-relaxed text-foreground/90">
        <Article title="1. Préambule">
          <p>
            Aztèque s'engage à protéger la vie privée de ses utilisateurs. La présente
            politique détaille les données collectées, leur finalité, leur durée de
            conservation et les droits dont vous disposez, conformément au Règlement
            général sur la protection des données (RGPD — UE 2016/679).
          </p>
        </Article>

        <Article title="2. Responsable du traitement">
          <p>
            Le responsable du traitement est l'éditeur d'Aztèque, joignable à :{" "}
            <a
              href="mailto:contact@azteque.app"
              className="text-gold underline-offset-2 hover:underline"
            >
              contact@azteque.app
            </a>
            .
          </p>
        </Article>

        <Article title="3. Données collectées">
          <p>Lors de la création et de l'utilisation du compte, nous collectons :</p>
          <h3 className="mt-3 text-base font-semibold text-foreground">
            Données d'identification (fournies par Google OAuth)
          </h3>
          <ul className="list-disc space-y-1 pl-5">
            <li>Adresse e-mail</li>
            <li>Prénom et nom (si fournis par votre compte Google)</li>
            <li>Photo de profil (si fournie par votre compte Google)</li>
            <li>Identifiant Google unique</li>
          </ul>

          <h3 className="mt-3 text-base font-semibold text-foreground">
            Données de profil (que vous saisissez vous-même)
          </h3>
          <ul className="list-disc space-y-1 pl-5">
            <li>Pseudonyme (public)</li>
            <li>Pays (code ISO à 2 lettres, choix dans une liste proposée)</li>
          </ul>

          <h3 className="mt-3 text-base font-semibold text-foreground">
            Données de jeu (générées par votre utilisation)
          </h3>
          <ul className="list-disc space-y-1 pl-5">
            <li>Solde de jetons virtuels (sans valeur monétaire)</li>
            <li>Cote (rating) et cote maximale atteinte</li>
            <li>Nombre de parties classées jouées</li>
            <li>Historique des parties (date, score, adversaire)</li>
            <li>Achats en boutique (articles et date)</li>
            <li>Liste d'amis et demandes envoyées</li>
            <li>Signalements émis ou reçus</li>
          </ul>

          <h3 className="mt-3 text-base font-semibold text-foreground">
            Données techniques
          </h3>
          <ul className="list-disc space-y-1 pl-5">
            <li>Adresse IP (visible par notre prestataire Supabase)</li>
            <li>Identifiant de session et jeton d'authentification Supabase</li>
            <li>
              Préférences locales stockées dans votre navigateur (tri des amis, choix des
              sons/stickers masqués)
            </li>
          </ul>
        </Article>

        <Article title="4. Finalités et bases légales">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-2 pr-3 font-semibold">Donnée</th>
                <th className="py-2 pr-3 font-semibold">Finalité</th>
                <th className="py-2 font-semibold">Base légale</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              <tr>
                <td className="py-2 pr-3">Email, identifiant Google</td>
                <td className="py-2 pr-3">Authentification et récupération de compte</td>
                <td className="py-2">Exécution du contrat</td>
              </tr>
              <tr>
                <td className="py-2 pr-3">Pseudonyme, pays</td>
                <td className="py-2 pr-3">Affichage aux autres joueurs, statistiques</td>
                <td className="py-2">Exécution du contrat</td>
              </tr>
              <tr>
                <td className="py-2 pr-3">Historique de parties, cote</td>
                <td className="py-2 pr-3">Classement, anti-triche, statistiques</td>
                <td className="py-2">Intérêt légitime</td>
              </tr>
              <tr>
                <td className="py-2 pr-3">Solde de jetons, achats</td>
                <td className="py-2 pr-3">Fonctionnement du jeu et de la boutique</td>
                <td className="py-2">Exécution du contrat</td>
              </tr>
              <tr>
                <td className="py-2 pr-3">Photo Google</td>
                <td className="py-2 pr-3">Affichage aux autres joueurs (optionnel)</td>
                <td className="py-2">Consentement (acceptation par Google OAuth)</td>
              </tr>
            </tbody>
          </table>
        </Article>

        <Article title="5. Sous-traitants et transferts de données">
          <p>Les données sont hébergées par :</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Supabase Inc.</strong> — hébergeur de la base de données
              (PostgreSQL) et de l'authentification.{" "}
              <a
                href="https://supabase.com/legal/privacy"
                target="_blank"
                rel="noreferrer"
                className="text-gold underline-offset-2 hover:underline"
              >
                Politique de confidentialité de Supabase
              </a>
              .
            </li>
            <li>
              <strong>Google LLC</strong> — fournisseur d'authentification OAuth.{" "}
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noreferrer"
                className="text-gold underline-offset-2 hover:underline"
              >
                Politique de confidentialité de Google
              </a>
              .
            </li>
            <li>
              <strong>Lovable Inc.</strong> — courtier OAuth qui orchestre la
              redirection vers Google puis vers notre application.{" "}
              <a
                href="https://lovable.dev/privacy"
                target="_blank"
                rel="noreferrer"
                className="text-gold underline-offset-2 hover:underline"
              >
                Politique de confidentialité de Lovable
              </a>
              .
            </li>
          </ul>
          <p>
            Supabase peut stocker les données sur des serveurs situés hors de l'Union
            européenne (notamment aux États-Unis). Ces transferts sont encadrés par les
            clauses contractuelles types de la Commission européenne ou par les
            décisions d'adéquation en vigueur.
          </p>
        </Article>

        <Article title="6. Durée de conservation">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Compte actif</strong> : les données sont conservées tant que le
              compte existe.
            </li>
            <li>
              <strong>Compte supprimé</strong> : les données personnelles sont effacées
              sous 30 jours. Certaines données peuvent être conservées plus longtemps
              pour des raisons légales (registre des achats, obligations comptables).
            </li>
            <li>
              <strong>Cookies et jetons de session</strong> : expirent à la fin de la
              session ou après 30 jours d'inactivité, selon le paramétrage de votre
              navigateur.
            </li>
          </ul>
        </Article>

        <Article title="7. Vos droits (RGPD)">
          <p>Vous disposez des droits suivants, que vous pouvez exercer à tout moment :</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Droit d'accès</strong> : obtenir une copie de vos données
              personnelles.
            </li>
            <li>
              <strong>Droit de rectification</strong> : corriger des données inexactes ou
              incomplètes (via votre profil).
            </li>
            <li>
              <strong>Droit à l'effacement</strong> : demander la suppression de votre
              compte et de vos données (depuis votre profil, ou par e-mail).
            </li>
            <li>
              <strong>Droit à la limitation</strong> : suspendre temporairement le
              traitement de vos données.
            </li>
            <li>
              <strong>Droit à la portabilité</strong> : recevoir vos données dans un
              format structuré et lisible par machine (à demander par e-mail).
            </li>
            <li>
              <strong>Droit d'opposition</strong> : vous opposer à un traitement fondé
              sur l'intérêt légitime (par e-mail).
            </li>
          </ul>
          <p>
            Pour exercer ces droits :{" "}
            <a
              href="mailto:contact@azteque.app"
              className="text-gold underline-offset-2 hover:underline"
            >
              contact@azteque.app
            </a>
            . Une réponse vous sera apportée dans un délai d'un mois. En cas de
            réclamation, vous pouvez saisir la CNIL (France) ou l'autorité de contrôle
            de votre lieu de résidence habituel.
          </p>
        </Article>

        <Article title="8. Cookies">
          <p>
            Aztèque n'utilise pas de cookies de mesure d'audience ni de cookies
            publicitaires. Les seuls cookies et stockages locaux utilisés sont :
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>localStorage</strong> : préférences d'interface (tri de la liste
              d'amis, sons et stickers masqués), invitations de parties, jetons
              d'authentification de prévisualisation.
            </li>
            <li>
              <strong>Cookies Supabase</strong> : jeton de session Auth (httpOnly,
              sécurisé).
            </li>
          </ul>
        </Article>

        <Article title="9. Sécurité">
          <p>
            Les données sont chiffrées en transit (HTTPS/TLS) et au repos dans la base
            Supabase. Les mots de passe ne sont jamais stockés : l'authentification est
            entièrement déléguée à Google OAuth. L'accès à la base de données est
            strictement limité aux fonctions serveur signées par l'éditeur ; les clients
            ne peuvent pas exécuter de SQL arbitraire.
          </p>
          <p>
            Malgré ces mesures, aucun service n'est exempt de risques. En cas de
            violation de données, vous serez informé dans les 72 heures, conformément
            à l'article 33 du RGPD.
          </p>
        </Article>

        <Article title="10. Mineurs">
          <p>
            Aztèque n'est pas destiné aux enfants de moins de 16 ans. Si nous apprenons
            qu'un mineur de moins de 16 ans a créé un compte, nous le supprimerons dans
            les meilleurs délais. Les parents ou tuteurs peuvent signaler un compte
            concerné à l'adresse de contact.
          </p>
        </Article>

        <Article title="11. Modifications de la politique">
          <p>
            La présente politique peut être modifiée à tout moment. La date de dernière
            mise à jour figure en haut du document. Les modifications substantielles
            seront notifiées aux utilisateurs par un message dans l'application ou par
            e-mail.
          </p>
        </Article>

        <Article title="12. Contact">
          <p>
            Pour toute question relative à vos données personnelles :{" "}
            <a
              href="mailto:contact@azteque.app"
              className="text-gold underline-offset-2 hover:underline"
            >
              contact@azteque.app
            </a>
            .
          </p>
        </Article>
      </section>

      <p className="mt-10 text-center text-xs text-muted-foreground">
        Voir aussi :{" "}
        <Link
          to="/cgu"
          className="text-gold underline-offset-2 hover:underline"
        >
          Conditions d'utilisation
        </Link>
      </p>
    </main>
  );
}

function Article({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article>
      <h2 className="gold-text font-display text-lg font-semibold">{title}</h2>
      <div className="mt-2 space-y-2">{children}</div>
    </article>
  );
}
