import { describe, expect, it } from "vitest";
import { newRound, type GameState, type PlayerIndex } from "./engine";
import { resolveReadyNextRound } from "./match-actions";

/**
 * Base de données en mémoire imitant juste assez de Postgrest pour ce test :
 * une ligne, un `updated_at` qui avance à chaque écriture (comme le
 * déclencheur `matches_touch_updated_at` en production), et une écriture
 * conditionnelle qui échoue silencieusement (renvoie `null`) si la valeur
 * attendue de `updated_at` ne correspond plus — exactement la sémantique de
 * `.eq("updated_at", expectedUpdatedAt)` côté Supabase.
 */
function fakeTable(initial: { state: GameState; settings: Record<string, unknown> }) {
  let row = { ...initial, updated_at: "t0" };
  let tick = 0;
  let writeCount = 0;

  return {
    row: () => row,
    writeCount: () => writeCount,
    io: {
      reload: async () => ({ ...row }),
      tryWrite: async (patch: Record<string, unknown>, expectedUpdatedAt: string) => {
        if (row.updated_at !== expectedUpdatedAt) return null;
        tick += 1;
        writeCount += 1;
        row = { ...row, ...patch, updated_at: `t${tick}` } as typeof row;
        return { ...row };
      },
    },
  };
}

function roundEndState(): GameState {
  const s = newRound(0, [1, 0]);
  return { ...s, phase: "roundEnd", lastTrickWinner: 1 as PlayerIndex, roundWinner: 1 };
}

describe("resolveReadyNextRound", () => {
  it("attend le second joueur avant de distribuer un nouveau tour", async () => {
    const table = fakeTable({ state: roundEndState(), settings: {} });

    const afterHost = await resolveReadyNextRound("host", table.row(), table.io);
    expect(afterHost.state?.phase).toBe("roundEnd");
    expect((afterHost.settings["nextRound"] as { host: boolean; guest: boolean }).host).toBe(true);
    expect(table.writeCount()).toBe(1);
  });

  it("distribue le tour suivant une seule fois quand les deux joueurs sont prêts", async () => {
    const table = fakeTable({ state: roundEndState(), settings: {} });

    await resolveReadyNextRound("host", table.row(), table.io);
    const result = await resolveReadyNextRound("guest", table.row(), table.io);

    expect(result.state?.phase).toBe("playing");
    expect(result.settings["nextRound"]).toEqual({ host: false, guest: false });
    // Les tours gagnés du tour précédent sont conservés dans la nouvelle donne.
    expect(result.state?.roundsWon).toEqual([1, 0]);
    expect(table.writeCount()).toBe(2);
  });

  it("ne bloque pas la table quand les deux joueurs cliquent en même temps (course)", async () => {
    // Les deux clients lisent la MÊME ligne avant que l'un ou l'autre n'écrive :
    // c'est exactement le scénario qui, avec un simple lire-modifier-écrire,
    // ferait que le second écrase l'accord du premier et bloque la table.
    const table = fakeTable({ state: roundEndState(), settings: {} });
    const staleRow = table.row();

    const [hostResult, guestResult] = await Promise.all([
      resolveReadyNextRound("host", staleRow, table.io),
      resolveReadyNextRound("guest", staleRow, table.io),
    ]);

    // Le premier des deux à écrire ne peut pas encore savoir que l'autre est
    // prêt : sa propre réponse HTTP reflète l'état AU MOMENT de son écriture
    // (encore "roundEnd", avec sa marque à lui posée). Ce n'est pas un blocage
    // : comme pour toute autre action de ce jeu en ligne (jouer une carte,
    // proposer une mise…), le client reste abonné aux mises à jour Postgres
    // (`subscribeMatch`) et reçoit l'état final quelques millisecondes après,
    // sans action de sa part. Ce qui compte pour la table est l'état
    // FINAL — celui que la souscription temps réel propagera aux deux — et
    // qu'une seule donne ait eu lieu.
    const final = table.row();
    expect(final.state.phase).toBe("playing");
    expect(final.settings["nextRound"]).toEqual({ host: false, guest: false });

    // Chaque demande doit avoir été honorée (aucune des deux n'a été perdue) :
    // une seule des deux réponses peut déjà montrer le nouveau tour (celle qui
    // l'a effectivement distribué), mais l'autre doit au moins montrer sa
    // propre marque d'accord posée avant le conflit — jamais une exception,
    // jamais un objet `nextRound` revenu à son état d'avant sa demande.
    const results = [hostResult, guestResult];
    expect(results.some((r) => r.state?.phase === "playing")).toBe(true);
    for (const [seat, result] of [
      ["host", hostResult],
      ["guest", guestResult],
    ] as const) {
      const nextRound = result.settings["nextRound"] as { host: boolean; guest: boolean };
      const acknowledged = result.state?.phase === "playing" || nextRound[seat] === true;
      expect(acknowledged).toBe(true);
    }

    // Une seule donne doit avoir eu lieu (pas de double distribution) : deux
    // écritures en tout (une marque + une donne), jamais plus.
    expect(table.writeCount()).toBe(2);
  });

  it("abandonne proprement après un conflit d'écriture persistant, sans boucler à l'infini", async () => {
    // Une ligne externe qui change de `updated_at` à chaque relecture : c'est
    // le cas dégénéré où l'écriture ne peut jamais aboutir. La boucle de
    // relecture doit avoir une limite, sinon une requête resterait pendue.
    let n = 0;
    const io = {
      reload: async () => {
        n += 1;
        return { state: roundEndState(), settings: {}, updated_at: `ext${n}` };
      },
      tryWrite: async () => null,
    };
    await expect(
      resolveReadyNextRound("host", { state: roundEndState(), settings: {}, updated_at: "t0" }, io),
    ).rejects.toThrow("Table occupée, réessayez.");
  });

  it("refuse la demande hors fin de tour, dès le premier essai", async () => {
    const table = fakeTable({ state: { ...roundEndState(), phase: "playing" }, settings: {} });
    await expect(resolveReadyNextRound("host", table.row(), table.io)).rejects.toThrow(
      "Le tour est encore en cours.",
    );
  });
});
