import { supabase } from "@/integrations/supabase/client";

export type MatchStatus = "waiting" | "playing" | "finished";

export interface MatchRow {
  id: string;
  code: string;
  host_name: string;
  guest_name: string | null;
  status: MatchStatus;
  state: unknown | null;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function makeCode(len = 5) {
  let out = "";
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  for (let i = 0; i < len; i += 1) out += ALPHABET[buf[i]! % ALPHABET.length];
  return out;
}

export function normalizeCode(raw: string) {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
}

export async function createMatch(hostName: string, settings: Record<string, unknown> = {}) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = makeCode();
    const { data, error } = await supabase
      .from("matches")
      .insert({ code, host_name: hostName || "Hôte", status: "waiting", settings })
      .select()
      .single();
    if (!error && data) return data as unknown as MatchRow;
    if (error && !error.message.toLowerCase().includes("duplicate")) throw error;
  }
  throw new Error("Impossible de générer un code de partie");
}

export async function findMatch(code: string) {
  const { data, error } = await supabase
    .from("matches")
    .select("*")
    .eq("code", normalizeCode(code))
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as MatchRow | null) ?? null;
}

export async function joinMatch(code: string, guestName: string) {
  const match = await findMatch(code);
  if (!match) throw new Error("Aucune partie ne correspond à ce code.");
  if (match.guest_name && match.guest_name !== guestName) {
    throw new Error("Cette partie est déjà complète.");
  }
  const { data, error } = await supabase
    .from("matches")
    .update({ guest_name: guestName || "Invité", status: "playing" })
    .eq("id", match.id)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as MatchRow;
}

export async function pushMatchState(id: string, state: unknown, status: MatchStatus = "playing") {
  const { error } = await supabase.from("matches").update({ state, status }).eq("id", id);
  if (error) throw error;
}

export function subscribeMatch(id: string, onChange: (row: MatchRow) => void) {
  const channel = supabase
    .channel(`match-${id}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "matches", filter: `id=eq.${id}` },
      (payload) => onChange(payload.new as unknown as MatchRow),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
