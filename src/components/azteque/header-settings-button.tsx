/**
 * Bouton paramètres (⚙️) du header de match.
 *
 * Ouvre un Sheet shadcn (par-dessus la table) contenant le panneau
 * `SettingsPanel` : toggles pour les sons et stickers achetés, ordre
 * personnalisé, et toggles de réception (messages texte, stickers).
 */

import { useState } from "react";
import { Settings } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { SettingsPanel } from "@/components/azteque/settings-panel";

export interface HeaderSettingsButtonProps {
  /** Articles achetés (sticker + sound). */
  owned: ReadonlySet<string>;
}

export function HeaderSettingsButton({ owned }: HeaderSettingsButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Paramètres"
          className="h-8 w-8"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="gold-text">Paramètres de la table</SheetTitle>
        </SheetHeader>
        <SettingsPanel owned={owned} onClose={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
