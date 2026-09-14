import { useState } from "react";
import { canAnticipate, isBonne, type GameState, type PlayerIndex } from "@/lib/azteque/engine";

/**
 * Le bouton d'anticipation, et l'avertissement qui va avec.
 *
 * Anticiper, c'est arrêter le tour tout de suite et le faire compter en
 * l'état. Cela ne s'offre pas gratuitement : celui qui anticipe abandonne à
 * l'adversaire toutes les bonnes qu'il tient encore en main, et toutes celles
 * qui dormaient dans le talon. Le geste vaut donc quand le tas déjà encaissé
 * suffit à gagner et qu'il vaut mieux le mettre à l'abri — le 10 d'atout
 * notamment, qui ferait basculer tout le tas s'il se faisait prendre — et il
 * se retourne contre son auteur dès que sa main est encore riche.
 *
 * Le décompte affiché ne porte QUE sur la main : dire combien de bonnes restent
 * au talon révélerait des cartes que personne n'a le droit de voir. Le joueur
 * connaît le prix de ce qu'il tient, il parie sur le reste — c'est précisément
 * ce qui fait de l'anticipation une décision et non un calcul.
 */
export function AnticipationButton({
  state,
  me,
  onConfirm,
  className,
}: {
  state: GameState;
  me: PlayerIndex;
  onConfirm: () => void;
  className?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  if (!canAnticipate(state, me)) return null;

  const enMain = state.hands[me].filter(isBonne).length;

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className={
          className ??
          "rounded-full border border-gold/40 bg-felt-deep/60 px-3 py-1 text-[0.68rem] font-semibold text-gold transition-colors hover:bg-gold/10"
        }
      >
        Anticiper la fin
      </button>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
          <div className="panel w-full max-w-sm p-6 text-center">
            <h2 className="gold-text text-2xl">Anticiper la fin du tour ?</h2>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Le tour s'arrête ici et se compte en l'état. Vous abandonnez à l'adversaire{" "}
              <span className="font-semibold text-gold">
                {enMain === 0
                  ? "aucune bonne de votre main"
                  : enMain === 1
                    ? "la bonne de votre main"
                    : `les ${enMain} bonnes de votre main`}
              </span>{" "}
              ainsi que toutes celles qui restent au talon. Votre tas déjà encaissé, lui, vous
              reste.
            </p>
            <div className="mt-5 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-full border border-border px-5 py-2 text-sm text-muted-foreground"
              >
                Continuer à jouer
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  onConfirm();
                }}
                className="rounded-full bg-[image:var(--gradient-gold)] px-5 py-2 text-sm font-semibold text-primary-foreground"
              >
                Anticiper
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
