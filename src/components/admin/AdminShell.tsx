import type { ReactNode } from "react";
import {
  Sidebar,
  type SidebarItem,
  type SidebarSection,
} from "@/components/admin/Sidebar";
import { Topbar } from "@/components/admin/Topbar";

/**
 * Coquille de la console d'administration.
 *
 * Sidebar à gauche, topbar en haut, zone de contenu à droite. Le shell porte
 * toute la navigation et la chrome — les écrans enfants ne rendent que leur
 * propre corps, sans rien savoir de la disposition.
 *
 * PR1 : la navigation est gérée par un onglet interne (chaque onglet reste
 * sur l'URL `/admin`). PR2 introduira les sous-routes TanStack quand les
 * écrans "Dashboard", "Signalements" et "Réglages" auront du contenu.
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
  const sections: SidebarSection[] = [
    {
      title: "Pilotage",
      items: [
        { id: "dashboard", label: "Vue d'ensemble", icon: "📊" },
        {
          id: "players",
          label: "Joueurs",
          icon: "👥",
          count: stats?.players,
        },
        {
          id: "matches",
          label: "Parties",
          icon: "♟️",
          count: stats?.matches,
        },
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
      />
      <div className="flex flex-1">
        <Sidebar
          sections={sections}
          activeId={activeTab}
          onSelect={(id) => onSelectTab(id as AdminTabId)}
        />
        <main className="flex-1 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
