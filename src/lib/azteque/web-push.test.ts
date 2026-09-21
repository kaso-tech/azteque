import { describe, expect, it } from "vitest";
import {
  b64urlVersOctets,
  chiffrer,
  jetonVapid,
  octetsVersB64url,
  type Abonnement,
} from "./web-push";

const enc = new TextEncoder();
const dec = new TextDecoder();

function concat(...morceaux: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(morceaux.reduce((n, m) => n + m.length, 0));
  let i = 0;
  for (const m of morceaux) {
    out.set(m, i);
    i += m.length;
  }
  return out;
}

/** Un navigateur qui s'abonne : une paire ECDH et un secret d'authentification. */
async function navigateurAbonne(): Promise<{ abonnement: Abonnement; privee: CryptoKey }> {
  const paire = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ])) as CryptoKeyPair;
  const publique = new Uint8Array(await crypto.subtle.exportKey("raw", paire.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return {
    abonnement: {
      endpoint: "https://push.example.org/abonnement/abc",
      p256dh: octetsVersB64url(publique),
      auth: octetsVersB64url(auth),
    },
    privee: paire.privateKey,
  };
}

/**
 * Le DÉCHIFFREMENT, tel que le navigateur l'opère.
 *
 * Écrit à part et à l'envers du chiffrement : si les deux partageaient un
 * helper, une erreur sur une chaîne d'information ou sur un ordre de
 * concaténation se compenserait des deux côtés et l'épreuve passerait quand
 * même — alors qu'aucun vrai navigateur ne saurait lire le message.
 */
async function dechiffrer(corps: Uint8Array, abonnement: Abonnement, privee: CryptoKey) {
  const salt = corps.slice(0, 16);
  const longueurCle = corps[20]!;
  const asPublique = corps.slice(21, 21 + longueurCle);
  const chiffre = corps.slice(21 + longueurCle);

  const asCle = await crypto.subtle.importKey(
    "raw",
    asPublique as BufferSource,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const partage = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: asCle }, privee, 256),
  );

  const uaPublique = b64urlVersOctets(abonnement.p256dh);
  const ikmCle = await crypto.subtle.importKey("raw", partage as BufferSource, "HKDF", false, [
    "deriveBits",
  ]);
  const ikm = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: b64urlVersOctets(abonnement.auth) as BufferSource,
        info: concat(enc.encode("WebPush: info"), new Uint8Array([0]), uaPublique, asPublique),
      },
      ikmCle,
      256,
    ),
  );

  const prk = await crypto.subtle.importKey("raw", ikm as BufferSource, "HKDF", false, [
    "deriveBits",
  ]);
  const cek = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: salt as BufferSource,
        info: concat(enc.encode("Content-Encoding: aes128gcm"), new Uint8Array([0])),
      },
      prk,
      128,
    ),
  );
  const nonce = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: salt as BufferSource,
        info: concat(enc.encode("Content-Encoding: nonce"), new Uint8Array([0])),
      },
      prk,
      96,
    ),
  );

  const aes = await crypto.subtle.importKey("raw", cek as BufferSource, "AES-GCM", false, [
    "decrypt",
  ]);
  const clair = new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce as BufferSource }, aes, chiffre),
  );
  // Le dernier octet ferme l'enregistrement : il ne fait pas partie du message.
  return { texte: dec.decode(clair.slice(0, -1)), fin: clair[clair.length - 1] };
}

describe("chiffrement d'un message push", () => {
  it("se laisse déchiffrer par le navigateur destinataire", async () => {
    const { abonnement, privee } = await navigateurAbonne();
    const message = JSON.stringify({ titre: "Invitation", corps: "Kwame vous invite à jouer" });

    const corps = await chiffrer(abonnement, message);
    const { texte, fin } = await dechiffrer(corps, abonnement, privee);

    expect(texte).toBe(message);
    // 0x02 : dernier enregistrement. Un 0x01 laisserait le navigateur attendre
    // une suite qui ne viendra jamais.
    expect(fin).toBe(2);
  });

  it("porte l'en-tête que la norme décrit", async () => {
    const { abonnement } = await navigateurAbonne();
    const corps = await chiffrer(abonnement, "bonjour");

    expect(corps.slice(0, 16)).toHaveLength(16); // sel
    expect(new DataView(corps.buffer, corps.byteOffset).getUint32(16, false)).toBe(4096);
    expect(corps[20]).toBe(65); // longueur d'une clé publique non compressée
  });

  it("ne chiffre jamais deux fois pareil", async () => {
    const { abonnement } = await navigateurAbonne();
    const a = await chiffrer(abonnement, "même message");
    const b = await chiffrer(abonnement, "même message");
    // Sel et clé éphémère tirés au sort à chaque envoi : réutiliser un couple
    // clé/nonce en AES-GCM livrerait le contenu des deux messages.
    expect(octetsVersB64url(a)).not.toBe(octetsVersB64url(b));
  });

  it("refuse de se laisser lire avec un autre secret d'authentification", async () => {
    const { abonnement, privee } = await navigateurAbonne();
    const corps = await chiffrer(abonnement, "secret");
    const usurpe = {
      ...abonnement,
      auth: octetsVersB64url(crypto.getRandomValues(new Uint8Array(16))),
    };
    await expect(dechiffrer(corps, usurpe, privee)).rejects.toThrow();
  });
});

/**
 * Une paire VAPID tirée pour l'épreuve, et pour elle seule.
 *
 * Surtout pas celle du service : une clé privée écrite dans un fichier suivi
 * par Git est une clé publiée, et n'importe qui pourrait alors envoyer des
 * notifications au nom d'Aztèque. La vraie ne vit que dans les secrets du
 * déploiement (`VAPID_PRIVATE_KEY`).
 */
async function clesJetables() {
  const paire = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
  ])) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey("jwk", paire.privateKey);
  const publique = new Uint8Array(await crypto.subtle.exportKey("raw", paire.publicKey));
  return {
    publique: octetsVersB64url(publique),
    privee: jwk.d!,
    contact: "mailto:contact@azteque.app",
  };
}

describe("jeton VAPID", () => {
  it("se vérifie avec la clé publique annoncée", async () => {
    const CLES = await clesJetables();
    const jeton = await jetonVapid("https://push.example.org/abonnement/abc", CLES);
    const [entete, corps, signature] = jeton.split(".");

    const pub = b64urlVersOctets(CLES.publique);
    const cle = await crypto.subtle.importKey(
      "jwk",
      {
        kty: "EC",
        crv: "P-256",
        x: octetsVersB64url(pub.slice(1, 33)),
        y: octetsVersB64url(pub.slice(33, 65)),
        ext: true,
      },
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const bon = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      cle,
      b64urlVersOctets(signature!) as BufferSource,
      enc.encode(`${entete}.${corps}`),
    );
    expect(bon).toBe(true);
  });

  it("s'adresse à l'origine du service de push, et à elle seule", async () => {
    const CLES = await clesJetables();
    const jeton = await jetonVapid("https://fcm.googleapis.com/fcm/send/xyz", CLES);
    const charge = JSON.parse(dec.decode(b64urlVersOctets(jeton.split(".")[1]!)));
    // `aud` porte l'ORIGINE, jamais l'adresse complète : y laisser le chemin
    // ferait rejeter le jeton, l'abonnement étant propre à chaque navigateur.
    expect(charge.aud).toBe("https://fcm.googleapis.com");
    expect(charge.sub).toBe("mailto:contact@azteque.app");
  });

  it("expire, et dans la fenêtre que la norme autorise", async () => {
    const CLES = await clesJetables();
    const maintenant = Date.UTC(2026, 0, 1);
    const jeton = await jetonVapid("https://push.example.org/a", CLES, maintenant);
    const charge = JSON.parse(dec.decode(b64urlVersOctets(jeton.split(".")[1]!)));
    const duree = charge.exp - Math.floor(maintenant / 1000);
    expect(duree).toBeGreaterThan(0);
    expect(duree).toBeLessThanOrEqual(24 * 3600);
  });
});
