import { cn } from "@/lib/utils";

/**
 * Barre supérieure de la console d'administration.
 *
 * Trois blocs : marque + bouton menu (mobile), état du service, identité
 * de l'administrateur. Le bouton menu ouvre la navigation latérale en
 * tiroir sur mobile (caché sur desktop où la sidebar est visible).
 */
export function Topbar({
  onlineCount,
  pendingReports,
  adminInitial,
  adminName,
  onOpenMobileNav,
  onOpenNotifications,
}: {
  onlineCount: number;
  pendingReports: number;
  adminInitial: string;
  adminName: string;
  /** Appelé au clic sur le bouton hamburger (mobile uniquement). */
  onOpenMobileNav?: () => void;
  /** Appelé au clic sur la cloche de notifications. */
  onOpenNotifications?: () => void;
}) {
  return (
    <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-border bg-card/85 px-4 py-3 backdrop-blur">
      {/* Bouton menu : visible uniquement sur mobile. Sur desktop, la
          sidebar est dans le flux, donc pas besoin de bouton. */}
      {onOpenMobileNav && (
        <button
          type="button"
          onClick={onOpenMobileNav}
          className="grid h-9 w-9 place-items-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground md:hidden"
          aria-label="Ouvrir le menu"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
            aria-hidden
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      )}

      <div className="flex items-center gap-2">
        <div className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-primary to-primary/60 font-display text-sm font-bold text-primary-foreground">
          A
        </div>
        <div className="leading-tight">
          <p className="font-display text-sm gold-text">Aztèque</p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Console</p>
        </div>
      </div>
      <div className="flex-1" />
      <span
        className={cn(
          "hidden items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold sm:inline-flex",
          "border-success/45 bg-success/10 text-success",
        )}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-success shadow-[0_0_7px_color-mix(in_oklab,var(--success)_70%,transparent)]" />
        {onlineCount} en ligne
      </span>
      {/*
        Bouton notifications : on garde un `<button>` (cliquable
        partout) plutôt qu'un `<a>`. Le `onClick` ouvre le tiroir
        "À traiter" sur la page d'accueil (Dashboard) si parent le
        fournit, sans quoi l'icône reste cliquable mais sans handler —
        l'agent décide du routage interne dans une PR future.
      */}
      <button
        type="button"
        onClick={onOpenNotifications}
        className="relative grid h-8 w-8 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
        aria-label="Notifications"
      >
        🔔
        {pendingReports > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid min-h-[16px] min-w-[16px] place-items-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
            {pendingReports}
          </span>
        )}
      </button>
      <div className="flex items-center gap-2">
        <div className="grid h-7 w-7 place-items-center rounded-full border-2 border-primary/40 bg-gradient-to-br from-felt to-card font-semibold text-foreground">
          {adminInitial}
        </div>
        <span className="hidden text-sm text-foreground sm:inline">{adminName}</span>
      </div>
    </header>
  );
}
