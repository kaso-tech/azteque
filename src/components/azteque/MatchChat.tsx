import { useEffect, useRef, useState } from "react";
import { openChat, type ChatMessage } from "@/lib/azteque/online";
import { sfx } from "@/lib/azteque/sfx";

const QUICK_PHRASES = [
  "Bien joué !",
  "Trop fort…",
  "À toi de jouer",
  "Attends de voir",
  "Chanceux !",
  "Bonne partie",
];

const EMOJIS = ["😂", "😎", "😱", "👏", "🔥", "🤝", "🤔", "😅"];

const REACTIONS: { key: "taunt" | "cheer"; label: string; icon: string }[] = [
  { key: "taunt", label: "Moquerie", icon: "😜" },
  { key: "cheer", label: "Acclamation", icon: "🎉" },
];

interface Props {
  matchId: string;
  seat: "host" | "guest";
  myName: string;
}

interface Bubble extends ChatMessage {
  mine: boolean;
  at: number;
}

export function MatchChat({ matchId, seat, myName }: Props) {
  const [open, setOpen] = useState(false);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [draft, setDraft] = useState("");
  const chatRef = useRef<ReturnType<typeof openChat> | null>(null);

  useEffect(() => {
    const chat = openChat(matchId, (msg) => {
      setBubbles((b) => [...b.slice(-5), { ...msg, mine: false, at: Date.now() }]);
      if (msg.reaction === "taunt") sfx.taunt();
      if (msg.reaction === "cheer") sfx.cheer();
    });
    chatRef.current = chat;
    return () => {
      chat.close();
      chatRef.current = null;
    };
  }, [matchId]);

  // Les bulles s'effacent après quelques secondes
  useEffect(() => {
    if (bubbles.length === 0) return;
    const t = setInterval(() => {
      setBubbles((b) => b.filter((x) => Date.now() - x.at < 6000));
    }, 1000);
    return () => clearInterval(t);
  }, [bubbles.length]);

  const send = (text: string, reaction: "taunt" | "cheer" | null = null) => {
    const clean = text.trim().slice(0, 120);
    if (!clean) return;
    const msg: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      seat,
      name: myName,
      text: clean,
      reaction,
    };
    chatRef.current?.send(msg);
    setBubbles((b) => [...b.slice(-5), { ...msg, mine: true, at: Date.now() }]);
    if (reaction === "taunt") sfx.taunt();
    if (reaction === "cheer") sfx.cheer();
    setDraft("");
    setOpen(false);
  };

  return (
    <>
      {/* Bulles flottantes */}
      <div className="pointer-events-none fixed inset-x-0 top-24 z-40 flex flex-col items-center gap-1 px-3">
        {bubbles.map((b) => (
          <span
            key={b.id}
            className={
              b.mine
                ? "max-w-[85%] animate-[banner-in_180ms_ease-out] truncate rounded-full border border-gold/50 bg-felt-deep/95 px-3 py-1 text-[0.7rem] font-semibold text-gold"
                : "max-w-[85%] animate-[banner-in_180ms_ease-out] truncate rounded-full border border-border bg-felt-deep/95 px-3 py-1 text-[0.7rem] font-semibold text-foreground"
            }
          >
            {b.name} : {b.text}
          </span>
        ))}
      </div>

      {/* Bouton d'ouverture */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Ouvrir la discussion"
        className="fixed bottom-4 right-4 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-gold/50 bg-felt-deep/95 text-lg text-gold shadow-lg"
      >
        💬
      </button>

      {open && (
        <div className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md rounded-t-2xl border border-gold/35 bg-felt-deep/98 p-3 shadow-2xl">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[0.7rem] font-semibold uppercase tracking-widest text-gold">
              Discussion
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[0.7rem] text-muted-foreground underline"
            >
              Fermer
            </button>
          </div>

          <div className="mb-2 flex gap-2">
            {REACTIONS.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => send(r.icon, r.key)}
                className="flex-1 rounded-full border border-gold/40 px-2 py-1.5 text-[0.7rem] font-semibold text-gold"
              >
                {r.icon} {r.label}
              </button>
            ))}
          </div>

          <div className="mb-2 flex flex-wrap gap-1.5">
            {QUICK_PHRASES.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => send(p)}
                className="rounded-full border border-border px-2.5 py-1 text-[0.68rem] text-foreground"
              >
                {p}
              </button>
            ))}
          </div>

          <div className="mb-2 flex flex-wrap gap-1.5">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => send(e)}
                className="rounded-full border border-border px-2 py-1 text-base leading-none"
              >
                {e}
              </button>
            ))}
          </div>

          <form
            onSubmit={(ev) => {
              ev.preventDefault();
              send(draft);
            }}
            className="flex gap-2"
          >
            <input
              value={draft}
              onChange={(ev) => setDraft(ev.target.value)}
              maxLength={120}
              placeholder="Message court…"
              className="min-w-0 flex-1 rounded-full border border-border bg-transparent px-3 py-2 text-xs text-foreground outline-none focus:border-gold/60"
            />
            <button
              type="submit"
              className="rounded-full bg-[image:var(--gradient-gold)] px-4 py-2 text-xs font-semibold text-primary-foreground"
            >
              Envoyer
            </button>
          </form>
        </div>
      )}
    </>
  );
}
