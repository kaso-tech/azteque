import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PlayerAvatar } from "@/components/azteque/avatar";
import { Sticker } from "@/components/azteque/stickers";
import { SHOP_AVATARS, SHOP_MESSAGES, SHOP_STICKERS, type ShopItem } from "@/lib/azteque/shop";
import {
  buyItem,
  currentUserId,
  describeError,
  getMyProfile,
  listPurchases,
  setAvatarKind,
  type Profile,
} from "@/lib/azteque/account";

export const Route = createFileRoute("/boutique")({
  head: () => ({
    meta: [
      { title: "Boutique — Aztèque" },
      {
        name: "description",
        content:
          "Dépensez vos jetons : avatars, stickers et lots de messages pour la discussion en partie.",
      },
    ],
  }),
  component: Boutique,
});

type Etape = "chargement" | "hors-ligne" | "prete";

function Boutique() {
  const [etape, setEtape] = useState<Etape>("chargement");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    const id = await currentUserId().catch(() => null);
    if (!id) {
      setEtape("hors-ligne");
      return;
    }
    const [p, achats] = await Promise.all([
      getMyProfile().catch(() => null),
      listPurchases().catch(() => [] as string[]),
    ]);
    if (!p) {
      setEtape("hors-ligne");
      return;
    }
    setProfile(p);
    setOwned(new Set(achats));
    setEtape("prete");
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  const acheter = (item: ShopItem) => {
    if (busy) return;
    setBusy(item.id);
    setErreur(null);
    setMessage(null);
    buyItem(item.id)
      .then((r) => {
        setProfile((p) => (p ? { ...p, tokens: r.tokens } : p));
        if (r.bought) {
          setOwned((o) => new Set(o).add(item.id));
          setMessage(`${item.name} est à vous.`);
        } else if (r.reason === "owned") {
          setOwned((o) => new Set(o).add(item.id));
        } else {
          setErreur(`Il vous manque ${item.price - r.tokens} jetons pour ${item.name}.`);
        }
      })
      .catch((e: unknown) => setErreur(describeError(e, "Achat impossible.")))
      .finally(() => setBusy(null));
  };

  const porter = (id: string) => {
    setProfile((p) => (p ? { ...p, avatar_kind: id } : p));
    setAvatarKind(id).catch((e: unknown) => {
      void charger();
      setErreur(describeError(e, "Changement d'avatar impossible."));
    });
  };

  const coque = (contenu: React.ReactNode) => (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-4 px-4 py-6">
      <header className="flex items-center justify-between gap-3">
        <Link to="/" className="text-sm text-muted-foreground underline">
          ← Menu
        </Link>
        <h1 className="gold-text font-display text-2xl">Boutique</h1>
        <span className="font-display text-lg font-semibold text-gold">
          🪙 {profile?.tokens ?? 0}
        </span>
      </header>
      {contenu}
    </main>
  );

  if (etape === "chargement") {
    return coque(<p className="mt-10 text-center text-sm text-muted-foreground">Chargement…</p>);
  }

  if (etape === "hors-ligne") {
    return coque(
      <div className="panel mt-6 space-y-3 px-6 py-6 text-center">
        <p className="text-sm text-muted-foreground">
          La boutique demande un compte : c'est lui qui garde vos jetons et vos achats d'un appareil
          à l'autre.
        </p>
        <Link
          to="/online"
          className="inline-block rounded-full border border-gold/50 px-6 py-2 font-display text-sm font-semibold text-gold"
        >
          Se connecter
        </Link>
      </div>,
    );
  }

  const carte = (item: ShopItem, apercu: React.ReactNode, extra?: React.ReactNode) => {
    const acquis = owned.has(item.id);
    const porte = profile?.avatar_kind === item.id;
    return (
      <div
        key={item.id}
        className={cn(
          "flex flex-col items-center gap-2 rounded-lg border p-3 text-center",
          porte ? "border-gold bg-gold/10" : "border-border",
        )}
      >
        {apercu}
        <div>
          <p className="text-sm font-semibold text-foreground">{item.name}</p>
          <p className="text-[0.68rem] text-muted-foreground">{item.hint}</p>
        </div>
        {extra}
        {acquis ? (
          item.kind === "avatar" ? (
            <Button
              size="sm"
              variant={porte ? "outline" : "default"}
              disabled={porte}
              onClick={() => porter(item.id)}
              className="w-full"
            >
              {porte ? "Porté" : "Porter"}
            </Button>
          ) : (
            <span className="text-xs text-emerald-400">✓ Acquis</span>
          )
        ) : (
          <Button
            size="sm"
            className="w-full font-semibold"
            disabled={busy === item.id}
            onClick={() => acheter(item)}
          >
            {busy === item.id ? "…" : `🪙 ${item.price}`}
          </Button>
        )}
      </div>
    );
  };

  return coque(
    <>
      {message && <p className="text-sm text-emerald-400">{message}</p>}
      {erreur && <p className="text-sm text-destructive">{erreur}</p>}

      <section className="panel px-4 py-4">
        <h2 className="font-display text-lg text-gold">Avatars</h2>
        <p className="text-xs text-muted-foreground">
          Le visage que les autres joueurs voient à côté de votre nom.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {SHOP_AVATARS.map((a) =>
            carte(a, <PlayerAvatar className="h-16 w-16" profile={{ avatar_kind: a.id }} />),
          )}
        </div>
      </section>

      <section className="panel px-4 py-4">
        <h2 className="font-display text-lg text-gold">Stickers</h2>
        <p className="text-xs text-muted-foreground">
          À envoyer dans la discussion, pendant la partie.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {SHOP_STICKERS.map((s) => carte(s, <Sticker id={s.id} className="h-16 w-16" />))}
        </div>
      </section>

      <section className="panel px-4 py-4">
        <h2 className="font-display text-lg text-gold">Lots de messages</h2>
        <p className="text-xs text-muted-foreground">
          Cinq phrases prêtes à envoyer, d'un seul geste, sans lâcher ses cartes.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {SHOP_MESSAGES.map((m) =>
            carte(
              m,
              <span className="text-3xl" aria-hidden="true">
                💬
              </span>,
              <ul className="w-full space-y-0.5 text-left text-[0.68rem] text-muted-foreground">
                {m.phrases.map((p) => (
                  <li key={p} className="truncate">
                    « {p} »
                  </li>
                ))}
              </ul>,
            ),
          )}
        </div>
      </section>
    </>,
  );
}
