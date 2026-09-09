import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FALLBACK_ITEMS, itemsOfKind, ownedPhrases, ownedStickers } from "./shop";
import { sanitizeBackground } from "./backgrounds";

/**
 * Le catalogue est écrit deux fois : ici pour les dessins et les libellés, en
 * base pour les prix — parce que c'est la base qui débite, et qu'un prix
 * annoncé par le client ne vaudrait rien. Les deux listes doivent donc
 * concorder, et rien dans le code ne l'impose : ce test s'en charge, en lisant
 * la migration.
 */
const migration = readFileSync("supabase/migrations/20260907140000_boutique.sql", "utf8");
// Les tapis sont arrivés plus tard, avec leur propre migration : la
// concordance vaut pour eux aussi, elle se lit simplement dans un second
// fichier. Une troisième les a ensuite redessinés pour le tapis de jeu —
// c'est donc elle qui tient leurs images d'aujourd'hui.
const migrationFonds = readFileSync(
  "supabase/migrations/20260909170000_fonds_de_salon.sql",
  "utf8",
);
const migrationTapis = readFileSync("supabase/migrations/20260909200000_tapis_de_jeu.sql", "utf8");

// Le catalogue vit désormais en base ; ces constantes en sont la version
// d'origine, celle que la migration installe et que le code sert de recours.
const SHOP_ITEMS = FALLBACK_ITEMS;
const SHOP_AVATARS = itemsOfKind(FALLBACK_ITEMS, "avatar");
const SHOP_STICKERS = itemsOfKind(FALLBACK_ITEMS, "sticker");
const SHOP_MESSAGES = itemsOfKind(FALLBACK_ITEMS, "messages");
const SHOP_TAPIS = itemsOfKind(FALLBACK_ITEMS, "background");

/** Les articles annoncés par les INSERT des migrations. */
function bareme(): Map<string, { kind: string; price: number }> {
  const bloc = migration.slice(
    migration.indexOf("INSERT INTO public.shop_items"),
    migration.indexOf("ON CONFLICT (id)"),
  );
  const lignes = [...bloc.matchAll(/\('([a-z_]+)',\s*'(\w+)',\s*(\d+)\)/g)];
  const fonds = [...blocDesFonds().matchAll(/\('([a-z_]+)',\s*'(\w+)',\s*(\d+),/g)];
  return new Map([...lignes, ...fonds].map((m) => [m[1]!, { kind: m[2]!, price: Number(m[3]) }]));
}

/**
 * Le INSERT du catalogue des fonds — le dernier du fichier : la fonction
 * `admin_upsert_item`, définie plus haut, en contient un autre.
 */
function blocDesFonds(): string {
  return migrationFonds.slice(
    migrationFonds.lastIndexOf("INSERT INTO public.shop_items"),
    migrationFonds.lastIndexOf("ON CONFLICT (id)"),
  );
}

/**
 * Les images annoncées par la dernière migration qui les touche, recollées :
 * le SQL coupe chaque dégradé en une chaîne par ligne, que le moteur
 * concatène.
 */
function imagesDeLaMigration(): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of migrationTapis.matchAll(
    /jsonb_build_object\('css',\s*([\s\S]*?)\)\s*WHERE id = '([a-z_]+)'/g,
  )) {
    out.set(m[2]!, [...m[1]!.matchAll(/'([^']*)'/g)].map((x) => x[1]!).join(""));
  }
  return out;
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
    const toutes = SHOP_MESSAGES.flatMap((l) => l.phrases ?? []);
    expect(new Set(toutes).size).toBe(toutes.length);
  });

  it("propose au moins deux tapis, chacun avec son image", () => {
    expect(SHOP_TAPIS.length).toBeGreaterThanOrEqual(2);
    for (const tapis of SHOP_TAPIS) {
      expect(sanitizeBackground(tapis.css), `${tapis.id} sans image valable`).toBeTruthy();
    }
    expect(new Set(SHOP_TAPIS.map((t) => t.css)).size).toBe(SHOP_TAPIS.length);
  });

  it("sert la même image que la migration pour chaque tapis", () => {
    // Les dégradés sont recopiés à la main dans le SQL : le moindre écart et
    // un joueur hors ligne ne verrait pas le même tapis qu'un joueur connecté.
    const images = imagesDeLaMigration();
    for (const tapis of SHOP_TAPIS) {
      expect(images.get(tapis.id), `${tapis.id} : image absente de la migration`).toBe(tapis.css);
    }
  });

  it("ne débloque que ce qui est possédé", () => {
    expect(ownedPhrases(new Set(), FALLBACK_ITEMS)).toEqual([]);
    expect(ownedStickers(new Set(), FALLBACK_ITEMS)).toEqual([]);
    const achats = new Set(["ms_moqueries", "st_feu"]);
    expect(ownedPhrases(achats)).toEqual(
      SHOP_MESSAGES.find((m) => m.id === "ms_moqueries")!.phrases,
    );
    expect(ownedStickers(achats, FALLBACK_ITEMS).map((s) => s.id)).toEqual(["st_feu"]);
  });

  it("garde les stickers dans l'ordre du catalogue, quel que soit l'ordre des achats", () => {
    const achats = new Set(SHOP_STICKERS.map((s) => s.id));
    expect(ownedStickers(achats, FALLBACK_ITEMS).map((s) => s.id)).toEqual(
      SHOP_STICKERS.map((s) => s.id),
    );
  });
});
