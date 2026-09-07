/**
 * Les stickers de la boutique.
 *
 * Dessinés ici plutôt que chargés : ils apparaissent dans la conversation d'une
 * partie en cours, où une image à télécharger arriverait toujours trop tard, et
 * ils suivent la palette du jeu au lieu de jurer avec.
 *
 * Chacun tient dans un carré de 64 et se lit encore à quarante pixels, taille à
 * laquelle il s'affiche dans une bulle.
 */

const OR = "#e0b24a";
const OR_SOMBRE = "#b98c22";
const PEAU = "#c08a4e";
const PEAU_OMBRE = "#9d6c39";
const ROUGE = "#d1483a";
const ENCRE = "#231a14";
const CREME = "#f2ead8";

function Bravo() {
  return (
    <>
      {/* Traits de mouvement : sans eux, deux mains ne s'applaudissent pas. */}
      <path
        d="M32 6v6M17 11l3.5 5M47 11l-3.5 5M8 24l6 1.5M56 24l-6 1.5"
        stroke={OR}
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      {/* Main gauche : paume, puis quatre doigts et le pouce. */}
      <g transform="rotate(-18 26 40)">
        <rect x="14" y="30" width="18" height="22" rx="7" fill={PEAU} />
        <path
          d="M17 32v-6a2.5 2.5 0 0 1 5 0v6M22 31v-8a2.5 2.5 0 0 1 5 0v8M27 32v-6a2.5 2.5 0 0 1 5 0v6"
          stroke={PEAU}
          strokeWidth="5"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M14 40c-3-1-5 1-4 4"
          stroke={PEAU}
          strokeWidth="5"
          strokeLinecap="round"
          fill="none"
        />
      </g>
      {/* Main droite, en miroir et plus sombre pour qu'on les distingue. */}
      <g transform="rotate(18 38 40)">
        <rect x="32" y="30" width="18" height="22" rx="7" fill={PEAU_OMBRE} />
        <path
          d="M42 32v-6a2.5 2.5 0 0 1 5 0v6M37 31v-8a2.5 2.5 0 0 1 5 0v8M32 32v-6a2.5 2.5 0 0 1 5 0v6"
          stroke={PEAU_OMBRE}
          strokeWidth="5"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M50 40c3-1 5 1 4 4"
          stroke={PEAU_OMBRE}
          strokeWidth="5"
          strokeLinecap="round"
          fill="none"
        />
      </g>
    </>
  );
}

function Rire() {
  return (
    <>
      <circle cx="32" cy="32" r="22" fill={OR} />
      <path
        d="M20 26c2-3 6-3 8 0M36 26c2-3 6-3 8 0"
        stroke={ENCRE}
        strokeWidth="2.6"
        strokeLinecap="round"
        fill="none"
      />
      <path d="M18 36c0 9 6 14 14 14s14-5 14-14z" fill={ENCRE} />
      <path d="M24 47c4-3 12-3 16 0-4 3-12 3-16 0z" fill={ROUGE} />
      <path d="M50 30c3 3 3 7 1 10-2-3-3-7-1-10z" fill="#7ec8e3" />
    </>
  );
}

function Pitie() {
  return (
    <>
      {/* Deux mains jointes se lisent mal à quarante pixels : le drapeau blanc
          dit la même chose et ne se confond avec rien. */}
      <path d="M18 8v50" stroke={PEAU_OMBRE} strokeWidth="4" strokeLinecap="round" />
      <circle cx="18" cy="7" r="3" fill={OR} />
      <path
        d="M21 12c8-4 15 4 23 0v22c-8 4-15-4-23 0z"
        fill={CREME}
        stroke={OR_SOMBRE}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M21 23c8-4 15 4 23 0"
        stroke={OR_SOMBRE}
        strokeWidth="1.2"
        fill="none"
        opacity="0.5"
      />
    </>
  );
}

function Atout() {
  return (
    <>
      <rect
        x="16"
        y="10"
        width="32"
        height="44"
        rx="4"
        fill={CREME}
        stroke={OR_SOMBRE}
        strokeWidth="2"
      />
      <path
        d="M32 20l3.5 7.2 8 1.2-5.8 5.6 1.4 7.9-7.1-3.7-7.1 3.7 1.4-7.9-5.8-5.6 8-1.2z"
        fill={ROUGE}
      />
      <path d="M20 14h4M44 50h-4" stroke={OR_SOMBRE} strokeWidth="2" strokeLinecap="round" />
      <path
        d="M22 46h20"
        stroke={OR_SOMBRE}
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.6"
      />
    </>
  );
}

function Feu() {
  return (
    <>
      <path
        d="M32 6c-2 8-10 11-10 20 0 4 2 7 4 9-4 1-8 5-8 11 0 7 6 12 14 12s14-5 14-12c0-11-8-14-8-22 0-6-3-13-6-18z"
        fill={ROUGE}
      />
      <path d="M32 24c-1 5-6 7-6 13 0 6 4 10 6 10s6-4 6-10c0-6-5-8-6-13z" fill={OR} />
      <path d="M32 36c0 3-2 4-2 6s1 3 2 3 2-1 2-3-2-3-2-6z" fill={CREME} />
    </>
  );
}

function Couronne() {
  return (
    <>
      <path d="M12 46L8 18l13 10L32 10l11 18 13-10-4 28z" fill={OR} />
      <path d="M12 46h40v6H12z" fill={OR_SOMBRE} />
      <circle cx="32" cy="34" r="3.2" fill={ROUGE} />
      <circle cx="20" cy="37" r="2.4" fill="#1d5240" />
      <circle cx="44" cy="37" r="2.4" fill="#1d5240" />
      <circle cx="8" cy="16" r="2.4" fill={CREME} />
      <circle cx="56" cy="16" r="2.4" fill={CREME} />
      <circle cx="32" cy="8" r="2.6" fill={CREME} />
    </>
  );
}

const DESSINS: Record<string, () => React.JSX.Element> = {
  st_bravo: Bravo,
  st_rire: Rire,
  st_pitie: Pitie,
  st_atout: Atout,
  st_feu: Feu,
  st_couronne: Couronne,
};

/** Vrai si cet identifiant correspond à un sticker dessiné. */
export function isSticker(id: string | null | undefined): boolean {
  return !!id && id in DESSINS;
}

export function Sticker({ id, className }: { id: string; className?: string }) {
  const Dessin = DESSINS[id];
  if (!Dessin) return null;
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="Sticker">
      <Dessin />
    </svg>
  );
}
