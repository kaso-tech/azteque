/**
 * Le protocole Web Push, écrit avec le seul Web Crypto.
 *
 * La bibliothèque `web-push` habituelle s'appuie sur le `crypto` et le `https`
 * de Node. Or ce jeu se déploie sur Cloudflare Workers, où ni l'un ni l'autre
 * n'existe : elle s'installerait sans broncher, passerait les tests en local,
 * et échouerait une fois en ligne. Tout ce qui suit n'utilise donc que
 * `crypto.subtle`, présent aussi bien dans le navigateur, dans Node 18+ que
 * dans un Worker.
 *
 * Deux normes s'y croisent :
 *
 * — RFC 8291 chiffre le message pour le destinataire. Le service de push
 *   (Google, Mozilla, Apple…) achemine sans jamais pouvoir lire : la clé naît
 *   d'un accord ECDH entre une paire éphémère et la clé publique du navigateur
 *   abonné, mêlée au secret d'authentification que lui seul possède.
 *
 * — RFC 8292 (VAPID) signe la requête pour que le service de push sache de
 *   quel serveur elle vient. C'est ce qui empêche n'importe qui, connaissant
 *   une adresse d'abonnement, d'y envoyer ce qu'il veut.
 *
 * Rien ici n'est propre à Aztèque : c'est la brique de transport, éprouvée par
 * un aller-retour dans `web-push.test.ts`.
 */

const enc = new TextEncoder();

/**
 * Les tableaux d'octets sont annotés `Uint8Array<ArrayBuffer>` et non
 * `Uint8Array` tout court : TypeScript distingue désormais un tableau adossé à
 * un `ArrayBuffer` ordinaire d'un tableau partagé entre fils d'exécution, et
 * `crypto.subtle` n'accepte que le premier. Tout ce qui suit en fabrique de
 * toute façon, mais il faut le dire.
 */
export function b64urlVersOctets(s: string): Uint8Array<ArrayBuffer> {
  const base = s.replace(/-/g, "+").replace(/_/g, "/");
  const rembourre = base + "=".repeat((4 - (base.length % 4)) % 4);
  const brut = atob(rembourre);
  const out = new Uint8Array(brut.length);
  for (let i = 0; i < brut.length; i += 1) out[i] = brut.charCodeAt(i);
  return out;
}

export function octetsVersB64url(u8: Uint8Array): string {
  let s = "";
  for (const o of u8) s += String.fromCharCode(o);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...morceaux: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = morceaux.reduce((n, m) => n + m.length, 0);
  const out = new Uint8Array(total);
  let i = 0;
  for (const m of morceaux) {
    out.set(m, i);
    i += m.length;
  }
  return out;
}

/** L'abonnement tel que le navigateur le remet (`PushSubscription.toJSON()`). */
export interface Abonnement {
  endpoint: string;
  /** Clé publique du navigateur, point non compressé de 65 octets. */
  p256dh: string;
  /** Secret d'authentification, 16 octets. */
  auth: string;
}

export interface ClesVapid {
  /** Point non compressé de 65 octets, en base64url. */
  publique: string;
  /** Scalaire privé `d` de 32 octets, en base64url. */
  privee: string;
  /** Qui joindre en cas d'abus, exigé par la norme : `mailto:` ou `https:`. */
  contact: string;
}

/**
 * Chiffre le message pour ce navigateur-là (RFC 8291, `aes128gcm`).
 *
 * `salt` et `ephemere` ne sont paramétrables que pour l'épreuve : en usage
 * réel ils doivent être tirés au sort à CHAQUE message — réutiliser un couple
 * clé/nonce en AES-GCM livre le contenu des deux messages.
 */
export async function chiffrer(
  abonnement: Abonnement,
  message: string,
  epreuve?: { salt: Uint8Array; ephemere: CryptoKeyPair },
): Promise<Uint8Array> {
  const uaPublique = b64urlVersOctets(abonnement.p256dh);
  const authSecret = b64urlVersOctets(abonnement.auth);

  const ephemere =
    epreuve?.ephemere ??
    ((await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
      "deriveBits",
    ])) as CryptoKeyPair);
  const asPublique = new Uint8Array(await crypto.subtle.exportKey("raw", ephemere.publicKey));

  const uaCle = await crypto.subtle.importKey(
    "raw",
    uaPublique as BufferSource,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const partage = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaCle }, ephemere.privateKey, 256),
  );

  // Premier tirage : le secret partagé, salé par le secret d'authentification.
  // C'est `auth` qui lie le message à CE navigateur — sans lui, quiconque
  // connaît la clé publique pourrait fabriquer un message lisible.
  const ikmCle = await crypto.subtle.importKey("raw", partage as BufferSource, "HKDF", false, [
    "deriveBits",
  ]);
  const infoCle = concat(enc.encode("WebPush: info"), new Uint8Array([0]), uaPublique, asPublique);
  const ikm = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt: authSecret as BufferSource, info: infoCle },
      ikmCle,
      256,
    ),
  );

  // Second tirage : la clé de chiffrement et le nonce, salés par une valeur
  // tirée au sort et transmise en clair en tête du corps.
  const salt = epreuve?.salt ?? crypto.getRandomValues(new Uint8Array(16));
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

  // `0x02` ferme le dernier (ici l'unique) enregistrement. Un `0x01` annoncerait
  // une suite, et le navigateur attendrait un message qui ne viendrait jamais.
  const clair = concat(enc.encode(message), new Uint8Array([2]));
  const aes = await crypto.subtle.importKey("raw", cek as BufferSource, "AES-GCM", false, [
    "encrypt",
  ]);
  const chiffre = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce as BufferSource }, aes, clair),
  );

  // En-tête du corps : sel, taille d'enregistrement, longueur puis contenu de
  // la clé publique éphémère. Le navigateur y retrouve tout ce qu'il lui faut,
  // hormis son propre secret.
  const tailleEnr = new Uint8Array(4);
  new DataView(tailleEnr.buffer).setUint32(0, 4096, false);
  return concat(salt, tailleEnr, new Uint8Array([asPublique.length]), asPublique, chiffre);
}

/** Le jeton qui identifie notre serveur auprès du service de push (RFC 8292). */
export async function jetonVapid(endpoint: string, cles: ClesVapid, maintenant = Date.now()) {
  const origine = new URL(endpoint).origin;
  const entete = octetsVersB64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const corps = octetsVersB64url(
    enc.encode(
      JSON.stringify({
        aud: origine,
        // Douze heures : la norme plafonne à vingt-quatre.
        exp: Math.floor(maintenant / 1000) + 12 * 3600,
        sub: cles.contact,
      }),
    ),
  );

  const pub = b64urlVersOctets(cles.publique);
  const cle = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      d: cles.privee,
      x: octetsVersB64url(pub.slice(1, 33)),
      y: octetsVersB64url(pub.slice(33, 65)),
      ext: true,
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  // `crypto.subtle` signe en R‖S brut, qui est exactement la forme attendue
  // par ES256 — contrairement au DER que rendent la plupart des outils.
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      cle,
      enc.encode(`${entete}.${corps}`),
    ),
  );
  return `${entete}.${corps}.${octetsVersB64url(signature)}`;
}

/** Ce qu'il advient d'un envoi, du point de vue de l'appelant. */
export type Issue =
  | { etat: "envoye" }
  /** Le service de push ne connaît plus cet abonnement : à supprimer. */
  | { etat: "perime" }
  | { etat: "echec"; code: number };

/**
 * Envoie un message à un abonnement.
 *
 * Un 404 ou un 410 ne sont pas des pannes : ils disent que le navigateur s'est
 * désabonné (application désinstallée, cache vidé, permission retirée). La
 * ligne doit alors disparaître de la base, sans quoi on paierait éternellement
 * des requêtes pour un destinataire qui n'existe plus.
 */
export async function envoyer(
  abonnement: Abonnement,
  message: string,
  cles: ClesVapid,
  options: { ttl?: number; urgence?: "very-low" | "low" | "normal" | "high" } = {},
): Promise<Issue> {
  const corps = await chiffrer(abonnement, message);
  const jeton = await jetonVapid(abonnement.endpoint, cles);
  const reponse = await fetch(abonnement.endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${jeton}, k=${cles.publique}`,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      // Au-delà, le service de push abandonne. Une invitation à jouer ne vaut
      // plus rien le lendemain : une demi-heure suffit.
      TTL: String(options.ttl ?? 1800),
      Urgency: options.urgence ?? "normal",
    },
    body: corps as BufferSource,
  });
  if (reponse.ok) return { etat: "envoye" };
  if (reponse.status === 404 || reponse.status === 410) return { etat: "perime" };
  return { etat: "echec", code: reponse.status };
}
