import { useState } from "react";
import { BET_STEPS } from "@/lib/azteque/tokens";
import type { BetNegotiation } from "@/lib/azteque/online";

export function BetPanel({
  bet,
  mySeat,
  oppName,
  balance,
  onPropose,
  onAccept,
  onQuit,
}: {
  bet: BetNegotiation | null;
  mySeat: "host" | "guest";
  oppName: string;
  balance: number;
  onPropose: (amount: number) => void;
  onAccept: () => void;
  onQuit: () => void;
}) {
  const live = bet;
  const mine = live?.by === mySeat;
  const [counter, setCounter] = useState(false);
  const choosing = !live || mine || counter;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-5">
      <div className="panel w-full max-w-sm p-5 text-center">
        <h2 className="gold-text text-2xl">Mise de la partie</h2>
        <p className="mt-1 text-[0.7rem] text-muted-foreground">
          Votre solde : 🪙 {balance} jetons
        </p>

        {live && (
          <p className="mt-3 text-sm text-foreground">
            {mine
              ? `Vous proposez 🪙 ${live.amount} — en attente de ${oppName}.`
              : `${oppName} propose 🪙 ${live.amount} jetons.`}
          </p>
        )}
        {!live && (
          <p className="mt-3 text-sm text-muted-foreground">
            Proposez une mise pour toute la partie. L'adversaire doit l'accepter ou contre-proposer
            avant la première donne. Les jetons ne changent de main qu'à la fin du champ.
          </p>
        )}

        {live && !mine && !counter && (
          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={onAccept}
              disabled={live.amount > balance}
              className="rounded-full bg-[image:var(--gradient-gold)] px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              Accepter
            </button>
            <button
              type="button"
              onClick={() => setCounter(true)}
              className="rounded-full border border-gold/45 px-5 py-2 text-sm font-semibold text-gold"
            >
              Contre-proposer
            </button>
          </div>
        )}
        {live && !mine && live.amount > balance && !counter && (
          <p className="mt-2 text-[0.65rem] text-destructive">
            Solde insuffisant : proposez une mise plus basse.
          </p>
        )}

        {choosing && (
          <div className="mt-4 grid grid-cols-3 gap-2">
            {BET_STEPS.map((amount) => {
              const active = live?.amount === amount && mine;
              return (
                <button
                  key={amount}
                  type="button"
                  onClick={() => {
                    setCounter(false);
                    onPropose(amount);
                  }}
                  className={
                    "rounded-md border px-2 py-2 text-xs font-semibold " +
                    (active
                      ? "border-gold bg-gold/20 text-gold"
                      : "border-border text-muted-foreground")
                  }
                >
                  🪙 {amount}
                </button>
              );
            })}
          </div>
        )}

        {live && mine && (
          <p className="mt-3 text-[0.65rem] text-muted-foreground">
            Vous pouvez ajuster votre proposition tant qu'elle n'est pas acceptée.
          </p>
        )}

        <button
          type="button"
          onClick={onQuit}
          className="mt-5 w-full rounded-full border border-destructive/50 px-5 py-2 text-xs font-semibold text-destructive"
        >
          Quitter la table
        </button>
      </div>
    </div>
  );
}
