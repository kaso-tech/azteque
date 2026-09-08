import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  adminAccess,
  adminStats,
  type AdminAccess,
  type AdminStats,
} from "@/lib/azteque/admin";
import {
  AdminShell,
  Boutique,
  Dashboard,
  EmptyScreen,
  Journal,
  Joueurs,
  Parties,
  Sons,
  type AdminTabId,
} from "@/components/admin";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Administration — Aztèque" }] }),
  component: Administration,
});

/**
 * Onglets effectivement affichés par la console.
 *
 * Les onglets « Dashboard », « Joueurs », « Parties » et « Boutique » sont
 * en service. Les onglets « Signalements » et « Réglages » existent dans
 * la navigation, mais ne montrent qu'un écran vide tant que leur contenu
 * n'est pas livré.
 */
const ONGLETS_DISPONIBLES: AdminTabId[] = [
  "dashboard",
  "players",
  "matches",
  "shop",
  "sounds",
  "log",
];

function Administration() {
  const [acces, setAcces] = useState<AdminAccess | null>(null);
  const [onglet, setOnglet] = useState<AdminTabId>("dashboard");
  const [erreur, setErreur] = useState<string | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const setTab = useCallback((id: AdminTabId) => {
    setOnglet(id);
    // On remonte en haut de la zone de contenu à chaque changement d'onglet,
    // sinon le nouvel écran apparaît coupé.
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    }
  }, []);

  useEffect(() => {
    adminAccess()
      .then((a) => {
        setAcces(a);
        if (a.state === "admin") {
          adminStats()
            .then(setStats)
            .catch(() => setStats(null));
        }
      })
      .catch(() => setAcces({ state: "anonymous" }));
  }, []);

  if (!acces) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-5xl items-center justify-center px-4 py-6">
        <p className="text-sm text-muted-foreground">Vérification…</p>
      </main>
    );
  }

  if (acces.state !== "admin") return <PorteFermee acces={acces} />;

  // Onglets vides : à montrer dans la nav (compteurs facultatifs) mais
  // sans contenu tant que leur écran n'est pas livré.
  const placeholder = !ONGLETS_DISPONIBLES.includes(onglet);

  const adminInitial = "A";
  const adminName = "Administrateur";
  const onlineCount = 0;
  const pendingReports = 0;
  const shellStats = stats
    ? {
        players: stats.players,
        matches: stats.matches,
      }
    : null;

  return (
    <AdminShell
      activeTab={onglet}
      onSelectTab={setTab}
      onlineCount={onlineCount}
      pendingReports={pendingReports}
      adminInitial={adminInitial}
      adminName={adminName}
      stats={shellStats}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6">
        {erreur && <p className="text-sm text-destructive">{erreur}</p>}
        {onglet === "dashboard" && <Dashboard onErreur={setErreur} />}
        {onglet === "players" && <Joueurs onErreur={setErreur} />}
        {onglet === "matches" && <Parties onErreur={setErreur} />}
        {onglet === "shop" && <Boutique onErreur={setErreur} />}
        {onglet === "sounds" && <Sons onErreur={setErreur} />}
        {onglet === "log" && <Journal onErreur={setErreur} />}
        {placeholder && <Placeholder onglet={onglet} />}
      </div>
    </AdminShell>
  );
}

function Placeholder({ onglet }: { onglet: AdminTabId }) {
  const textes: Record<AdminTabId, { titre: string; description: string }> = {
    dashboard: {
      titre: "Vue d'ensemble",
      description: "L'écran est servi depuis un autre onglet.",
    },
    matches: {
      titre: "Parties",
      description: "L'historique et la gestion des parties sont servis depuis l'onglet Parties.",
    },
    reports: {
      titre: "Signalements",
      description:
        "La file de modération joueurs sera livrée en même temps que la modale de décision.",
    },
    settings: {
      titre: "Réglages",
      description:
        "Les feature flags, saisons et événements seront ajoutés dans une livraison ultérieure.",
    },
    players: { titre: "Joueurs", description: "" },
    shop: { titre: "Boutique", description: "" },
    sounds: { titre: "Sons", description: "" },
    log: { titre: "Journal d'audit", description: "" },
  };
  const t = textes[onglet];
  return <EmptyScreen title={t.titre} description={t.description} />;
}

/**
 * L'écran de porte fermée.
 *
 * Il ne se contente pas de refuser : il dit laquelle des trois causes
 * s'applique et ce qu'elle demande. Un refus qui n'explique rien fait chercher
 * du côté du code ce qui se règle en une requête.
 */
function PorteFermee({ acces }: { acces: Exclude<AdminAccess, { state: "admin" }> }) {
  const [copie, setCopie] = useState(false);
  const requete =
    acces.state === "not-admin" && acces.username
      ? `UPDATE public.profiles SET is_admin = true WHERE lower(username) = '${acces.username.toLowerCase()}';`
      : "UPDATE public.profiles SET is_admin = true WHERE lower(username) = 'votre_pseudo';";

  if (acces.state === "anonymous") {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-5xl items-center justify-center px-4 py-6">
        <div className="panel mt-6 max-w-md space-y-3 px-6 py-6 text-center">
          <h2 className="font-display text-xl gold-text">Connectez-vous d'abord</h2>
          <p className="text-sm text-muted-foreground">
            La console reconnaît les administrateurs à leur compte. Sans session ouverte, elle ne
            peut rien vérifier.
          </p>
          <Link
            to="/online"
            className="inline-block rounded-full border border-gold/50 px-6 py-2 font-display text-sm font-semibold text-gold"
          >
            Se connecter
          </Link>
        </div>
      </main>
    );
  }

  if (acces.state === "missing-migration") {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-5xl items-center justify-center px-4 py-6">
        <div className="panel mt-6 max-w-xl space-y-3 px-6 py-6 text-left">
          <h2 className="text-center font-display text-xl gold-text">Migration à appliquer</h2>
          <p className="text-sm text-muted-foreground">
            La base ne connaît pas encore les fonctions d'administration : le fichier
            <span className="text-foreground">
              {" "}
              supabase/migrations/20260907160000_administration.sql{" "}
            </span>
            n'a pas été appliqué sur ce projet Supabase. Appliquez-le, puis rechargez cette page.
          </p>
          <p className="text-xs text-muted-foreground">
            Le pas suivant sera de vous désigner administrateur ; cette page vous donnera alors la
            requête à exécuter.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl items-center justify-center px-4 py-6">
      <div className="panel mt-6 max-w-xl space-y-3 px-6 py-6 text-left">
        <h2 className="text-center font-display text-xl gold-text">Il vous manque le droit</h2>
        <p className="text-sm text-muted-foreground">
          Votre compte existe bien{acces.username ? ` — ${acces.username} — ` : " "}mais il n'est
          pas administrateur. Le premier administrateur ne peut pas être nommé depuis cette console
          : il n'y en a aucun pour le faire. Exécutez ceci dans l'éditeur SQL de votre projet
          Supabase, puis rechargez :
        </p>
        <pre className="overflow-x-auto rounded-md border border-border bg-background px-3 py-2 text-[0.7rem] text-foreground">
          {requete}
        </pre>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void navigator.clipboard?.writeText(requete).then(() => {
              setCopie(true);
              setTimeout(() => setCopie(false), 2000);
            });
          }}
        >
          {copie ? "✓ Copié" : "Copier la requête"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Les administrateurs suivants se nomment depuis la console, sans SQL.
        </p>
      </div>
    </main>
  );
}
