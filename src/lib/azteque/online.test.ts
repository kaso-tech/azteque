import { describe, expect, it } from "vitest";
import { estPartieReprenable, type MatchRow } from "./online";

const match = (p: Partial<MatchRow> = {}): MatchRow => ({
  id: "partie-1",
  code: "ABCDE",
  host_id: "hote",
  guest_id: "invite",
  host_name: "Hôte",
  guest_name: "Invité",
  status: "playing",
  state: null,
  settings: {},
  created_at: "2026-09-19T00:00:00Z",
  updated_at: "2026-09-19T00:00:00Z",
  ...p,
});

describe("partie à reprendre", () => {
  it("accepte une partie commencée avec deux joueurs", () => {
    expect(estPartieReprenable(match())).toBe(true);
  });

  it("ignore une ancienne table encore en attente", () => {
    expect(estPartieReprenable(match({ status: "waiting", guest_id: null }))).toBe(false);
  });

  it("ignore une table incomplète même marquée en cours", () => {
    expect(estPartieReprenable(match({ guest_id: null }))).toBe(false);
    expect(estPartieReprenable(match({ host_id: null }))).toBe(false);
  });

  it("ignore une partie terminée", () => {
    expect(estPartieReprenable(match({ status: "finished" }))).toBe(false);
  });
});