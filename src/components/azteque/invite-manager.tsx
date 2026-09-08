import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PlayerAvatar } from "@/components/azteque/avatar";
import { RankBadge } from "@/components/azteque/rank";
import {
  acceptInvite,
  currentUserId,
  describeError,
  getPublicProfile,
  listFriends,
  listIncomingInvites,
  onAuthChange,
  respondInvite,
  snoozeInvite,
  subscribeInvites,
  subscribeOutgoingInvites,
  trackLobbyPresence,
  type Friend,
  type GameInvite,
} from "@/lib/azteque/account";
import { currentGameSession, onFreed } from "@/lib/azteque/game-session";

/**
 * Filet de sécurité si aucune fin de tour ne survient pour réveiller un
 * report : un joueur qui a répondu « Plus tard » sans être en pleine partie
 * (simple curiosité, aucune partie en cours) n'aurait sinon aucun moment
 * naturel où la question revient — elle serait reportée pour toujours.
 */
const SNOOZE_FALLBACK_MS = 3 * 60 * 1000;

/** Pause minimale entre deux annonces de connexion pour le même ami. */
const FRIEND_TOAST_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * Gestionnaire global des invitations à jouer.
 *
 * Monté une fois à la racine de l'application, il fonctionne quel que soit
 * l'écran affiché — accueil, partie contre l'IA, table en ligne — puisque
 * recevoir une invitation ne doit pas dépendre d'être sur le salon en ligne
 * au bon moment. C'est aussi lui qui prévient l'expéditeur quand sa demande
 * est refusée ou reportée, et qui signale l'arrivée d'un ami en ligne.
 *
 * Volontairement SANS fond assombri : contrairement aux panneaux ordinaires
 * du jeu, cette carte peut apparaître EN PLEINE RÉFLEXION, pendant que le
 * compte à rebours du tour tourne. Un écran bloquant empêcherait alors de
 * voir ses cartes — et ferait perdre le tour pendant qu'on répond. Seule la
 * confirmation d'abandon de la partie en cours, une décision délibérée et
 * rare, s'autorise l'écran bloquant habituel.
 */
export function InviteManager() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);

  /* ---------- Session ---------- */

  useEffect(() => {
    let alive = true;
    currentUserId()
      .then((id) => alive && setUserId(id))
      .catch(() => {});
    const off = onAuthChange((id) => setUserId(id));
    return () => {
      alive = false;
      off();
    };
  }, []);

  /* ---------- Invitations reçues ---------- */

  const [invites, setInvites] = useState<GameInvite[]>([]);
  const [snoozedIds, setSnoozedIds] = useState<Set<string>>(new Set());
  const [busyWarning, setBusyWarning] = useState<GameInvite | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const snoozeTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const refreshIncoming = useCallback(() => {
    if (!userId) {
      setInvites([]);
      return;
    }
    listIncomingInvites()
      .then(setInvites)
      .catch(() => {
        /* la prochaine notification temps réel redéclenchera une lecture */
      });
  }, [userId]);

  useEffect(() => {
    refreshIncoming();
    if (!userId) return;
    return subscribeInvites(userId, refreshIncoming);
  }, [userId, refreshIncoming]);

  // Une invitation qui disparaît (retirée par l'hôte, ou traitée depuis un
  // autre onglet) n'a plus de raison de garder son report ni son minuteur.
  useEffect(() => {
    const known = new Set(invites.map((i) => i.id));
    for (const [id, t] of snoozeTimers.current) {
      if (!known.has(id)) {
        clearTimeout(t);
        snoozeTimers.current.delete(id);
      }
    }
    setSnoozedIds((cur) => {
      const next = new Set([...cur].filter((id) => known.has(id)));
      return next.size === cur.size ? cur : next;
    });
  }, [invites]);

  // Fin de tour, fin de partie, ou abandon de la partie en cours : c'est le
  // seul moment où une invitation reportée a le droit de réapparaître.
  useEffect(() => onFreed(() => setSnoozedIds(new Set())), []);

  useEffect(
    () => () => {
      for (const t of snoozeTimers.current.values()) clearTimeout(t);
    },
    [],
  );

  const visible = invites.find((i) => !snoozedIds.has(i.id)) ?? null;
  const waitingCount = invites.length - (visible ? 1 : 0);

  const doAccept = useCallback(
    (invite: GameInvite) => {
      setBusy(true);
      setError(null);
      acceptInvite(invite.id)
        .then((match) => {
          if (!match) throw new Error("Cette partie n'est plus disponible.");
          setInvites((cur) => cur.filter((i) => i.id !== invite.id));
          void navigate({ to: "/match/$id", params: { id: match.id }, search: { seat: "guest" } });
        })
        .catch((e: unknown) => setError(describeError(e, "Impossible de rejoindre.")))
        .finally(() => setBusy(false));
    },
    [navigate],
  );

  const accept = (invite: GameInvite) => {
    // Une partie interrompue sans prévenir laisserait un adversaire dans le
    // vide (en ligne) ou une partie en cours abandonnée sans un mot (solo) :
    // on le demande explicitement plutôt que de trancher à sa place.
    if (currentGameSession()) {
      setBusyWarning(invite);
      return;
    }
    doAccept(invite);
  };

  const confirmLeaveAndAccept = () => {
    if (!busyWarning) return;
    const invite = busyWarning;
    setBusyWarning(null);
    currentGameSession()?.leave();
    doAccept(invite);
  };

  const decline = (invite: GameInvite) => {
    setInvites((cur) => cur.filter((i) => i.id !== invite.id));
    const t = snoozeTimers.current.get(invite.id);
    if (t) {
      clearTimeout(t);
      snoozeTimers.current.delete(invite.id);
    }
    respondInvite(invite.id, "declined").catch(() => {
      // Refusé quand même localement : au pire l'hôte la voit encore une
      // fois si la mise à jour n'a pas abouti, ce qui reste sans danger.
    });
  };

  const later = (invite: GameInvite) => {
    setSnoozedIds((cur) => new Set(cur).add(invite.id));
    snoozeInvite(invite.id).catch(() => {});
    const previous = snoozeTimers.current.get(invite.id);
    if (previous) clearTimeout(previous);
    const t = setTimeout(() => {
      setSnoozedIds((cur) => {
        if (!cur.has(invite.id)) return cur;
        const next = new Set(cur);
        next.delete(invite.id);
        return next;
      });
    }, SNOOZE_FALLBACK_MS);
    snoozeTimers.current.set(invite.id, t);
  };

  /* ---------- Ce que devient une invitation qu'on a soi-même envoyée ---------- */

  const toastedDecline = useRef<Set<string>>(new Set());
  const lastSnoozedAt = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!userId) return;
    return subscribeOutgoingInvites(userId, (row) => {
      if (row.status === "declined") {
        if (toastedDecline.current.has(row.id)) return;
        toastedDecline.current.add(row.id);
        getPublicProfile(row.to_id)
          .then((p) => {
            toast(`${p?.username ?? "Votre invité"} a décliné l'invitation.`);
          })
          .catch(() => toast("Votre invitation a été déclinée."));
        return;
      }
      if (!row.snoozed_at) return;
      if (lastSnoozedAt.current.get(row.id) === row.snoozed_at) return; // déjà annoncé
      lastSnoozedAt.current.set(row.id, row.snoozed_at);
      getPublicProfile(row.to_id)
        .then((p) => {
          toast(`${p?.username ?? "Votre invité"} termine sa partie en cours et vous rejoindra.`);
        })
        .catch(() => toast("Votre invité termine sa partie en cours et vous rejoindra."));
    });
  }, [userId]);

  /* ---------- Amis qui se connectent ---------- */

  const friendsById = useRef<Map<string, Friend>>(new Map());
  useEffect(() => {
    if (!userId) {
      friendsById.current = new Map();
      return;
    }
    let alive = true;
    const load = () => {
      listFriends()
        .then((list) => {
          if (!alive) return;
          friendsById.current = new Map(
            list.filter((f) => f.status === "accepted").map((f) => [f.id, f]),
          );
        })
        .catch(() => {});
    };
    load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [userId]);

  const lastFriendToast = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    if (!userId) return;
    // `null` tant que la première synchronisation n'est pas arrivée : elle
    // liste tous les amis déjà en ligne, ce n'est pas une « connexion » —
    // sans cette garde, ouvrir l'application annoncerait tout le monde
    // d'un coup, ce qui est précisément la rafale à éviter.
    let baseline: Set<string> | null = null;
    return trackLobbyPresence(userId, (nowOnline) => {
      const previous = baseline;
      baseline = nowOnline;
      if (!previous) return;
      const now = Date.now();
      for (const id of nowOnline) {
        if (previous.has(id)) continue;
        const friend = friendsById.current.get(id);
        if (!friend) continue;
        const last = lastFriendToast.current.get(id) ?? 0;
        if (now - last < FRIEND_TOAST_COOLDOWN_MS) continue;
        lastFriendToast.current.set(id, now);
        toast(`${friend.username} vient de se connecter`, {
          description: "Retrouvez-le dans le salon en ligne pour l'inviter à jouer.",
        });
      }
    });
  }, [userId]);

  /* ---------- Rendu ---------- */

  if (!visible && !busyWarning) return null;

  if (busyWarning) {
    return (
      <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-6">
        <div className="panel w-full max-w-sm p-6 text-center">
          <h2 className="gold-text text-2xl">Rejoindre {busyWarning.from_username} ?</h2>
          <p className="mt-3 text-xs text-muted-foreground">
            Une partie est en cours. En rejoignant cette invitation, vous quittez votre partie
            actuelle — elle comptera comme abandonnée.
          </p>
          <div className="mt-5 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setBusyWarning(null)}
              className="rounded-full border border-border px-5 py-2 text-sm text-muted-foreground"
            >
              Rester ici
            </button>
            <button
              type="button"
              onClick={confirmLeaveAndAccept}
              className="rounded-full bg-destructive-solid px-5 py-2 text-sm font-semibold text-destructive-foreground"
            >
              Quitter et rejoindre
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-[80] flex justify-center sm:inset-x-auto sm:bottom-6 sm:right-6 sm:justify-end">
      <div className="panel w-full max-w-sm p-4 text-left shadow-2xl">
        <div className="flex items-center gap-3">
          <PlayerAvatar className="h-11 w-11 shrink-0" profile={visible.from_avatar ?? null} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-foreground">
              <span className="font-semibold text-gold">{visible.from_username}</span> vous invite à
              jouer
            </p>
            {visible.from_rating !== undefined && (
              <RankBadge rating={visible.from_rating} compact />
            )}
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <Button size="sm" className="flex-1" disabled={busy} onClick={() => accept(visible)}>
            Accepter
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            disabled={busy}
            onClick={() => later(visible)}
          >
            Plus tard
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 text-destructive hover:text-destructive"
            disabled={busy}
            onClick={() => decline(visible)}
          >
            Refuser
          </Button>
        </div>

        {waitingCount > 0 && (
          <p className="mt-2 text-[0.65rem] text-muted-foreground">
            +{waitingCount} autre{waitingCount > 1 ? "s" : ""} invitation
            {waitingCount > 1 ? "s" : ""} en attente
          </p>
        )}
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}
