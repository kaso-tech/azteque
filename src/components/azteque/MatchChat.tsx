import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { openChat, type ChatMessage } from "@/lib/azteque/online";
import { sfx } from "@/lib/azteque/sfx";
import { cn } from "@/lib/utils";
import { Sticker, isSticker } from "@/components/azteque/stickers";
import { ownedPhrases, ownedSounds, ownedStickers, useCatalogue } from "@/lib/azteque/shop";

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
  /** Articles achetés en boutique : stickers et lots de messages. */
  owned?: ReadonlySet<string>;
  /** PR12 — Refs vers les avatars du header, pour ancrer les bulles. */
  myAvatarRef?: RefObject<HTMLDivElement | null>;
  oppAvatarRef?: RefObject<HTMLDivElement | null>;
}

interface Bubble extends ChatMessage {
  mine: boolean;
  at: number;
}

/** Les bulles flottantes, mêmes dimensions pour un texte ou un sticker. */
const bulle =
  "max-w-[85%] animate-[banner-in_180ms_ease-out] rounded-full border bg-felt-deep/95 px-3 py-1 text-[0.7rem] font-semibold";

export function MatchChat({ matchId, seat, myName, owned, myAvatarRef, oppAvatarRef }: Props) {
  const vide = useMemo(() => new Set<string>(), []);
  const acquis = owned ?? vide;
  const catalogue = useCatalogue();
  const mesStickers = useMemo(() => ownedStickers(acquis, catalogue), [acquis, catalogue]);
  const mesPhrases = useMemo(() => ownedPhrases(acquis, catalogue), [acquis, catalogue]);
  const mesSons = useMemo(() => ownedSounds(acquis, catalogue), [acquis, catalogue]);
  const [open, setOpen] = useState(false);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [draft, setDraft] = useState("");
  const chatRef = useRef<ReturnType<typeof openChat> | null>(null);

  useEffect(() => {
    const chat = openChat(matchId, (msg) => {
      setBubbles((b) => [...b.slice(-5), { ...msg, mine: false, at: Date.now() }]);
      // PR19 — Si l'adversaire a envoyé un fichier audio custom, on le joue.
      if (msg.soundUrl) {
        const audio = new Audio(msg.soundUrl);
        audio.volume = 0.8;
        void audio.play();
      } else if (msg.soundId) {
        // PR14 — Lecture du son à la réception d'un sticker-son.
        switch (msg.soundId) {
          case "laugh": sfx.laugh(); break;
          case "cry": sfx.cry(); break;
          case "taunt": sfx.taunt(); break;
          case "cheer": sfx.cheer(); break;
          default: break;
        }
      }
      if (msg.reaction === "taunt") sfx.taunt();
      if (msg.reaction === "cheer") sfx.cheer();
    });
    chatRef.current = chat;
    return () => {
      chat.close();
      chatRef.current = null;
    };
  }, [matchId]);

  // PR12 — Calcul de la position sous chaque avatar. La bulle est ancrée au
  // centre horizontal de l'avatar et à `bottom: rect.top` (juste sous le
  // header). Le décalage vertical `extra` permet d'empiler les bulles
  // successives sans chevauchement.
  const [positions, setPositions] = useState<
    Record<string, { left: number; top: number }>
  >({});
  useEffect(() => {
    if (bubbles.length === 0) return;
    const recalc = () => {
      const next: Record<string, { left: number; top: number }> = {};
      for (let i = 0; i < bubbles.length; i += 1) {
        const b = bubbles[i]!;
        const ref = b.mine ? myAvatarRef?.current : oppAvatarRef?.current;
        if (!ref) continue;
        const r = ref.getBoundingClientRect();
        next[b.id] = {
          left: r.left + r.width / 2,
          top: r.bottom + 6 + i * 32,
        };
      }
      setPositions(next);
    };
    recalc();
    // Recalcule aussi en cas de resize / scroll de la page.
    window.addEventListener("resize", recalc);
    window.addEventListener("scroll", recalc, true);
    return () => {
      window.removeEventListener("resize", recalc);
      window.removeEventListener("scroll", recalc, true);
    };
  }, [bubbles, myAvatarRef, oppAvatarRef]);

  // Les bulles s'effacent après quelques secondes
  useEffect(() => {
    if (bubbles.length === 0) return;
    const t = setInterval(() => {
      setBubbles((b) => b.filter((x) => Date.now() - x.at < 6000));
    }, 1000);
    return () => clearInterval(t);
  }, [bubbles.length]);

  const send = (
    text: string,
    reaction: "taunt" | "cheer" | null = null,
    sticker: string | null = null,
    soundId: string | null = null,
    soundUrl: string | null = null,
  ) => {
    const clean = text.trim().slice(0, 120);
    if (!clean && !sticker && !soundId && !soundUrl) return;
    const msg: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      seat,
      name: myName,
      text: clean,
      reaction,
      sticker,
      soundId,
      soundUrl,
    };
    chatRef.current?.send(msg);
    setBubbles((b) => [...b.slice(-5), { ...msg, mine: true, at: Date.now() }]);
    // Lecture du son côté émetteur (l'adversaire lira aussi via l'event
    // broadcast). On utilise une table de dispatch pour rester compatible
    // avec n'importe quel SoundId ajouté à l'avenir.
    if (soundUrl) {
      const audio = new Audio(soundUrl);
      audio.volume = 0.8;
      void audio.play();
    } else if (soundId) {
      jouerSon(soundId);
    }
    if (reaction === "taunt") sfx.taunt();
    if (reaction === "cheer") sfx.cheer();
    setDraft("");
    setOpen(false);
  };

  // PR14 — Lecture d'un son par identifiant. Évite un long switch sur
  // chaque SoundId. Tout son non reconnu est silencieusement ignoré.
  const jouerSon = (soundId: string) => {
    switch (soundId) {
      case "laugh": sfx.laugh(); break;
      case "cry": sfx.cry(); break;
      case "taunt": sfx.taunt(); break;
      case "cheer": sfx.cheer(); break;
      default: break;
    }
  };

  return (
    <>
      {/* PR12 — Bulles ancrées sous chaque avatar, sans le nom de l'auteur
          (le contexte « qui parle » est donné par l'avatar juste au-dessus). */}
      <div className="pointer-events-none fixed inset-0 z-40">
        {bubbles.map((b) => {
          const pos = positions[b.id];
          if (!pos) return null;
          return (
            <span
              key={b.id}
              className={cn(
                bulle,
                "absolute -translate-x-1/2",
                b.mine
                  ? "border-gold/50 text-gold"
                  : "border-border text-foreground",
              )}
              style={{ left: pos.left, top: pos.top }}
            >
              {b.sticker && isSticker(b.sticker) ? (
                <Sticker id={b.sticker} className="h-7 w-7" />
              ) : (
                b.text
              )}
            </span>
          );
        })}
      </div>

      {/* PR14 — Barre de boutons stickers-sons, à droite du bouton Message.
          Chaque bouton représente un son acheté ; au clic, le sticker visuel
          est diffusé à l'adversaire et le son se joue localement. Les sons
          non-achetés n'apparaissent pas (filtre par owned). */}
      <div className="fixed bottom-4 right-4 z-40 flex items-end gap-2">
        {mesSons.length > 0 && (
          <div className="flex gap-1.5">
            {mesSons.map((s) => (
              <button
                key={s.id}
                type="button"
                title={s.name}
                onClick={() =>
                  send("", null, s.id, s.soundId ?? null, s.assetUrl ?? null)
                }
                className="grid h-9 w-9 place-items-center rounded-full border border-gold/50 bg-felt-deep/95 shadow-lg hover:border-gold"
              >
                <Sticker id={s.id} assetUrl={s.assetUrl ?? null} className="h-6 w-6" />
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="Ouvrir la discussion"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-gold/50 bg-felt-deep/95 text-lg text-gold shadow-lg"
        >
          💬
        </button>
      </div>

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

          {mesStickers.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {mesStickers.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  title={s.name}
                  onClick={() => send(s.name, null, s.id)}
                  className="rounded-lg border border-gold/40 p-1"
                >
                  <Sticker id={s.art ?? s.id} className="h-8 w-8" />
                </button>
              ))}
            </div>
          )}

          <div className="mb-2 flex flex-wrap gap-1.5">
            {mesPhrases.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => send(p)}
                className="rounded-full border border-gold/40 px-2.5 py-1 text-[0.68rem] text-gold"
              >
                {p}
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
