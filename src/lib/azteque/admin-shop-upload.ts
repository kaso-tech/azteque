/**
 * PR19 — Upload d'un fichier asset boutique (sticker/son/tapis)
 * depuis la console admin vers Supabase Storage.
 *
 * Côté serveur uniquement : la clé service_role de Supabase n'est
 * disponible que là. Le client encode le fichier en base64 et
 * l'envoie ici, on l'écrit dans le bucket `shop-assets`, on
 * retourne l'URL publique pour que le client puisse la stocker
 * dans `shop_items.asset_url`.
 *
 * Le bucket et la RLS sont créés par la migration PR19a-SQL.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isAdminRpcServer } from "./admin-guard-server";

interface UploadInput {
  /** Identifiant de l'article (utilisé comme nom de fichier). */
  id: string;
  /** MIME type du fichier. */
  mime: string;
  /** Contenu encodé en base64. */
  base64: string;
}

/**
 * Limites côté serveur (doivent matcher celles de la policy Storage).
 * On re-vérifie ici : on ne fait pas confiance aveuglément au client.
 */
const MAX_BYTES = 5 * 1024 * 1024; // 5 Mo
const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
]);

export const uploadShopAsset = createServerFn({
  method: "POST",
  strict: { output: false },
})
  .middleware([requireSupabaseAuth])
  .validator((data: unknown): UploadInput => {
    const d = data as UploadInput;
    if (!d || typeof d.id !== "string" || !d.id.trim()) {
      throw new Error("Identifiant article manquant.");
    }
    if (typeof d.mime !== "string" || !ALLOWED_MIME.has(d.mime)) {
      throw new Error(
        "Type de fichier non autorisé. Formats acceptés : PNG, JPEG, WebP, SVG, MP3, OGG, WAV.",
      );
    }
    if (typeof d.base64 !== "string" || !d.base64) {
      throw new Error("Contenu du fichier manquant.");
    }
    // Estimation : base64 grossit ~33%. Si la string dépasse, on rejette
    // avant même de décompresser — un upload malveillant ne passera pas.
    if (d.base64.length > Math.ceil((MAX_BYTES * 4) / 3) + 16) {
      throw new Error("Fichier trop volumineux (max 5 Mo).");
    }
    return { id: d.id.trim(), mime: d.mime, base64: d.base64 };
  })
  .handler(async ({ data: input, context }): Promise<{ url: string }> => {
    // Garde admin : seul un utilisateur autorisé peut poser des assets.
    const admin = await isAdminRpcServer(context);
    if (!admin) throw new Error("Réservé aux administrateurs.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const bytes = Buffer.from(input.base64, "base64");
    if (bytes.byteLength > MAX_BYTES) {
      throw new Error("Fichier trop volumineux (max 5 Mo).");
    }
    // On dérive l'extension depuis le MIME (l'admin a choisi le fichier,
    // pas le nom, mais l'URL publique en a besoin pour être lisible).
    const ext = EXT_BY_MIME[input.mime] ?? "bin";
    const path = `${input.id}/${Date.now()}.${ext}`;
    const { error } = await supabaseAdmin.storage
      .from("shop-assets")
      .upload(path, bytes, { contentType: input.mime, upsert: true });
    if (error) throw new Error(`Upload impossible : ${error.message}`);
    const { data: pub } = supabaseAdmin.storage.from("shop-assets").getPublicUrl(path);
    return { url: pub.publicUrl };
  });

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
};
