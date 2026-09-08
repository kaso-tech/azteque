import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { InviteManager } from "@/components/azteque/invite-manager";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Aztèque — Jeu de cartes traditionnel à deux ou quatre joueurs" },
      {
        name: "description",
        content:
          "Jouez à Aztèque : posez vos cartes, annoncez vos comptes, créez l'atout et remportez le champ, seul contre l'IA ou en ligne face à un ami.",
      },
      { name: "author", content: "Aztèque" },
      { property: "og:title", content: "Aztèque — Jeu de cartes traditionnel" },
      {
        property: "og:description",
        content: "Le jeu de cartes ouest-africain Aztèque, jouable seul ou en ligne à deux.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      // Couleur de la barre du navigateur (Android) et du dos de l'écran de
      // lancement (iOS, avec les balises apple-* ci-dessous) : le même vert
      // que la table de jeu, pour qu'aucune bordure blanche ne trahisse le
      // passage du navigateur à l'application installée.
      { name: "theme-color", content: "#12352a" },
      // iOS ignore le fichier manifest pour l'installation : ces trois
      // balises sont ce qui le fait ouvrir Aztèque en plein écran, sans
      // barre d'adresse, une fois ajouté à l'écran d'accueil.
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Aztèque" },
      { name: "mobile-web-app-capable", content: "yes" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700&family=Outfit:wght@300;400;600&display=swap",
      },
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      { rel: "icon", href: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { rel: "icon", href: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <HeadContent />
        {/* Rend l'application installable (icône, plein écran, hors ligne
            partiel). Un script en ligne plutôt qu'un effet React : un audit
            comme celui de PWABuilder n'attend pas que le bundle s'hydrate, et
            l'enregistrement doit donc se faire dès le premier chargement de
            la page, pas après. Un échec ici — navigateur trop ancien,
            contexte non sécurisé — laisse simplement l'application
            fonctionner comme une page web ordinaire. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(function(){});}",
          }}
        />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  // Retour de la connexion Google (redirection pleine page) : établit la
  // session à partir des jetons présents dans l'adresse, le cas échéant.
  //
  // Le courtier ramène sur la racine du site, alors que le joueur venait du
  // salon en ligne : on l'y renvoie une fois la session ouverte, plutôt que de
  // le laisser sur le menu sans indication de ce qui vient de se passer.
  // Réglages du son décidés par l'administration : chargés une fois, sans
  // bloquer quoi que ce soit — à défaut, les valeurs du code font foi.
  useEffect(() => {
    void import("@/lib/azteque/admin").then((m) => m.loadSoundSettings());
  }, []);

  // Un lien de parrainage porte le code dans l'adresse. Il faut le mettre de
  // côté tout de suite : le joueur va naviguer vers le salon puis passer par
  // Google, et l'adresse n'aura pas survécu au voyage.
  useEffect(() => {
    void import("@/lib/azteque/tokens").then((m) => m.rememberReferralCode());
  }, []);

  useEffect(() => {
    void import("@/lib/azteque/account").then(async (m) => {
      const handled = await m.completeOAuthRedirect().catch(() => false);
      if (handled && window.location.pathname === "/") {
        void router.navigate({ to: "/online" });
      }
    });
  }, [router]);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      {/* Invitations à jouer et annonces de connexion : fonctionnent quel que
          soit l'écran affiché, y compris en pleine partie. */}
      <InviteManager />
      <Toaster position="top-center" />
    </QueryClientProvider>
  );
}
