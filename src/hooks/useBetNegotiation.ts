import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GameState, PlayerIndex } from "@/lib/azteque/engine";
import type { BetNegotiation, MatchRow } from "@/lib/azteque/online";
import type { MatchAction } from "@/lib/azteque/match-actions";
import { addTokens, getTokens } from "@/lib/azteque/tokens";

interface UseBetNegotiationOptions {
  row: MatchRow | null;
  state: GameState | null;
  me: PlayerIndex;
  runAction: (action: MatchAction, opts?: { silent?: boolean }) => Promise<void>;
}

/**
 * Négociation de la mise en jetons d'une partie en ligne, et son règlement
 * (crédit/débit du solde local) une fois le champ terminé.
 *
 * La mise porte sur le CHAMP entier, pas sur un tour : elle se négocie une
 * seule fois, avant la première donne, puis les tours s'enchaînent sans y
 * revenir. Les jetons ne changent de main qu'à la fin du champ.
 *
 * La validation de la mise elle-même (montant autorisé, pas d'auto-acceptation,
 * pas de renégociation après acceptation) a lieu côté serveur — voir
 * match-actions.ts.
 */
export function useBetNegotiation({ row, state, me, runAction }: UseBetNegotiationOptions) {
  const settings = useMemo(() => (row?.settings ?? {}) as Record<string, unknown>, [row?.settings]);
  const bet = (settings["bet"] as BetNegotiation | undefined) ?? null;
  const betReady = !!bet && bet.status === "accepted";

  const [balance, setBalance] = useState(0);
  useEffect(() => setBalance(getTokens()), []);

  const proposeBet = useCallback(
    (amount: number) => {
      void runAction({ type: "propose_bet", amount });
    },
    [runAction],
  );

  const acceptBet = useCallback(() => {
    void runAction({ type: "accept_bet" });
  }, [runAction]);

  // Règlement des jetons en fin de champ (une seule fois par partie)
  const settled = useRef(false);
  useEffect(() => {
    if (!state || state.phase !== "gameEnd" || !bet || bet.status !== "accepted") return;
    if (settled.current) return;
    settled.current = true;
    setBalance(addTokens(state.champWinner === me ? bet.amount : -bet.amount));
  }, [state, bet, me]);

  return { bet, betReady, balance, proposeBet, acceptBet };
}
