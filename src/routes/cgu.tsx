import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/cgu")({
  head: () => ({
    meta: [
      { title: "Conditions d'utilisation — Aztèque" },
      {
        name: "description",
        content:
          "Conditions générales d'utilisation du jeu Aztèque : règles, jetons virtuels, comportement, modération, responsabilité.",
      },
      { name: "robots", content: "index,follow" },
    ],
  }),
  component: CguPage,
});

function CguPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-8 text-foreground sm:px-6 sm:py-10">
      <Link
        to="/"
        className="mb-6 inline-block text-xs text-muted-foreground underline-offset-2 hover:underline"
      >
        ← Retour à l'accueil
      </Link>

      <h1 className="gold-text font-display text-3xl font-bold sm:text-4xl">
        Conditions générales d'utilisation
      </h1>
      <p className="mt-2 text-xs uppercase tracking-wider text-muted-foreground">
        Dernière mise à jour : 14 septembre 2026
      </p>

      <section className="prose prose-invert mt-8 max-w-none space-y-6 text-sm leading-relaxed text-foreground/90">
        <Article title="1. Présentation du service">
          <p>
            Aztèque est un jeu de cartes en ligne gratuit (avec achats facultatifs en
            boutique) opposant deux joueurs dans des parties classées. Le service est
            édité à titre personnel et proposé tel quel, sans garantie de disponibilité
            permanente.
          </p>
        </Article>

        <Article title="2. Acceptation des conditions">
          <p>
            L'utilisation du jeu vaut acceptation pleine et entière des présentes conditions.
            Si vous refusez l'une quelconque de ces conditions, vous ne devez pas utiliser
            le service. Les utilisateurs mineurs doivent obtenir l'accord d'un parent ou
            tuteur avant toute inscription.
          </p>
        </Article>

        <Article title="3. Compte utilisateur">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Le compte est créé via Google OAuth. Aucune mot de passe n'est stocké sur nos
              serveurs : tout passe par Google.
            </li>
            <li>
              Vous choisissez un pseudonyme (3 à 20 caractères, lettres/chiffres/tirets).
              Ce pseudonyme est public et visible par les autres joueurs.
            </li>
            <li>
              Vous choisissez librement votre pays d'origine parmi une liste proposée.
              Cette information sert au classement et aux statistiques ; elle n'est pas
              vérifiée.
            </li>
            <li>
              Vous pouvez supprimer votre compte à tout moment depuis votre profil. La
              suppression est définitive : vos jetons, votre classement, vos achats et
              votre historique de parties sont effacés.
            </li>
          </ul>
        </Article>

        <Article title="4. Règles de jeu et de comportement">
          <p>Tout joueur s'engage à :</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Respecter les autres joueurs — pas d'insultes, pas de harcèlement.</li>
            <li>
              Ne pas utiliser de bot, de script automatisé, ou tout moyen de jouer à la
              place d'un humain.
            </li>
            <li>
              Ne pas exploiter de faille technique pour gagner des parties ou des jetons
              de manière frauduleuse.
            </li>
            <li>
              Ne pas tenter de nuire au service (déni de service, injection, accès non
              autorisé).
            </li>
          </ul>
          <p>
            Toute infraction peut entraîner la suspension ou la suppression du compte,
            sans préavis ni remboursement des jetons. Les décisions de modération sont
            prises à la seule discrétion de l'éditeur.
          </p>
        </Article>

        <Article title="5. Jetons virtuels et boutique">
          <p>
            Les jetons d'Aztèque sont des <strong>jetons virtuels sans valeur monétaire
            réelle</strong>. Ils :
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>ne sont pas remboursables en argent ;</li>
            <li>ne sont pas transférables entre comptes hors du jeu ;</li>
            <li>
              ne peuvent pas être vendus, échangés ou utilisés en dehors de la plateforme
              Aztèque ;
            </li>
            <li>
              n'ouvrent aucun droit à un gain ou à une contrepartie réelle.
            </li>
          </ul>
          <p>
            Les articles de la boutique (avatars, stickers, tapis, sons) sont des contenus
            numériques à valoir décoratif : aucun d'eux n'influe sur les chances de gagner
            une partie. Tous les articles sont achetés facultativement, en plus des jetons
            déjà acquis en jeu.
          </p>
          <p>
            L'éditeur se réserve le droit de modifier à tout moment le barème des
            récompenses, les prix des articles et la liste des articles, dans un sens qui
            ne porte pas atteinte aux achats déjà effectués.
          </p>
        </Article>

        <Article title="6. Parrainage et bonus">
          <p>
            Chaque joueur dispose d'un code de parrainage unique. Les bonus versés au
            parrain et au filleul le sont en jetons virtuels, selon les barèmes affichés
            dans l'interface. L'éditeur peut suspendre le programme à tout moment ; les
            bonus déjà versés ne sont pas repris.
          </p>
        </Article>

        <Article title="7. Modération et signalements">
          <p>
            Les joueurs peuvent signaler un comportement fautif via le bouton
            « Signaler » disponible pendant une partie. Chaque signalement est examiné par
            un administrateur. Les sanctions éventuelles sont prises sans notification
            préalable au joueur sanctionné.
          </p>
        </Article>

        <Article title="8. Propriété intellectuelle">
          <p>
            L'ensemble du contenu du jeu — code, dessins, illustrations, noms, sons — est
            protégé par le droit d'auteur et appartient à l'éditeur. Toute reproduction
            sans autorisation est interdite.
          </p>
          <p>
            Les pseudonymes, messages et stickers envoyés par les utilisateurs restent la
            propriété de leurs auteurs ; l'éditeur dispose d'une licence d'affichage
            limitée à l'usage du service.
          </p>
        </Article>

        <Article title="9. Limitation de responsabilité">
          <p>
            Le service est fourni « en l'état ». L'éditeur ne garantit pas que le jeu sera
            exempt d'erreurs, de bugs, d'interruptions ou de pertes de données. La
            responsabilité de l'éditeur est limitée, dans toute la mesure permise par la
            loi, au montant des jetons versés au joueur au cours des douze mois précédents.
          </p>
        </Article>

        <Article title="10. Modification des conditions">
          <p>
            L'éditeur peut modifier les présentes conditions à tout moment. Les
            utilisateurs sont invités à les consulter régulièrement. La poursuite de
            l'utilisation après modification vaut acceptation.
          </p>
        </Article>

        <Article title="11. Droit applicable et juridiction">
          <p>
            Les présentes conditions sont régies par le droit français. Tout litige sera
            soumis à la compétence exclusive des tribunaux français.
          </p>
        </Article>

        <Article title="12. Contact">
          <p>
            Pour toute question relative aux présentes conditions, contactez l'éditeur à
            l'adresse suivante :{" "}
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
          to="/confidentialite"
          className="text-gold underline-offset-2 hover:underline"
        >
          Politique de confidentialité
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
