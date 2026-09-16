import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  FALLBACK_ITEMS,
  iconeDe,
  itemsOfKind,
  ownedPhrases,
  ownedStickers,
  type ShopItem,
} from "./shop";
import { sanitizeBackground } from "./backgrounds";
import { isSticker } from "@/components/azteque/stickers";

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
// Les sons sont arrivés plus tard encore, avec leur propre migration :
// la concordance vaut pour eux aussi, lue dans ce troisième fichier.
const migrationSons = readFileSync(
  "supabase/migrations/20260913223833_5a0bbd29-fffd-4246-afc9-cfb8dd095be6.sql",
  "utf8",
);

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
  // Les sons insèrent (id, kind, name, hint, price, ...) : le prix est le
  // premier nombre de la ligne, après le nom et l'indice entre apostrophes.
  const sons = [...migrationSons.matchAll(/\('([a-z_]+)',\s*'(\w+)'[^)]*?,\s*(\d+),/g)];
  return new Map(
    [...lignes, ...fonds, ...sons].map((m) => [m[1]!, { kind: m[2]!, price: Number(m[3]) }]),
  );
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

/**
 * L'illustration d'un article, et le piège qu'elle a tendu.
 *
 * Un son est le seul article dont le fichier n'est pas une image : son
 * `assetUrl` porte l'AUDIO. Les boutons le passaient pourtant à la balise
 * image, qui affichait donc le carré d'image brisée du navigateur — c'est ce
 * qu'on voyait en partie, dans la boutique et dans la console. Et un son créé
 * depuis la console, dont l'identifiant ne désigne aucun dessin, n'affichait
 * rien du tout.
 */
describe("iconeDe", () => {
  const son = (extra: Partial<ShopItem> = {}): ShopItem => ({
    id: "snd_applaudir",
    kind: "sound",
    name: "Applaudir",
    hint: "",
    price: 500,
    active: true,
    sort: 0,
    ...extra,
  });

  it("ne prend JAMAIS la piste audio d'un son pour son image", () => {
    const i = iconeDe(son({ assetUrl: "https://exemple.test/applaudir.mp3" }));
    expect(i.url).toBeNull();
  });

  it("retient l'image que l'admin a posée sur un son", () => {
    const i = iconeDe(
      son({ assetUrl: "https://exemple.test/a.mp3", iconUrl: "https://exemple.test/a.png" }),
    );
    expect(i.url).toBe("https://exemple.test/a.png");
  });

  it("retombe sur le dessin du son joué quand l'identifiant n'en désigne aucun", () => {
    // `snd_applaudir` n'existe pas parmi les dessins livrés ; `cheer`, si.
    expect(iconeDe(son({ soundId: "cheer" })).dessin).toBe("snd_felicitations");
    expect(iconeDe(son({ soundId: "laugh" })).dessin).toBe("snd_rire");
  });

  it("donne un dessin générique plutôt qu'un bouton vide", () => {
    expect(iconeDe(son()).dessin).toBe("snd_generique");
    expect(iconeDe(son({ soundId: "inconnu" })).dessin).toBe("snd_generique");
  });

  it("laisse le dessin choisi par l'admin l'emporter", () => {
    expect(iconeDe(son({ soundId: "cheer", art: "snd_moquerie" })).dessin).toBe("snd_moquerie");
  });

  it("garde l'ancienne règle pour tout le reste : l'image EST l'asset", () => {
    const sticker: ShopItem = {
      id: "st_perso",
      kind: "sticker",
      name: "Perso",
      hint: "",
      price: 100,
      active: true,
      sort: 0,
      art: "st_feu",
      assetUrl: "https://exemple.test/perso.png",
    };
    expect(iconeDe(sticker)).toEqual({ url: "https://exemple.test/perso.png", dessin: "st_feu" });
    expect(iconeDe({ ...sticker, art: undefined, assetUrl: null })).toEqual({
      url: null,
      dessin: "st_perso",
    });
  });

  it("illustre les quatre sons livrés sans rien leur ajouter", () => {
    for (const s of FALLBACK_ITEMS.filter((i) => i.kind === "sound")) {
      const i = iconeDe(s);
      expect(i.url).toBeNull();
      expect(i.dessin).toBe(s.id);
    }
  });
});

/**
 * Le pont entre les deux modules : `iconeDe` nomme un dessin, `stickers.tsx`
 * le dessine. Rien ne garantissait jusqu'ici qu'ils parlent de la même chose,
 * et c'est précisément par là que les boutons se vidaient.
 */
describe("tout dessin désigné est un dessin qui existe", () => {
  it("couvre le catalogue livré", () => {
    for (const item of FALLBACK_ITEMS) {
      if (item.kind === "messages" || item.kind === "background" || item.kind === "avatar")
        continue;
      expect(isSticker(iconeDe(item).dessin)).toBe(true);
    }
  });

  it("couvre un son créé depuis la console, quel que soit son identifiant", () => {
    const inventé = (soundId?: string): ShopItem => ({
      id: "peu_importe",
      kind: "sound",
      name: "",
      hint: "",
      price: 0,
      active: true,
      sort: 0,
      ...(soundId ? { soundId } : {}),
    });
    for (const s of [undefined, "laugh", "cry", "taunt", "cheer", "n_importe_quoi"]) {
      expect(isSticker(iconeDe(inventé(s)).dessin)).toBe(true);
    }
  });
});
