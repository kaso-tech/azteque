import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

/**
 * Élément de la navigation latérale de la console.
 *
 * En PR1, la navigation est interne à la page `/admin` (un onglet, pas une
 * route TanStack) : un clic change l'onglet actif et garde l'URL à `/admin`.
 * Les sous-routes arriveront en PR2, quand les écrans auront du contenu.
 */
export type SidebarItem = {
  id: string;
  label: string;
  icon: string;
  count?: number | undefined;
  tone?: ("default" | "danger") | undefined;
};

export type SidebarSection = {
  title: string;
  items: SidebarItem[];
};

export function Sidebar({
  sections,
  activeId,
  onSelect,
}: {
  sections: SidebarSection[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <aside className="hidden w-56 shrink-0 border-r border-border bg-sidebar md:flex md:flex-col">
      <div className="flex items-center gap-2 px-4 pb-4 pt-5">
        <Link
          to="/"
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          ← Menu
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 pb-4">
        {sections.map((section) => (
          <div key={section.title} className="flex flex-col gap-1">
            <p className="px-3 pb-1 pt-3 font-display text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70">
              {section.title}
            </p>
            {section.items.map((item) => {
              const isActive = item.id === activeId;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className={cn(
                    "relative flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
                  )}
                >
                  {isActive && (
                    <span
                      aria-hidden
                      className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-primary"
                    />
                  )}
                  <span aria-hidden className="text-base leading-none">
                    {item.icon}
                  </span>
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.count !== undefined && (
                    <span
                      className={cn(
                        "rounded-full bg-background px-1.5 py-0.5 text-[10px]",
                        item.tone === "danger"
                          ? "text-destructive"
                          : "text-muted-foreground",
                      )}
                    >
                      {item.count.toLocaleString("fr")}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
