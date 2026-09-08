import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

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

/**
 * Contenu de la navigation, sans le contenant.
 *
 * Le shell compose ce contenu soit dans une `<aside>` (desktop, flux
 * normal), soit dans un `<Sheet>` (mobile, tiroir qui s'ouvre par-dessus
 * le contenu). Une seule source de vérité pour les items.
 */
function SidebarContent({
  sections,
  activeId,
  onSelect,
  onAfterSelect,
}: {
  sections: SidebarSection[];
  activeId: string;
  onSelect: (id: string) => void;
  /** Appelé après un choix d'item, pour fermer le tiroir mobile. */
  onAfterSelect?: () => void;
}) {
  return (
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
                onClick={() => {
                  onSelect(item.id);
                  onAfterSelect?.();
                }}
                className={cn(
                  "relative flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors",
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
                      item.tone === "danger" ? "text-destructive" : "text-muted-foreground",
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
  );
}

/**
 * La sidebar desktop (toujours visible au-dessus de md).
 *
 * Sur mobile, elle est masquée : la navigation passe par le Sheet
 * `MobileNav` plus bas.
 */
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
        <Link to="/" className="text-xs text-muted-foreground underline-offset-2 hover:underline">
          ← Menu
        </Link>
      </div>
      <SidebarContent sections={sections} activeId={activeId} onSelect={onSelect} />
    </aside>
  );
}

/**
 * Tiroir mobile — Sheet shadcn qui s'ouvre depuis la gauche.
 *
 * On garde le même contenu que la sidebar desktop, et on le ferme dès
 * qu'un item est choisi : pas de mode "rester ouvert pour comparer",
 * on assume que le mobile sert à atteindre un écran, pas à explorer.
 */
export function MobileNav({
  sections,
  activeId,
  onSelect,
  open,
  onOpenChange,
}: {
  sections: SidebarSection[];
  activeId: string;
  onSelect: (id: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="flex w-72 flex-col gap-0 bg-sidebar p-0">
        <SheetHeader className="border-b border-border px-4 pb-4 pt-5">
          <SheetTitle className="font-display text-base gold-text">Aztèque · Console</SheetTitle>
          <Link
            to="/"
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => onOpenChange(false)}
          >
            ← Menu principal
          </Link>
        </SheetHeader>
        <SidebarContent
          sections={sections}
          activeId={activeId}
          onSelect={onSelect}
          onAfterSelect={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
