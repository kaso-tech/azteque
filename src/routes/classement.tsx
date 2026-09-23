import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { PlayerAvatar } from "@/components/azteque/avatar";
import { RankBadge } from "@/components/azteque/rank";
import {
  currentUserId,
  describeError,
  listeClassement,
  type Classement as TableauClassement,
  type LigneClassement,
} from "@/lib/azteque/account";
import { CHAMPS_DE_PLACEMENT } from "@/lib/azteque/rank";

/**
 * Le classement des joueurs.
 *
 * La cote existait depuis longtemps, mise à jour à la fin de chaque champ,
 * mais chacun ne voyait que la sienne : il n'y avait de tableau nulle part,
 * sinon dans la console d'administration. Une cote qu'on ne peut comparer à
 * personne ne motive pas grand monde.
 *
 * Deux sections, et c'est tout le propos. Trié sur la seule cote, le tableau
 * plaçait un compte jamais joué au-dessus d'un joueur ayant gagné quatre
 * champs et perdu cinq : 1000 est plus grand que 980, mais ces deux nombres ne
 * disent pas la même chose — l'un est un résultat, l'autre une absence de
 * résultat. Seuls les joueurs placés ont donc un rang.
 *
 * Les autres ne disparaissent pas pour autant : les cacher viderait le tableau
 * sur une communauté encore petite, et découragerait précisément ceux qu'il
 * doit attirer. Ils figurent en dessous, avec ce qui leur reste à jouer.
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

/** Une ligne du tableau, avec ou sans rang. */
function Ligne({
  joueur,
  moi,
  rang,
}: {
  joueur: LigneClassement;
  moi: string | null;
  /** Absent pour un joueur en placement : il n'a pas encore de position. */
  rang?: number;
}) {
  const reste = CHAMPS_DE_PLACEMENT - joueur.rated_games;
  return (
    <li
      className={cn(
        "flex items-center gap-2 px-2 py-2.5",
        // Sa propre ligne, repérable d'un coup d'œil dans la liste.
        joueur.id === moi && "rounded-lg bg-gold/10",
      )}
    >
      {rang === undefined ? <span className="w-7 shrink-0" /> : <Position rang={rang} />}
      <PlayerAvatar className="h-9 w-9" profile={joueur} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">
          {joueur.username}
          {joueur.id === moi && <span className="ml-1 text-[0.65rem] text-gold">vous</span>}
        </p>
        <RankBadge
          rating={joueur.rating}
          ratedGames={joueur.rated_games}
          className="mt-0.5 text-[0.65rem]"
        />
      </div>
      <div className="shrink-0 text-right">
        {rang === undefined ? (
          <>
            {/* Pas de cote affichée ici : la montrer sans rien derrière elle
                est exactement ce qui trompait. On dit le chemin restant. */}
            <p className="font-display text-sm font-semibold text-muted-foreground">
              {joueur.rated_games} / {CHAMPS_DE_PLACEMENT}
            </p>
            <p className="text-[0.6rem] text-muted-foreground">
              encore {reste} champ{reste > 1 ? "s" : ""}
            </p>
          </>
        ) : (
          <>
            <p className="font-display text-sm font-semibold text-gold">{joueur.rating}</p>
            <p className="text-[0.6rem] text-muted-foreground">
              {joueur.rated_games} champ{joueur.rated_games > 1 ? "s" : ""}
            </p>
          </>
        )}
      </div>
    </li>
  );
}

function Classement() {
  const [tableau, setTableau] = useState<TableauClassement | null>(null);
  const [moi, setMoi] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let vivant = true;
    void currentUserId().then((id) => vivant && setMoi(id));
    listeClassement()
      .then((t) => vivant && setTableau(t))
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

      {!tableau && !erreur && (
        <p className="text-center text-xs text-muted-foreground">Chargement…</p>
      )}

      {tableau && tableau.classes.length === 0 && (
        <p className="panel px-5 py-6 text-center text-xs text-muted-foreground">
          Personne n'est encore classé. {CHAMPS_DE_PLACEMENT} champs joués en ligne suffisent à
          ouvrir le tableau.
        </p>
      )}

      {tableau && tableau.classes.length > 0 && (
        <ol className="panel divide-y divide-border/60 px-2 py-1">
          {tableau.classes.map((j, i) => (
            <Ligne key={j.id} joueur={j} moi={moi} rang={i + 1} />
          ))}
        </ol>
      )}

      {tableau && tableau.enPlacement.length > 0 && (
        <section>
          <h2 className="px-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">
            En cours de placement
          </h2>
          <p className="mt-1 px-1 text-[0.7rem] text-muted-foreground">
            Leur cote bouge déjà à chaque champ ; elle n'entre au tableau qu'au{" "}
            {CHAMPS_DE_PLACEMENT}
            <sup>e</sup>.
          </p>
          <ul className="panel mt-2 divide-y divide-border/60 px-2 py-1">
            {tableau.enPlacement.map((j) => (
              <Ligne key={j.id} joueur={j} moi={moi} />
            ))}
          </ul>
        </section>
      )}

      <Link to="/online" className="text-center text-xs text-gold underline">
        Retour au salon
      </Link>
    </main>
  );
}
