import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { PlayerAvatar } from "@/components/azteque/avatar";
import { RankBadge } from "@/components/azteque/rank";
import {
  currentUserId,
  describeError,
  listeClassement,
  type LigneClassement,
} from "@/lib/azteque/account";

/**
 * Le classement des joueurs.
 *
 * La cote existait depuis longtemps, mise à jour à la fin de chaque champ,
 * mais chacun ne voyait que la sienne : il n'y avait de tableau nulle part,
 * sinon dans la console d'administration. Une cote qu'on ne peut comparer à
 * personne ne motive pas grand monde.
 *
 * Aucun seuil d'entrée, et c'est délibéré. Un classement qui exigerait dix
 * champs avant d'y figurer serait vide sur une communauté encore petite, et
 * découragerait précisément ceux qu'il devrait attirer. On montre donc tout le
 * monde, avec le nombre de champs joués en regard : une cote de départ que
 * personne n'a encore défendue se lit d'elle-même.
 */

export const Route = createFileRoute("/classement")({
  head: () => ({
    meta: [
      { title: "Classement — Aztèque" },
      {
        name: "description",
        content: "Le classement des joueurs d'Aztèque, par cote et par grade.",
      },
    ],
  }),
  component: Classement,
});

/** La médaille des trois premiers, le rang en chiffres ensuite. */
function Position({ rang }: { rang: number }) {
  const medaille = rang === 1 ? "🥇" : rang === 2 ? "🥈" : rang === 3 ? "🥉" : null;
  return (
    <span className="w-7 shrink-0 text-center text-sm font-semibold text-muted-foreground">
      {medaille ?? rang}
    </span>
  );
}

function Classement() {
  const [lignes, setLignes] = useState<LigneClassement[] | null>(null);
  const [moi, setMoi] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let vivant = true;
    void currentUserId().then((id) => vivant && setMoi(id));
    listeClassement()
      .then((l) => vivant && setLignes(l))
      .catch((e: unknown) => vivant && setErreur(describeError(e, "Classement indisponible.")));
    return () => {
      vivant = false;
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 py-8">
      <header className="text-center">
        <h1 className="gold-text text-3xl">Classement</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          La cote se gagne et se perd à la fin de chaque champ joué en ligne.
        </p>
      </header>

      {erreur && <p className="text-center text-sm text-destructive">{erreur}</p>}

      {!lignes && !erreur && (
        <p className="text-center text-xs text-muted-foreground">Chargement…</p>
      )}

      {lignes?.length === 0 && (
        <p className="panel px-5 py-6 text-center text-xs text-muted-foreground">
          Personne n'a encore de cote. Le premier champ joué en ligne ouvrira le tableau.
        </p>
      )}

      {lignes && lignes.length > 0 && (
        <ol className="panel divide-y divide-border/60 px-2 py-1">
          {lignes.map((j, i) => (
            <li
              key={j.id}
              className={cn(
                "flex items-center gap-2 px-2 py-2.5",
                // Sa propre ligne, repérable d'un coup d'œil dans la liste.
                j.id === moi && "rounded-lg bg-gold/10",
              )}
            >
              <Position rang={i + 1} />
              <PlayerAvatar className="h-9 w-9" profile={j} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">
                  {j.username}
                  {j.id === moi && <span className="ml-1 text-[0.65rem] text-gold">vous</span>}
                </p>
                <RankBadge rating={j.rating} className="mt-0.5 text-[0.65rem]" />
              </div>
              <div className="shrink-0 text-right">
                <p className="font-display text-sm font-semibold text-gold">{j.rating}</p>
                <p className="text-[0.6rem] text-muted-foreground">
                  {j.rated_games === 0
                    ? "aucun champ"
                    : `${j.rated_games} champ${j.rated_games > 1 ? "s" : ""}`}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}

      <Link to="/online" className="text-center text-xs text-gold underline">
        Retour au salon
      </Link>
    </main>
  );
}
