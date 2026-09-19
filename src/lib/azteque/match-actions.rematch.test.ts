import { describe, expect, it } from "vitest";
import { newRound, type GameState } from "./engine";
import { resolveRematch } from "./match-actions";

/**
 * Même base de données en mémoire que match-actions.race.test.ts : une ligne,
 * un `updated_at` qui avance à chaque écriture, et une écriture conditionnelle
 * qui échoue silencieusement si cette valeur a bougé — la sémantique exacte du
 * `.eq("updated_at", …)` de Supabase.
 */
function fakeTable(initial: { state: GameState; settings: Record<string, unknown> }) {
  let row = { ...initial, updated_at: "t0" };
  let tick = 0;
  return {
    row: () => row,
    io: {
      reload: async () => ({ ...row }),
      tryWrite: async (patch: Record<string, unknown>, attendu: string) => {
        if (row.updated_at !== attendu) return null;
        tick += 1;
        row = { ...row, ...patch, updated_at: `t${tick}` } as typeof row;
        return { ...row };
      },
    },
  };
}

function champTermine(): GameState {
  const s = newRound(0, [3, 1]);
  return { ...s, phase: "gameEnd", champWinner: 0 };
}

/** Un créateur de table qui compte ses appels et numérote ce qu'il produit. */
function createur() {
  let n = 0;
  const appels: string[] = [];
  return {
    appels,
    creer: async () => {
      n += 1;
      const id = `table-${n}`;
      appels.push(id);
      return id;
    },
  };
}

type Accord = { host: boolean; guest: boolean; matchId?: string };

describe("resolveRematch", () => {
  it("attend le second joueur avant d'ouvrir une table", async () => {
    const table = fakeTable({ state: champTermine(), settings: {} });
    const c = createur();

    const apres = await resolveRematch("host", table.row(), table.io, c.creer);

    const accord = apres.settings["rematch"] as Accord;
    expect(accord.host).toBe(true);
    expect(accord.guest).toBe(false);
    expect(accord.matchId).toBeUndefined();
    // Rien n'a été créé : un joueur seul ne décide pas d'une revanche.
    expect(c.appels).toEqual([]);
  });

  it("ouvre la table quand les deux sont d'accord", async () => {
    const table = fakeTable({ state: champTermine(), settings: {} });
    const c = createur();

    await resolveRematch("host", table.row(), table.io, c.creer);
    const apres = await resolveRematch("guest", table.row(), table.io, c.creer);

    const accord = apres.settings["rematch"] as Accord;
    expect(accord).toMatchObject({ host: true, guest: true, matchId: "table-1" });
    expect(c.appels).toEqual(["table-1"]);
  });

  it("n'ouvre qu'UNE table quand les deux cliquent en même temps", async () => {
    // Le cas qui compte : en fin de champ, les deux joueurs cliquent ensemble.
    // Sans la concurrence optimiste, chacun créerait la sienne et ils
    // partiraient jouer chacun de son côté.
    const table = fakeTable({ state: champTermine(), settings: {} });
    const c = createur();
    const depart = table.row();

    await Promise.all([
      resolveRematch("host", depart, table.io, c.creer),
      resolveRematch("guest", depart, table.io, c.creer),
    ]);

    const final = table.row().settings["rematch"] as Accord;
    expect(final).toMatchObject({ host: true, guest: true, matchId: "table-1" });
    // UNE seule table, c'est tout l'enjeu : deux créations enverraient les
    // joueurs s'asseoir chacun à la sienne.
    expect(c.appels).toEqual(["table-1"]);
    // Le premier à avoir cliqué n'apprend pas l'adresse dans SA réponse — le
    // second n'avait pas encore accepté — mais par la mise à jour de la ligne,
    // qui est justement ce que l'écran lit pour suivre la table.
  });

  it("renvoie la table déjà ouverte plutôt que d'en créer une seconde", async () => {
    const table = fakeTable({
      state: champTermine(),
      settings: { rematch: { host: true, guest: true, matchId: "deja-la" } },
    });
    const c = createur();

    const apres = await resolveRematch("host", table.row(), table.io, c.creer);

    expect((apres.settings["rematch"] as Accord).matchId).toBe("deja-la");
    expect(c.appels).toEqual([]);
  });

  it("refuse tant que le champ n'est pas terminé", async () => {
    const table = fakeTable({ state: newRound(0, [1, 0]), settings: {} });
    const c = createur();

    await expect(resolveRematch("host", table.row(), table.io, c.creer)).rejects.toThrow(
      /pas terminé/i,
    );
    expect(c.appels).toEqual([]);
  });

  it("accepte le second clic d'un même joueur sans rien changer", async () => {
    const table = fakeTable({ state: champTermine(), settings: {} });
    const c = createur();

    await resolveRematch("host", table.row(), table.io, c.creer);
    const apres = await resolveRematch("host", table.row(), table.io, c.creer);

    const accord = apres.settings["rematch"] as Accord;
    expect(accord).toMatchObject({ host: true, guest: false });
    expect(c.appels).toEqual([]);
  });
});
