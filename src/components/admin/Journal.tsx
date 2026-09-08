import { useEffect, useState } from "react";
import { describeError } from "@/lib/azteque/account";
import { adminLog, type AdminLogEntry } from "@/lib/azteque/admin";

/**
 * Le journal d'audit, tel qu'il est aujourd'hui.
 *
 * PR1 ne change pas la mise en page : il sépare juste le composant du reste
 * de la console. PR3 introduira les filtres (admin, type d'action, date) et
 * le bouton « Annuler » sur les actions réversibles.
 */
export function Journal({ onErreur }: { onErreur: (e: string | null) => void }) {
  const [lignes, setLignes] = useState<AdminLogEntry[]>([]);

  useEffect(() => {
    adminLog(100)
      .then(setLignes)
      .catch((e: unknown) => onErreur(describeError(e, "Journal indisponible.")));
  }, [onErreur]);

  return (
    <section className="panel space-y-2 px-4 py-4">
      <p className="text-xs text-muted-foreground">
        Toute action d'administration laisse une trace. Une console qui distribue des jetons sans
        mémoire est une console qu'on ne peut pas auditer.
      </p>
      {lignes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Rien encore.</p>
      ) : (
        <ul className="space-y-1">
          {lignes.map((l) => (
            <li key={l.id} className="rounded border border-border px-3 py-1.5 text-xs">
              <span className="text-gold">{l.action}</span>{" "}
              <span className="text-muted-foreground">{l.target}</span>
              <span className="block truncate text-[0.66rem] text-muted-foreground">
                {new Date(l.at).toLocaleString("fr")} · {JSON.stringify(l.details)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
