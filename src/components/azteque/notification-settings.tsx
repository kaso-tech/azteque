import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { describeError } from "@/lib/azteque/account";
import { TYPES_NOTIFICATION, type TypeNotification } from "@/lib/azteque/push-config";
import {
  abonnementCourant,
  activerNotifications,
  desactiverNotifications,
  ecrirePreference,
  lirePreferences,
  permissionPush,
  PREFERENCES_PAR_DEFAUT,
  type Permission,
  type Preferences,
} from "@/lib/azteque/push";

/** L'ordre d'affichage : du plus utile au plus bavard. */
const ORDRE: TypeNotification[] = [
  "invitation",
  "appariement",
  "revanche",
  "message",
  "ami_en_ligne",
];

/**
 * Réglage des notifications, dans le profil du joueur.
 *
 * Deux niveaux, et il faut les distinguer : la PERMISSION appartient au
 * navigateur et vaut pour cet appareil — coupée là, plus rien n'arrive nulle
 * part ; les PRÉFÉRENCES appartiennent au compte et valent partout — couper
 * les annonces d'amis les coupe aussi sur le téléphone.
 *
 * Une permission refusée ne se redemande pas : le navigateur ne rouvrira plus
 * la question, et seul un passage par ses propres réglages la rétablit. On le
 * dit, plutôt que de laisser un bouton qui ne fera plus jamais rien.
 */
export function NotificationSettings() {
  const [permission, setPermission] = useState<Permission>("indisponible");
  const [abonne, setAbonne] = useState(false);
  const [prefs, setPrefs] = useState<Preferences>(PREFERENCES_PAR_DEFAUT);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const relire = useCallback(async () => {
    setPermission(permissionPush());
    setAbonne(!!(await abonnementCourant().catch(() => null)));
    setPrefs(await lirePreferences().catch(() => PREFERENCES_PAR_DEFAUT));
  }, []);

  useEffect(() => {
    void relire();
  }, [relire]);

  const activer = () => {
    setBusy(true);
    setErreur(null);
    activerNotifications()
      .then((etat) => {
        setPermission(etat);
        if (etat !== "accordee") return;
        return relire();
      })
      .catch((e: unknown) => setErreur(describeError(e, "Activation impossible.")))
      .finally(() => setBusy(false));
  };

  const couper = () => {
    setBusy(true);
    setErreur(null);
    desactiverNotifications()
      .then(relire)
      .catch((e: unknown) => setErreur(describeError(e, "Désactivation impossible.")))
      .finally(() => setBusy(false));
  };

  const basculer = (type: TypeNotification) => {
    const valeur = !prefs[type];
    // Affiché tout de suite : un interrupteur qui attend le réseau pour
    // bouger donne l'impression de ne pas avoir été touché.
    setPrefs((p) => ({ ...p, [type]: valeur }));
    ecrirePreference(type, valeur).catch((e: unknown) => {
      setPrefs((p) => ({ ...p, [type]: !valeur }));
      setErreur(describeError(e, "Réglage non enregistré."));
    });
  };

  if (permission === "indisponible") {
    return (
      <>
        <p className="mt-6 text-sm text-foreground">Notifications</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Ce navigateur ne les prend pas en charge. Sur iPhone, ajoutez d'abord Aztèque à votre
          écran d'accueil.
        </p>
      </>
    );
  }

  return (
    <>
      <p className="mt-6 text-sm text-foreground">Notifications</p>

      {permission === "refusee" ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Vous les avez refusées pour Aztèque. Votre navigateur ne reposera plus la question : il
          faut les réautoriser depuis ses propres réglages de site.
        </p>
      ) : !abonne ? (
        <>
          <p className="mt-1 text-xs text-muted-foreground">
            Être prévenu quand quelqu'un vous invite, même l'application fermée.
          </p>
          <Button size="sm" className="mt-2 font-semibold" disabled={busy} onClick={activer}>
            {busy ? "…" : "Activer sur cet appareil"}
          </Button>
        </>
      ) : (
        <>
          <p className="mt-1 text-xs text-muted-foreground">
            Actives sur cet appareil. Les réglages ci-dessous valent pour tous vos appareils.
          </p>

          <ul className="mt-3 flex flex-col gap-2">
            {ORDRE.map((type) => (
              <li key={type} className="flex items-center justify-between gap-3">
                <span className="min-w-0 flex-1 text-xs text-foreground">
                  {TYPES_NOTIFICATION[type]}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={prefs[type]}
                  aria-label={TYPES_NOTIFICATION[type]}
                  onClick={() => basculer(type)}
                  className={cn(
                    "relative h-6 w-11 shrink-0 rounded-full border transition-colors",
                    prefs[type]
                      ? "border-gold/60 bg-[image:var(--gradient-gold)]"
                      : "border-border bg-secondary",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 h-4 w-4 rounded-full bg-background transition-transform",
                      prefs[type] ? "translate-x-6" : "translate-x-1",
                    )}
                  />
                </button>
              </li>
            ))}
          </ul>

          <Button size="sm" variant="outline" className="mt-3" disabled={busy} onClick={couper}>
            {busy ? "…" : "Couper sur cet appareil"}
          </Button>
        </>
      )}

      {erreur && <p className="mt-2 text-xs text-destructive">{erreur}</p>}
    </>
  );
}
