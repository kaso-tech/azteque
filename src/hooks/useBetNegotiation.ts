import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GameState, PlayerIndex } from "@/lib/azteque/engine";
import type { BetNegotiation, MatchRow } from "@/lib/azteque/online";
import type { MatchAction } from "@/lib/azteque/match-actions";
import { getMyProfile, settleMatch } from "@/lib/azteque/account";

interface UseBetNegotiationOptions {
  matchId: string;
  row: MatchRow | null;
  state: GameState | null;
  me: PlayerIndex;
  runAction: (action: MatchAction, opts?: { silent?: boolean }) => Promise<void>;
}

/**
 * Négociation de la mise en jetons d'une partie en ligne, et son règlement
 * une fois le champ terminé.
 *
 * La mise porte sur le CHAMP entier, pas sur un tour : elle se négocie une
 * seule fois, avant la première donne, puis les tours s'enchaînent sans y
 * revenir. Les jetons ne changent de main qu'à la fin du champ.
 *
 * Le règlement lui-même est fait par le serveur (fonction `settle_match`), qui
 * relit le vainqueur dans l'état de partie et déplace les jetons entre les
 * deux comptes. Le client se contente de le déclencher puis de relire son
 * solde : maintenant que les jetons sont conservés d'une partie à l'autre, il
 * ne peut plus être question de les créditer depuis le navigateur. L'appel est
 * idempotent, les deux joueurs peuvent donc le lancer sans double comptage.
 *
 * La validation de la mise (montant autorisé, pas d'auto-acceptation, pas de
 * renégociation après acceptation) a lieu elle aussi côté serveur — voir
 * match-actions.ts.
 */
export function useBetNegotiation({
  matchId,
  row,
  state,
  me,
  runAction,
}: UseBetNegotiationOptions) {
  const settings = useMemo(() => (row?.settings ?? {}) as Record<string, unknown>, [row?.settings]);
  const bet = (settings["bet"] as BetNegotiation | undefined) ?? null;
  const betReady = !!bet && bet.status === "accepted";

  const [balance, setBalance] = useState(0);
  useEffect(() => {
    getMyProfile()
      .then((p) => setBalance(p?.tokens ?? 0))
      .catch(() => setBalance(0));
  }, []);

  const proposeBet = useCallback(
    (amount: number) => {
      void runAction({ type: "propose_bet", amount });
    },
    [runAction],
  );

  const acceptBet = useCallback(() => {
    void runAction({ type: "accept_bet" });
  }, [runAction]);

  // Règlement en fin de champ, une seule fois par table.
  const settled = useRef(false);
  useEffect(() => {
    if (!state || state.phase !== "gameEnd") return;
    if (settled.current) return;
    settled.current = true;
    settleMatch(matchId)
      .then(getMyProfile)
      .then((p) => setBalance(p?.tokens ?? 0))
      .catch(() => {
        /* le solde sera relu à la prochaine ouverture du salon */
      });
  }, [state, matchId]);

  return { bet, betReady, balance, proposeBet, acceptBet };
}
