import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PlayerAvatar } from "@/components/azteque/avatar";
import { RankBadge } from "@/components/azteque/rank";
import { rankOf } from "@/lib/azteque/rank";
import { describeError } from "@/lib/azteque/account";
import {
  adminGrantTokens,
  adminListPlayers,
  adminSetAdmin,
  adminSetBanned,
  estEnLigne,
  type AdminPlayer,
} from "@/lib/azteque/admin";

/** Le peu de pays qu'on nomme en toutes lettres ; les autres gardent leur code. */
const PAYS: Record<string, string> = {
  CI: "Côte d'Ivoire",
  TG: "Togo",
  BJ: "Bénin",
  BF: "Burkina Faso",
  GH: "Ghana",
  ML: "Mali",
  NE: "Niger",
  NG: "Nigéria",
  SN: "Sénégal",
  CM: "Cameroun",
  GN: "Guinée",
  FR: "France",
  BE: "Belgique",
  CA: "Canada",
  US: "États-Unis",
};

/** « Vu il y a… », ou l'aveu qu'on ne l'a jamais vu. */
function vuIlYA(iso: string | null): string {
  if (!iso) return "jamais vu";
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 60) return `vu il y a ${minutes} min`;
  const heures = Math.floor(minutes / 60);
  if (heures < 24) return `vu il y a ${heures} h`;
  return `vu il y a ${Math.floor(heures / 24)} j`;
}

export function Joueurs({ onErreur }: { onErreur: (e: string | null) => void }) {
  const [query, setQuery] = useState("");
  const [liste, setListe] = useState<AdminPlayer[]>([]);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [montant, setMontant] = useState("500");
  const [motif, setMotif] = useState("");
  const [busy, setBusy] = useState(false);

  const charger = useCallback(
    (q: string) => {
      adminListPlayers(q, 100)
        .then(setListe)
        .catch((e: unknown) => onErreur(describeError(e, "Liste indisponible.")));
    },
    [onErreur],
  );

  useEffect(() => {
    const t = setTimeout(() => charger(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query, charger]);

  const agir = (p: Promise<unknown>) => {
    setBusy(true);
    onErreur(null);
    p.then(() => charger(query.trim()))
      .catch((e: unknown) => onErreur(describeError(e, "Action impossible.")))
      .finally(() => setBusy(false));
  };

  return (
    <section className="panel space-y-3 px-4 py-4">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Chercher un pseudo…"
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-gold"
      />
      <p className="text-xs text-muted-foreground">
        {liste.length} joueur{liste.length > 1 ? "s" : ""}
      </p>

      <ul className="space-y-2">
        {liste.map((j) => (
          <li key={j.id} className="rounded-lg border border-border">
            <button
              type="button"
              onClick={() => setOuvert(ouvert === j.id ? null : j.id)}
              className="flex w-full items-center gap-3 px-3 py-2 text-left"
            >
              <PlayerAvatar className="h-10 w-10" profile={j} />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2">
                  <span
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      estEnLigne(j)
                        ? "bg-emerald-400 shadow-[0_0_6px_rgb(52_211_153_/_0.8)]"
                        : "bg-muted-foreground/40",
                    )}
                    aria-label={estEnLigne(j) ? "En ligne" : "Hors ligne"}
                  />
                  <span className="truncate text-sm font-semibold text-foreground">
                    {j.username}
                  </span>
                  {j.is_admin && <span className="text-[0.62rem] text-gold">ADMIN</span>}
                  {j.banned && <span className="text-[0.62rem] text-destructive">SUSPENDU</span>}
                </span>
                <span className="block truncate text-[0.68rem] text-muted-foreground">
                  {[j.first_name, j.last_name].filter(Boolean).join(" ") ||
                    "Identité non renseignée"}
                  {j.country ? ` · ${PAYS[j.country] ?? j.country}` : ""}
                </span>
                <RankBadge rating={j.rating} />
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-display text-sm text-gold">🪙 {j.tokens}</span>
                <span className="block text-[0.62rem] text-muted-foreground">
                  {j.rounds_played} tours · {j.rated_games} champs
                </span>
                <span className="block text-[0.62rem] text-muted-foreground">
                  {j.purchases} achats · {estEnLigne(j) ? "en ligne" : vuIlYA(j.last_seen_at)}
                </span>
              </span>
            </button>

            {ouvert === j.id && (
              <div className="space-y-2 border-t border-border px-3 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={montant}
                    onChange={(e) => setMontant(e.target.value)}
                    inputMode="numeric"
                    className="h-9 w-24 rounded-md border border-input bg-background px-2 text-sm"
                    aria-label="Montant"
                  />
                  <input
                    value={motif}
                    onChange={(e) => setMotif(e.target.value)}
                    placeholder="Motif (consigné au journal)"
                    className="h-9 min-w-40 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                  />
                  <Button
                    size="sm"
                    disabled={busy || !Number(montant)}
                    onClick={() => agir(adminGrantTokens(j.id, Number(montant), motif))}
                  >
                    Envoyer
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || !Number(montant)}
                    onClick={() => agir(adminGrantTokens(j.id, -Number(montant), motif))}
                  >
                    Retirer
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => agir(adminSetBanned(j.id, !j.banned))}
                  >
                    {j.banned ? "Rétablir" : "Suspendre"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => agir(adminSetAdmin(j.id, !j.is_admin))}
                  >
                    {j.is_admin ? "Retirer l'administration" : "Nommer administrateur"}
                  </Button>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[0.68rem] sm:grid-cols-3">
                  {[
                    ["Nom d'utilisateur", j.username],
                    ["Nom et prénom", [j.first_name, j.last_name].filter(Boolean).join(" ") || "—"],
                    ["Pays", j.country ? (PAYS[j.country] ?? j.country) : "—"],
                    ["Niveau", `${rankOf(j.rating).name} (${j.rating})`],
                    ["Jetons", String(j.tokens)],
                    ["Tours joués", String(j.rounds_played)],
                    ["Champs classés", String(j.rated_games)],
                    ["Achats", String(j.purchases)],
                    ["Statut", estEnLigne(j) ? "En ligne" : vuIlYA(j.last_seen_at)],
                    [
                      "Inscrit le",
                      j.created_at ? new Date(j.created_at).toLocaleDateString("fr") : "—",
                    ],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="truncate text-foreground">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
