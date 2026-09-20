import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { currentUserId, onAuthChange } from "@/lib/azteque/account";
import { marquerLus, messagesNonLus, type MessageRecu } from "@/lib/azteque/messages";

const MESSAGE_TOAST_ID = "message-administration";

/**
 * Les messages de l'administration, présentés au joueur où qu'il soit.
 *
 * Monté à la racine, comme `InviteManager` : un message écrit depuis la
 * console ne sert à rien s'il attend dans un écran que personne n'ouvre.
 *
 * Présenté en POPUP et non en panneau bloquant, pour la même raison que les
 * invitations : il peut tomber en pleine réflexion, pendant que le compte à
 * rebours du tour tourne. Un écran bloquant ferait alors perdre le tour à qui
 * le lit. Il ne s'écarte pas non plus d'un glissement — seul « J'ai lu »
 * le referme, sans quoi un message important disparaîtrait d'un geste distrait
 * pour ne plus jamais revenir.
 *
 * Les messages ne sont PAS suivis en temps réel : ils arrivent à l'ouverture
 * de l'application et au retour sur l'onglet. C'est exactement ce que la
 * console promet à l'administrateur qui l'écrit — « il le lira à sa prochaine
 * ouverture » — et cela évite de tenir un canal ouvert pour un usage rare.
 */
export function MessageInbox() {
  const [userId, setUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRecu[]>([]);

  useEffect(() => {
    let vivant = true;
    currentUserId()
      .then((id) => vivant && setUserId(id))
      .catch(() => {});
    const off = onAuthChange((id) => setUserId(id));
    return () => {
      vivant = false;
      off();
    };
  }, []);

  const relire = useCallback(() => {
    if (!userId) {
      setMessages([]);
      return;
    }
    messagesNonLus()
      .then(setMessages)
      .catch(() => {
        /* la prochaine ouverture réessaiera : rien d'urgent ici */
      });
  }, [userId]);

  useEffect(() => {
    relire();
  }, [relire]);

  // Retour sur l'onglet : un message a pu être écrit entre-temps.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const auRetour = () => {
      if (!document.hidden) relire();
    };
    document.addEventListener("visibilitychange", auRetour);
    return () => document.removeEventListener("visibilitychange", auRetour);
  }, [relire]);

  const premier = messages[0] ?? null;

  const lu = useCallback((message: MessageRecu) => {
    // Retiré de la liste tout de suite : le message suivant prend sa place
    // sans attendre le serveur, et un échec réseau le ramènera simplement à
    // la prochaine ouverture plutôt que de bloquer la pile ici.
    setMessages((v) => v.filter((m) => m.id !== message.id));
    void marquerLus([message.id]).catch(() => {});
  }, []);

  useEffect(() => {
    if (!premier) {
      toast.dismiss(MESSAGE_TOAST_ID);
      return;
    }
    toast.custom(
      () => (
        <div className="panel w-full max-w-sm p-4 text-left shadow-2xl">
          <p className="text-[0.7rem] font-semibold uppercase tracking-widest text-gold">
            Message de l'administration
          </p>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm text-foreground">
            {premier.body}
          </p>
          <button
            type="button"
            onClick={() => lu(premier)}
            className="mt-3 w-full rounded-full bg-[image:var(--gradient-gold)] px-4 py-1.5 text-xs font-semibold text-primary-foreground"
          >
            J'ai lu
            {messages.length > 1
              ? ` · ${messages.length - 1} autre${messages.length > 2 ? "s" : ""}`
              : ""}
          </button>
        </div>
      ),
      {
        id: MESSAGE_TOAST_ID,
        duration: Infinity,
        unstyled: true,
        dismissible: false,
      },
    );
  }, [premier, messages.length, lu]);

  useEffect(() => () => void toast.dismiss(MESSAGE_TOAST_ID), []);

  return null;
}
