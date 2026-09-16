import { describe, expect, it } from "vitest";
import { DONNE_AU_REPOS, avanceDonne, ceremonyMs, freshDealId } from "./dealing";
import { newRound, playCard, type GameState } from "@/lib/azteque/engine";

/**
 * La cérémonie ne doit se déclencher qu'aux donnes : une fois en plein tour et
 * elle masquerait le jeu, jamais entre deux tours et elle passerait inaperçue.
 */
describe("détection de la donne", () => {
  it("reconnaît une donne fraîche", () => {
    const s = newRound(1);
    expect(freshDealId(s)).toBe(s.stock[0]?.id);
    expect(freshDealId(s)).not.toBeNull();
  });

  it("donne un identifiant différent à chaque donne", () => {
    expect(freshDealId(newRound(1))).not.toBe(freshDealId(newRound(1)));
  });

  it("le même état rend toujours le même identifiant", () => {
    const s = newRound(0);
    expect(freshDealId(s)).toBe(freshDealId(s));
  });

  it("se tait dès la première carte jouée", () => {
    const s = newRound(1);
    const carte = s.hands[s.turn][0]!;
    expect(freshDealId(playCard(s, s.turn, carte.id))).toBeNull();
  });

  it("se tait pendant tout le reste du tour", () => {
    let s: GameState = newRound(1);
    for (let coup = 0; coup < 8 && s.phase === "playing"; coup += 1) {
      if (s.drawPending.length > 0 || s.trick.length >= 2) break;
      const carte = s.hands[s.turn][0];
      if (!carte) break;
      s = playCard(s, s.turn, carte.id);
      expect(freshDealId(s)).toBeNull();
    }
  });

  it("se tait sur un tour terminé", () => {
    const s = { ...newRound(1), phase: "roundEnd" as const };
    expect(freshDealId(s)).toBeNull();
  });

  it("se tait sans état", () => {
    expect(freshDealId(null)).toBeNull();
    expect(freshDealId(undefined)).toBeNull();
  });
});

/**
 * Le bogue vécu, en ligne, au troisième tour : les deux joueurs ont fini le
 * champ sans jamais voir leurs cartes, six dos face à six dos.
 *
 * L'enchaînement tenait en trois temps. La donne tombe, la cérémonie part et
 * masque les mains le temps de son théâtre. L'adversaire, dont l'écran n'a
 * aucune raison d'attendre la nôtre, joue sa première carte. `freshDealId`
 * retombe alors à `null` — la table n'est plus intacte — et comme il servait
 * de dépendance à l'effet, React en exécutait le nettoyage, qui annulait le
 * minuteur chargé de RENDRE les mains. Plus rien ne les redonnait jamais.
 *
 * D'où la règle éprouvée ici : `dealId` ne sert qu'à COMMENCER.
 */
describe("avancement de la cérémonie", () => {
  const DUREE = ceremonyMs("duo");

  it("part sur une donne inconnue", () => {
    const apres = avanceDonne(DONNE_AU_REPOS, "c7", 1000, DUREE);
    expect(apres.dealId).toBe("c7");
    expect(apres.finAt).toBe(1000 + DUREE);
  });

  it("ne repart pas sur la même donne", () => {
    const debut = avanceDonne(DONNE_AU_REPOS, "c7", 1000, DUREE);
    // Même objet : l'appelant en déduit qu'il n'a rien à toucher, minuteur
    // compris. C'est ce que l'ancienne version ne savait pas distinguer.
    expect(avanceDonne(debut, "c7", 2000, DUREE)).toBe(debut);
  });

  it("survit à la première carte jouée par l'adversaire", () => {
    const debut = avanceDonne(DONNE_AU_REPOS, "c7", 1000, DUREE);
    // `freshDealId` retombe à null dès qu'une carte est posée.
    const pendant = avanceDonne(debut, null, 1200, DUREE);
    expect(pendant).toBe(debut);
    expect(pendant.finAt).toBe(1000 + DUREE);
  });

  it("survit à une annonce, à une pioche, à tout ce qui suit la donne", () => {
    const debut = avanceDonne(DONNE_AU_REPOS, "c7", 1000, DUREE);
    let etat = debut;
    for (const t of [1100, 1300, 2000, 3000]) etat = avanceDonne(etat, null, t, DUREE);
    expect(etat).toBe(debut);
  });

  it("repart sur la donne suivante", () => {
    const debut = avanceDonne(DONNE_AU_REPOS, "c7", 1000, DUREE);
    const suivante = avanceDonne(debut, "c99", 9000, DUREE);
    expect(suivante.dealId).toBe("c99");
    expect(suivante.finAt).toBe(9000 + DUREE);
  });

  it("reprend une donne déjà vue si elle revient après une autre", () => {
    // Deux paquets neufs ne partagent jamais d'identifiant, mais la règle ne
    // doit pas dépendre de cette garantie : seul compte « différent d'avant ».
    const a = avanceDonne(DONNE_AU_REPOS, "c7", 1000, DUREE);
    const b = avanceDonne(a, "c99", 5000, DUREE);
    const c = avanceDonne(b, "c7", 9000, DUREE);
    expect(c.dealId).toBe("c7");
    expect(c.finAt).toBe(9000 + DUREE);
  });

  it("ne démarre rien sans donne", () => {
    expect(avanceDonne(DONNE_AU_REPOS, null, 1000, DUREE)).toBe(DONNE_AU_REPOS);
  });
});

/**
 * La séquence complète, jouée sur de vrais états du moteur plutôt que sur des
 * identifiants inventés : c'est elle qui se produisait à chaque tour en ligne.
 */
describe("une donne en ligne que l'adversaire interrompt", () => {
  it("laisse la cérémonie aller à son terme", () => {
    const DUREE = ceremonyMs("duo");
    const donne = newRound(1);

    let etat = avanceDonne(DONNE_AU_REPOS, freshDealId(donne), 0, DUREE);
    expect(etat.finAt).toBe(DUREE);

    // L'adversaire joue 300 ms après la donne, sans attendre notre théâtre.
    const carte = donne.hands[donne.turn][0]!;
    const apresCoup = playCard(donne, donne.turn, carte.id);
    expect(freshDealId(apresCoup)).toBeNull();

    etat = avanceDonne(etat, freshDealId(apresCoup), 300, DUREE);
    // La cérémonie court toujours, et se termine à l'heure prévue : les mains
    // reviennent. Avant le correctif, elles ne revenaient plus jamais.
    expect(etat.finAt).toBe(DUREE);
    expect(etat.dealId).toBe(freshDealId(donne));
  });
});
