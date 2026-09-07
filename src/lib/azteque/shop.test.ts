import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SHOP_AVATARS,
  SHOP_ITEMS,
  SHOP_MESSAGES,
  SHOP_STICKERS,
  ownedPhrases,
  ownedStickers,
} from "./shop";

/**
 * Le catalogue est écrit deux fois : ici pour les dessins et les libellés, en
 * base pour les prix — parce que c'est la base qui débite, et qu'un prix
 * annoncé par le client ne vaudrait rien. Les deux listes doivent donc
 * concorder, et rien dans le code ne l'impose : ce test s'en charge, en lisant
 * la migration.
 */
const migration = readFileSync("supabase/migrations/20260907140000_boutique.sql", "utf8");

/** Les triplets du INSERT du catalogue. */
function bareme(): Map<string, { kind: string; price: number }> {
  const bloc = migration.slice(
    migration.indexOf("INSERT INTO public.shop_items"),
    migration.indexOf("ON CONFLICT (id)"),
  );
  const lignes = [...bloc.matchAll(/\('([a-z_]+)',\s*'(\w+)',\s*(\d+)\)/g)];
  return new Map(lignes.map((m) => [m[1]!, { kind: m[2]!, price: Number(m[3]) }]));
}

describe("catalogue de la boutique", () => {
  const sql = bareme();

  it("annonce en base exactement les articles du client", () => {
    expect([...sql.keys()].sort()).toEqual(SHOP_ITEMS.map((i) => i.id).sort());
  });

  it("annonce les mêmes prix et les mêmes natures", () => {
    for (const item of SHOP_ITEMS) {
      expect(sql.get(item.id), `${item.id} absent de la migration`).toEqual({
        kind: item.kind,
        price: item.price,
      });
    }
  });

  it("n'a pas deux fois le même identifiant", () => {
    expect(new Set(SHOP_ITEMS.map((i) => i.id)).size).toBe(SHOP_ITEMS.length);
  });

  it("propose au moins cinq avatars, à partir de 500 jetons et à des prix distincts", () => {
    expect(SHOP_AVATARS.length).toBeGreaterThanOrEqual(5);
    expect(Math.min(...SHOP_AVATARS.map((a) => a.price))).toBe(500);
    expect(new Set(SHOP_AVATARS.map((a) => a.price)).size).toBe(SHOP_AVATARS.length);
  });

  it("donne cinq phrases par lot, et pas deux fois la même", () => {
    for (const lot of SHOP_MESSAGES) {
      expect(lot.phrases).toHaveLength(5);
      expect(new Set(lot.phrases).size).toBe(5);
    }
    const toutes = SHOP_MESSAGES.flatMap((l) => l.phrases);
    expect(new Set(toutes).size).toBe(toutes.length);
  });

  it("ne débloque que ce qui est possédé", () => {
    expect(ownedPhrases(new Set())).toEqual([]);
    expect(ownedStickers(new Set())).toEqual([]);
    const achats = new Set(["ms_moqueries", "st_feu"]);
    expect(ownedPhrases(achats)).toEqual(
      SHOP_MESSAGES.find((m) => m.id === "ms_moqueries")!.phrases,
    );
    expect(ownedStickers(achats).map((s) => s.id)).toEqual(["st_feu"]);
  });

  it("garde les stickers dans l'ordre du catalogue, quel que soit l'ordre des achats", () => {
    const achats = new Set(SHOP_STICKERS.map((s) => s.id));
    expect(ownedStickers(achats).map((s) => s.id)).toEqual(SHOP_STICKERS.map((s) => s.id));
  });
});
