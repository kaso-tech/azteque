import { cn } from "@/lib/utils";

/**
 * Barre supérieure de la console d'administration.
 *
 * Trois blocs : marque, état du service, identité de l'administrateur.
 * L'avatar et le nom de l'administrateur sont des chaînes passées par le
 * parent — la console ne lit pas la session elle-même, elle reçoit ce que la
 * page admin a déjà résolu.
 */
export function Topbar({
  onlineCount,
  pendingReports,
  adminInitial,
  adminName,
}: {
  onlineCount: number;
  pendingReports: number;
  adminInitial: string;
  adminName: string;
}) {
  return (
    <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-border bg-card/85 px-4 py-3 backdrop-blur">
      <div className="flex items-center gap-2">
        <div className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-primary to-primary/60 font-display text-sm font-bold text-primary-foreground">
          A
        </div>
        <div className="leading-tight">
          <p className="font-display text-sm gold-text">Aztèque</p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Console
          </p>
        </div>
      </div>
      <div className="flex-1" />
      <span
        className={cn(
          "hidden items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold sm:inline-flex",
          "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
        )}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]" />
        {onlineCount} en ligne
      </span>
      <button
        type="button"
        className="relative grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
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
