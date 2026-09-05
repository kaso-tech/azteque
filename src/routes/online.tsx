import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  createMatch,
  joinMatch,
  normalizeCode,
  subscribeMatch,
  type MatchRow,
} from "@/lib/azteque/online";

export const Route = createFileRoute("/online")({
  validateSearch: (search: Record<string, unknown>): { code?: string } =>
    typeof search["code"] === "string" ? { code: search["code"] as string } : {},

  head: () => ({
    meta: [
      { title: "Aztèque en ligne — Jouer à deux avec un code de partie" },
      {
        name: "description",
        content:
          "Créez une partie d'Aztèque, partagez le code ou le lien d'invitation, et affrontez un ami en temps réel.",
      },
      { property: "og:title", content: "Aztèque en ligne — Jouer à deux" },
      {
        property: "og:description",
        content: "Code de partie, lien d'invitation et table synchronisée en temps réel.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OnlineLobby,
});

function OnlineLobby() {
  const { code: codeParam } = Route.useSearch();
  const [name, setName] = useState("Joueur");
  const [codeInput, setCodeInput] = useState(codeParam ? normalizeCode(codeParam) : "");
  const [match, setMatch] = useState<MatchRow | null>(null);
  const [role, setRole] = useState<"host" | "guest" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const unsub = useRef<(() => void) | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("azteque-player-name")?.trim();
      if (saved) setName(saved);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => () => unsub.current?.(), []);

  const watch = useCallback((row: MatchRow) => {
    setMatch(row);
    unsub.current?.();
    unsub.current = subscribeMatch(row.id, (next) => setMatch(next));
  }, []);

  const persistName = () => {
    try {
      localStorage.setItem("azteque-player-name", name.trim() || "Joueur");
    } catch {
      /* ignore */
    }
  };

  const onCreate = async () => {
    setBusy(true);
    setError(null);
    persistName();
    try {
      const row = await createMatch(name.trim() || "Joueur");
      setRole("host");
      watch(row);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Création impossible.");
    } finally {
      setBusy(false);
    }
  };

  const onJoin = async () => {
    setBusy(true);
    setError(null);
    persistName();
    try {
      const row = await joinMatch(codeInput, name.trim() || "Joueur");
      setRole("guest");
      watch(row);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de rejoindre.");
    } finally {
      setBusy(false);
    }
  };

  const inviteLink =
    match && typeof window !== "undefined"
      ? `${window.location.origin}/online?code=${match.code}`
      : "";

  const share = async () => {
    if (!inviteLink) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Partie d'Aztèque", text: `Rejoins ma partie : ${match?.code}`, url: inviteLink });
        return;
      }
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  };

  if (match) {
    const ready = Boolean(match.guest_name);
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-6 px-6 py-12 text-center">
        <h1 className="gold-text text-4xl">Salon de partie</h1>
        <div className="panel w-full px-6 py-6">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Code de partie</p>
          <p className="gold-text mt-2 font-display text-5xl tracking-[0.25em]">{match.code}</p>
          <div className="mt-5 space-y-1 text-sm">
            <p>
              <span className="text-muted-foreground">Hôte :</span> {match.host_name}
            </p>
            <p>
              <span className="text-muted-foreground">Invité :</span>{" "}
              {match.guest_name ?? "en attente…"}
            </p>
          </div>
          <div className="mt-6 flex flex-col gap-2">
            <Button onClick={share} variant="secondary">
              {copied ? "Lien copié !" : "Partager l'invitation"}
            </Button>
            <Button disabled={!ready} className="font-semibold">
              {ready ? "La table arrive (prochaine étape)" : "En attente du second joueur…"}
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Vous êtes {role === "host" ? "l'hôte" : "l'invité"}. Gardez cet écran ouvert.
        </p>
        <Link to="/" className="text-xs text-gold underline">
          Retour au menu
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-6 px-6 py-12 text-center">
      <h1 className="gold-text text-4xl">Jouer en ligne</h1>
      <p className="text-sm text-muted-foreground">
        Créez une partie et partagez le code, ou saisissez le code reçu d'un ami.
      </p>

      <div className="panel w-full space-y-4 px-6 py-6 text-left">
        <label className="block text-sm">
          <span className="text-muted-foreground">Votre pseudo</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={18}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </label>

        <Button onClick={onCreate} disabled={busy} className="w-full font-semibold">
          Créer une partie
        </Button>

        <div className="flex items-center gap-3 text-xs uppercase tracking-widest text-muted-foreground">
          <span className="h-px flex-1 bg-border" /> ou <span className="h-px flex-1 bg-border" />
        </div>

        <label className="block text-sm">
          <span className="text-muted-foreground">Code reçu</span>
          <input
            value={codeInput}
            onChange={(e) => setCodeInput(normalizeCode(e.target.value))}
            placeholder="AZ7K2"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-center font-display text-lg tracking-[0.3em]"
          />
        </label>
        <Button
          onClick={onJoin}
          disabled={busy || codeInput.length < 4}
          variant="secondary"
          className="w-full"
        >
          Rejoindre la partie
        </Button>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <Link to="/" className="text-xs text-gold underline">
        Retour au menu
      </Link>
    </main>
  );
}
