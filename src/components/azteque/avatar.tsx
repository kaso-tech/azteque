import { useState } from "react";
import { UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Les visages du jeu.
 *
 * Par défaut, la photo du compte Google : c'est celle que le joueur a déjà
 * choisie ailleurs, et il la reconnaît sans rien avoir à faire. À défaut — pas
 * de compte, pas de photo, ou un joueur qui préfère ne pas la montrer — deux
 * portraits dessinés ici, qui n'appellent aucune requête et ne disent rien de
 * plus que ce que leur auteur a bien voulu choisir.
 */

export type AvatarKind = "google" | "homme" | "femme";

export const AVATAR_CHOICES: { kind: AvatarKind; label: string }[] = [
  { kind: "google", label: "Photo Google" },
  { kind: "homme", label: "Homme" },
  { kind: "femme", label: "Femme" },
];

/* ---------- Les deux portraits ---------- */

const PEAU = "#a9713f";
const OMBRE = "#8a5a31";
const FOND = "#12352a";
const HABIT = "#1d5240";
const CHEVEUX = "#1b1310";
const PAGNE = "#c9922f";
const PAGNE_OMBRE = "#a3741f";

/** Le fond, le cou et les épaules : communs aux deux portraits. */
function Buste() {
  return (
    <>
      <circle cx="32" cy="32" r="32" fill={FOND} />
      <path d="M32 40c-3 0-4 0-4 0v7h8v-7s-1 0-4 0z" fill={OMBRE} />
      <path d="M32 44c-11 0-19 7-21 16a32 32 0 0 0 42 0c-2-9-10-16-21-16z" fill={HABIT} />
      <path d="M32 44c-3 0-5 4-5 9h10c0-5-2-9-5-9z" fill={PAGNE} opacity="0.85" />
    </>
  );
}

function VisageHomme() {
  return (
    <svg viewBox="0 0 64 64" role="img" aria-label="Avatar homme" className="h-full w-full">
      <Buste />
      {/* Oreilles, dessinées avant le visage pour qu'il les recouvre. */}
      <circle cx="19.5" cy="28" r="2.6" fill={OMBRE} />
      <circle cx="44.5" cy="28" r="2.6" fill={OMBRE} />
      <ellipse cx="32" cy="27" rx="13" ry="14.5" fill={PEAU} />
      {/* Cheveux ras, avec la ligne du front nette. */}
      <path d="M19 25c0-8 6-13 13-13s13 5 13 13c0-4-4-6-13-6s-13 2-13 6z" fill={CHEVEUX} />
      {/* Barbe courte au menton. */}
      <path d="M24 34c1 5 4 8 8 8s7-3 8-8c-2 3-4 4-8 4s-6-1-8-4z" fill={CHEVEUX} opacity="0.9" />
      <circle cx="27" cy="27" r="1.6" fill="#231a14" />
      <circle cx="37" cy="27" r="1.6" fill="#231a14" />
      <path
        d="M29.5 33.5c1.5 1 3.5 1 5 0"
        stroke="#231a14"
        strokeWidth="1.2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function VisageFemme() {
  return (
    <svg viewBox="0 0 64 64" role="img" aria-label="Avatar femme" className="h-full w-full">
      <Buste />
      <ellipse cx="32" cy="28" rx="12.5" ry="14" fill={PEAU} />
      {/* Foulard noué, à la mode de la région. */}
      <path
        d="M18.5 27c0-10 6-17 13.5-17s13.5 7 13.5 17c0-6-3-10-6-11 2 2 3 4 3 6-3-3-6-4-10.5-4s-8.5 2-10.5 5c-1.5 1.5-3 2.5-3 4z"
        fill={PAGNE}
      />
      <path
        d="M19.5 22c1.5-7 6.5-11 12.5-11s11 4 12.5 11c-2.5-7-6.5-10-12.5-10s-10 3-12.5 10z"
        fill={PAGNE_OMBRE}
      />
      <path d="M44 15c3-2 6-1 7 1s-1 4-3 4c1-2 0-4-4-5z" fill={PAGNE} />
      <path d="M45 20c3 0 5 2 5 4s-3 3-4 1c1-1 1-3-1-5z" fill={PAGNE_OMBRE} />
      {/* Oreilles et anneaux. */}
      <circle cx="19.8" cy="29" r="2.4" fill={OMBRE} />
      <circle cx="44.2" cy="29" r="2.4" fill={OMBRE} />
      <circle cx="19.8" cy="33.5" r="2.1" fill="none" stroke={PAGNE} strokeWidth="1.4" />
      <circle cx="44.2" cy="33.5" r="2.1" fill="none" stroke={PAGNE} strokeWidth="1.4" />
      <circle cx="27" cy="28" r="1.6" fill="#231a14" />
      <circle cx="37" cy="28" r="1.6" fill="#231a14" />
      <path
        d="M29.5 34.5c1.5 1.2 3.5 1.2 5 0"
        stroke="#231a14"
        strokeWidth="1.2"
        strokeLinecap="round"
        fill="none"
      />
      <ellipse cx="24.5" cy="31.5" rx="1.8" ry="1.2" fill="#b8563f" opacity="0.35" />
      <ellipse cx="39.5" cy="31.5" rx="1.8" ry="1.2" fill="#b8563f" opacity="0.35" />
    </svg>
  );
}

export function AvatarArt({ kind }: { kind: "homme" | "femme" }) {
  return kind === "homme" ? <VisageHomme /> : <VisageFemme />;
}

/* ---------- L'avatar d'un joueur ---------- */

export interface AvatarSource {
  avatar_kind?: string | null;
  avatar_url?: string | null;
}

/**
 * L'image d'un joueur, dans son cercle.
 *
 * Une photo Google peut disparaître — compte fermé, adresse expirée — sans que
 * rien ne le signale : le chargement raté ramène alors le portrait neutre,
 * plutôt qu'un cadre vide.
 */
export function PlayerAvatar({
  profile,
  className,
  label,
}: {
  /** Le profil du joueur, ou `null` tant qu'aucun compte n'est ouvert. */
  profile?: AvatarSource | null;
  className?: string;
  label?: string;
}) {
  const [failed, setFailed] = useState(false);
  const kind = profile?.avatar_kind ?? "google";
  const photo = kind === "google" && !failed ? (profile?.avatar_url ?? null) : null;

  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-full border border-gold/45 bg-secondary text-gold shadow-[var(--shadow-card)]",
        className,
      )}
      aria-label={label}
    >
      {photo ? (
        <img
          src={photo}
          alt=""
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : kind === "homme" || kind === "femme" ? (
        <AvatarArt kind={kind} />
      ) : (
        <UserRound className="h-2/3 w-2/3" aria-hidden="true" />
      )}
    </span>
  );
}
