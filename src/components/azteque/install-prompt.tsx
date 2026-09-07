import { useEffect, useState } from "react";

/**
 * Propose d'installer l'application, sans dépendre du hasard d'une icône
 * dans la barre d'adresse.
 *
 * Android et iPhone ne s'y prennent pas de la même façon. Chrome (et les
 * navigateurs qui en dérivent) annoncent l'installation par un événement —
 * on le capture pour déclencher la même invite depuis un bouton à nous.
 * Safari sur iPhone n'envoie jamais cet événement : la seule voie est le
 * bouton Partager, et la bannière se contente alors de l'indiquer.
 *
 * Rien de tout cela ne s'affiche si l'application tourne déjà installée
 * (l'utilisateur l'a fait), ni si le joueur a déjà refermé la bannière une
 * fois : l'installation est une offre, pas une relance.
 */

const CLE_MASQUEE = "azteque-install-dismissed";

interface EvenementInstallation extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function tourneEnAutonome(): boolean {
  if (typeof window === "undefined") return false;
  const iosAutonome = (navigator as unknown as { standalone?: boolean }).standalone === true;
  return iosAutonome || window.matchMedia?.("(display-mode: standalone)").matches === true;
}

function estIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function InstallPrompt() {
  const [evenement, setEvenement] = useState<EvenementInstallation | null>(null);
  const [ios, setIos] = useState(false);
  const [masquee, setMasquee] = useState(true);

  useEffect(() => {
    if (tourneEnAutonome()) return;
    try {
      if (localStorage.getItem(CLE_MASQUEE) === "1") return;
    } catch {
      /* tant pis, la bannière s'affichera simplement */
    }
    setIos(estIOS());
    setMasquee(false);

    const onPrompt = (e: Event) => {
      // Chrome afficherait sa propre mini-infobar sans ceci : on la retarde
      // pour ne proposer l'installation qu'au moment choisi par le joueur.
      e.preventDefault();
      setEvenement(e as EvenementInstallation);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const fermer = () => {
    setMasquee(true);
    try {
      localStorage.setItem(CLE_MASQUEE, "1");
    } catch {
      /* la bannière reviendra au prochain chargement, sans plus de gravité */
    }
  };

  const installer = async () => {
    if (!evenement) return;
    void evenement.prompt();
    const choix = await evenement.userChoice.catch(() => null);
    if (choix) fermer();
  };

  // Sur Android/Chrome, tant que l'événement n'est pas encore arrivé, il n'y
  // a rien de fiable à proposer — mieux vaut se taire qu'annoncer un bouton
  // qui ne ferait rien.
  if (masquee || (!ios && !evenement)) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-40 flex items-center gap-3 rounded-xl border border-gold/40 bg-felt-deep/95 px-4 py-3 shadow-[var(--shadow-card)] sm:inset-x-auto sm:right-4 sm:w-96">
      <span className="text-2xl" aria-hidden="true">
        📲
      </span>
      <div className="min-w-0 flex-1 text-xs text-muted-foreground">
        {ios ? (
          <p>
            <span className="font-semibold text-foreground">Installez Aztèque</span> : appuyez sur{" "}
            <span className="text-foreground">Partager</span> puis « Sur l'écran d'accueil ».
          </p>
        ) : (
          <p>
            <span className="font-semibold text-foreground">Installez Aztèque</span> sur cet
            appareil : une icône, plein écran, sans passer par le navigateur.
          </p>
        )}
      </div>
      {!ios && (
        <button
          onClick={() => void installer()}
          className="shrink-0 rounded-full bg-[image:var(--gradient-gold)] px-3 py-1.5 text-xs font-semibold text-primary-foreground"
        >
          Installer
        </button>
      )}
      <button
        onClick={fermer}
        aria-label="Fermer"
        className="shrink-0 text-muted-foreground hover:text-foreground"
      >
        ✕
      </button>
    </div>
  );
}
