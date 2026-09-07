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

/** Ce qu'un joueur peut porter sans rien acheter. */
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

/* ---------- Les portraits de la boutique ---------- */

const CUIR = "#7a4a20";
const OR = "#e0b24a";
const BLANC = "#e8e2d6";
const TISSU = "#3f7ea8";

/** Yeux et bouche, communs à tous les visages. */
function Traits({ y = 27 }: { y?: number }) {
  return (
    <>
      <circle cx="27" cy={y} r="1.6" fill="#231a14" />
      <circle cx="37" cy={y} r="1.6" fill="#231a14" />
      <path
        d={`M29.5 ${y + 6.5}c1.5 1.1 3.5 1.1 5 0`}
        stroke="#231a14"
        strokeWidth="1.2"
        strokeLinecap="round"
        fill="none"
      />
    </>
  );
}

/** Oreilles, à poser avant le visage pour qu'il les recouvre. */
function Oreilles({ y = 28 }: { y?: number }) {
  return (
    <>
      <circle cx="19.5" cy={y} r="2.6" fill={OMBRE} />
      <circle cx="44.5" cy={y} r="2.6" fill={OMBRE} />
    </>
  );
}

function VisageMarchand() {
  return (
    <svg viewBox="0 0 64 64" role="img" aria-label="Avatar Le Marchand" className="h-full w-full">
      <Buste />
      <Oreilles />
      <ellipse cx="32" cy="27" rx="13" ry="14.5" fill={PEAU} />
      <path d="M19 24c0-7 6-11 13-11s13 4 13 11c-3-3-7-5-13-5s-10 2-13 5z" fill={CHEVEUX} />
      {/* Chapeau plat à large bord. */}
      <ellipse cx="32" cy="17" rx="20" ry="4.5" fill={CUIR} />
      <path d="M22 17c0-6 4-9 10-9s10 3 10 9c-3-2-6-3-10-3s-7 1-10 3z" fill={CUIR} />
      <path d="M22 15.5c6-2 14-2 20 0l.4 1.5c-6-2-14-2-20.8 0z" fill={OR} opacity="0.85" />
      <Traits />
    </svg>
  );
}

function VisageReine() {
  return (
    <svg
      viewBox="0 0 64 64"
      role="img"
      aria-label="Avatar La Reine du marché"
      className="h-full w-full"
    >
      <Buste />
      <Oreilles y={30} />
      <ellipse cx="32" cy="29" rx="12.5" ry="14" fill={PEAU} />
      {/* Foulard noué très haut. */}
      <path d="M19 27c0-9 6-15 13-15s13 6 13 15c-2-6-6-9-13-9s-11 3-13 9z" fill={PAGNE} />
      <path d="M20 15c2-7 7-11 12-11s10 4 12 11c-4-6-8-8-12-8s-8 2-12 8z" fill={PAGNE_OMBRE} />
      <ellipse cx="32" cy="7" rx="11" ry="6" fill={PAGNE} />
      <path d="M23 6c4-3 14-3 18 0-4-2-14-2-18 0z" fill={PAGNE_OMBRE} />
      {/* Collier d'or. */}
      <path
        d="M25 47c2 4 12 4 14 0"
        stroke={OR}
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="32" cy="50.5" r="2.2" fill={OR} />
      <circle cx="19.8" cy="34.5" r="2.2" fill="none" stroke={OR} strokeWidth="1.4" />
      <circle cx="44.2" cy="34.5" r="2.2" fill="none" stroke={OR} strokeWidth="1.4" />
      <Traits y={29} />
    </svg>
  );
}

function VisageGriot() {
  return (
    <svg viewBox="0 0 64 64" role="img" aria-label="Avatar Le Griot" className="h-full w-full">
      <Buste />
      <Oreilles />
      <ellipse cx="32" cy="27" rx="13" ry="14.5" fill={PEAU} />
      {/* Barbe blanche, marque de l'âge et du savoir. */}
      <path d="M20 30c0 10 5 17 12 17s12-7 12-17c-2 6-5 9-12 9s-10-3-12-9z" fill={BLANC} />
      <path d="M28 38c1 2 6 2 8 0-1 3-7 3-8 0z" fill="#c9c1b2" />
      {/* Bonnet brodé. */}
      <path d="M19 22c0-7 6-12 13-12s13 5 13 12z" fill={TISSU} />
      <path d="M19 22h26v3H19z" fill={OR} opacity="0.9" />
      <path d="M25 15h3v3h-3zm11 0h3v3h-3z" fill={OR} opacity="0.6" />
      <Traits />
    </svg>
  );
}

function VisageElegante() {
  return (
    <svg viewBox="0 0 64 64" role="img" aria-label="Avatar L'Élégante" className="h-full w-full">
      <Buste />
      {/* Tresses longues, dessinées derrière le visage. */}
      <path d="M17 26c-2 10-1 20 2 28h5c-3-9-4-19-3-28z" fill={CHEVEUX} />
      <path d="M47 26c2 10 1 20-2 28h-5c3-9 4-19 3-28z" fill={CHEVEUX} />
      <circle cx="19" cy="52" r="2.2" fill={OR} />
      <circle cx="45" cy="52" r="2.2" fill={OR} />
      <Oreilles y={29} />
      <ellipse cx="32" cy="28" rx="12.5" ry="14" fill={PEAU} />
      <path
        d="M18.5 27c0-9 6-15 13.5-15S45.5 18 45.5 27c-2-7-6-10-13.5-10S20.5 20 18.5 27z"
        fill={CHEVEUX}
      />
      <path d="M22 18c4-4 16-4 20 0-5-2-15-2-20 0z" fill="#2e211a" />
      {/* Grands anneaux. */}
      <circle cx="19.5" cy="35" r="3.4" fill="none" stroke={OR} strokeWidth="1.6" />
      <circle cx="44.5" cy="35" r="3.4" fill="none" stroke={OR} strokeWidth="1.6" />
      <Traits y={28} />
    </svg>
  );
}

function VisageRoi() {
  return (
    <svg
      viewBox="0 0 64 64"
      role="img"
      aria-label="Avatar Le Roi Aztèque"
      className="h-full w-full"
    >
      <Buste />
      <Oreilles />
      <ellipse cx="32" cy="28" rx="13" ry="14.5" fill={PEAU} />
      <path d="M19 26c0-7 6-12 13-12s13 5 13 12c-3-4-7-6-13-6s-10 2-13 6z" fill={CHEVEUX} />
      <path d="M24 35c1 5 4 8 8 8s7-3 8-8c-2 3-4 4-8 4s-6-1-8-4z" fill={CHEVEUX} opacity="0.9" />
      {/* Couronne. */}
      <path d="M19 18l3-9 5 5 5-8 5 8 5-5 3 9z" fill={OR} />
      <path d="M19 18h26v4H19z" fill="#c1932f" />
      <circle cx="32" cy="10" r="1.8" fill="#c0392b" />
      <circle cx="23" cy="13.5" r="1.4" fill="#1d5240" />
      <circle cx="41" cy="13.5" r="1.4" fill="#1d5240" />
      <Traits y={28} />
    </svg>
  );
}

/** Tous les visages dessinés, libres et achetés. */
const VISAGES: Record<string, () => React.JSX.Element> = {
  homme: VisageHomme,
  femme: VisageFemme,
  av_marchand: VisageMarchand,
  av_reine: VisageReine,
  av_griot: VisageGriot,
  av_elegante: VisageElegante,
  av_roi: VisageRoi,
};

/** Vrai si cet identifiant correspond à un portrait dessiné. */
export function isDrawnAvatar(kind: string | null | undefined): boolean {
  return !!kind && kind in VISAGES;
}

export function AvatarArt({ kind }: { kind: string }) {
  const Visage = VISAGES[kind];
  return Visage ? <Visage /> : null;
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
      ) : isDrawnAvatar(kind) ? (
        <AvatarArt kind={kind} />
      ) : (
        <UserRound className="h-2/3 w-2/3" aria-hidden="true" />
      )}
    </span>
  );
}
