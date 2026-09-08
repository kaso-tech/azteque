import { useState, type ReactNode } from "react";
import {
  MobileNav,
  Sidebar,
  Topbar,
  type SidebarSection,
} from "@/components/admin";

/**
 * Coquille de la console d'administration.
 *
 * Trois couches :
 * - Topbar sticky en haut
 * - Sur desktop : sidebar dans le flux à gauche
 * - Sur mobile : la sidebar est cachée, remplacée par un bouton
 *   hamburger dans la topbar qui ouvre `MobileNav` (Sheet shadcn)
 *
 * Le shell porte toute la navigation et la chrome — les écrans enfants
 * ne rendent que leur propre corps.
 */
export type AdminTabId =
  | "dashboard"
  | "players"
  | "matches"
  | "shop"
  | "sounds"
  | "reports"
  | "log"
  | "settings";

export function AdminShell({
  activeTab,
  onSelectTab,
  onlineCount,
  pendingReports,
  adminInitial,
  adminName,
  stats,
  children,
}: {
  activeTab: AdminTabId;
  onSelectTab: (id: AdminTabId) => void;
  onlineCount: number;
  pendingReports: number;
  adminInitial: string;
  adminName: string;
  stats?:
    | {
        players?: number | undefined;
        matches?: number | undefined;
        items?: number | undefined;
        logs?: number | undefined;
      }
    | null;
  children: ReactNode;
}) {
  // La nav mobile est un tiroir : on gère son état ici pour qu'il
  // survive aux changements d'onglet.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const sections: SidebarSection[] = [
    {
      title: "Pilotage",
      items: [
        { id: "dashboard", label: "Vue d'ensemble", icon: "📊" },
        { id: "players", label: "Joueurs", icon: "👥", count: stats?.players },
        { id: "matches", label: "Parties", icon: "♟️", count: stats?.matches },
      ],
    },
    {
      title: "Catalogue",
      items: [
        { id: "shop", label: "Boutique", icon: "🛍️", count: stats?.items },
        { id: "sounds", label: "Sons", icon: "🔊" },
      ],
    },
    {
      title: "Modération",
      items: [
        {
          id: "reports",
          label: "Signalements",
          icon: "🚩",
          count: pendingReports,
          tone: pendingReports > 0 ? "danger" : "default",
        },
        { id: "log", label: "Journal d'audit", icon: "📜" },
      ],
    },
    {
      title: "Système",
      items: [{ id: "settings", label: "Réglages", icon: "⚙️" }],
    },
  ];

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <Topbar
        onlineCount={onlineCount}
        pendingReports={pendingReports}
        adminInitial={adminInitial}
        adminName={adminName}
        onOpenMobileNav={() => setMobileNavOpen(true)}
      />
      <div className="flex flex-1">
        <Sidebar
          sections={sections}
          activeId={activeTab}
          onSelect={(id) => onSelectTab(id as AdminTabId)}
        />
        <MobileNav
          sections={sections}
          activeId={activeTab}
          onSelect={(id) => onSelectTab(id as AdminTabId)}
          open={mobileNavOpen}
          onOpenChange={setMobileNavOpen}
        />
        <main className="flex-1 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
