/**
 * Les messages que l'administration adresse à un joueur.
 *
 * Sens unique : l'administration annonce — une suspension expliquée, une
 * réponse à un signalement, un mot pour un cadeau — et le joueur lit. Voir la
 * migration `messages_aux_joueurs` pour ce que la base autorise : chacun ne
 * lit que ce qui lui est adressé, et personne ne peut écrire en son nom.
 *
 * Un message non lu doit être VU : il ne suffit pas de l'écrire. C'est
 * `MessageInbox`, monté à la racine, qui le présente au joueur où qu'il soit
 * dans l'application — comme les invitations à jouer.
 */
import { supabase } from "@/lib/azteque/supabase-client";

export interface MessageRecu {
  id: number;
  body: string;
  created_at: string;
}

const rpc = (nom: string, args: Record<string, unknown> = {}) =>
  (
    supabase as unknown as {
      rpc: (n: string, a: Record<string, unknown>) => ReturnType<typeof supabase.rpc>;
    }
  ).rpc(nom, args);

const anyTable = (nom: string) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabase as unknown as { from: (t: string) => any }).from(nom);

/**
 * Les messages non lus, les plus anciens d'abord.
 *
 * La table est fermée par une politique de lecture qui ne laisse voir que ses
 * propres lignes : inutile de filtrer sur le joueur ici, la base s'en charge
 * et ne ferait pas confiance à un filtre venu du navigateur de toute façon.
 */
export async function messagesNonLus(limite = 10): Promise<MessageRecu[]> {
  const { data, error } = await anyTable("player_messages")
    .select("id, body, created_at")
    .is("read_at", null)
    .order("created_at", { ascending: true })
    .limit(limite);
  if (error) throw error;
  return (data as MessageRecu[] | null) ?? [];
}

/** Marque comme lus les messages indiqués. */
export async function marquerLus(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await rpc("mark_my_messages_read", { _ids: ids });
  if (error) throw error;
}
