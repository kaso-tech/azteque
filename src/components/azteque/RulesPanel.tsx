interface Props {
  onClose: () => void;
}

const sections: { title: string; body: string[] }[] = [
  {
    title: "1. Présentation",
    body: [
      "Aztèque est un jeu traditionnel de cartes d'Afrique de l'Ouest. Il repose sur la conquête des plis, la collecte des bonnes, la réalisation des comptes, la création d'un atout en cours de partie et la maîtrise de la phase finale.",
    ],
  },
  {
    title: "2. Matériel",
    body: [
      "Deux jeux de 52 cartes, sans Jokers, sans les cartes de 2 à 6, soit 64 cartes : 7, 8, 9, Valet, Dame, Roi, 10, As.",
    ],
  },
  {
    title: "3. Distribution",
    body: [
      "Six cartes par joueur, le reste forme la pioche. Le joueur ayant remporté la main du tour précédent distribue ; l'autre mène le premier pli.",
    ],
  },
  {
    title: "4. Hiérarchie",
    body: ["7 < 8 < 9 < Valet < Dame < Roi < 10 < As"],
  },
  {
    title: "5. Déroulement d'un pli",
    body: [
      "Tant que la pioche contient des cartes, le second joueur joue librement : ni obligation de fournir, ni de couper.",
      "Même couleur : la plus forte gagne. Couleurs différentes sans atout : la première carte jouée domine. Cartes identiques : la première jouée gagne. L'atout domine toute autre couleur.",
      "Le vainqueur ramasse le pli, pioche et mène le pli suivant.",
    ],
  },
  {
    title: "6. Les comptes",
    body: [
      "Compte simple : Roi + Dame de même couleur. Compte triple : Roi + Dame + Valet.",
      "Il n'existe que ces deux comptes. Roi + Valet ou Dame + Valet ne forment jamais un compte.",
      "Main blanche : si après la distribution un joueur n'a ni Roi, ni Dame, ni Valet, il peut demander une redistribution (ce n'est pas une obligation).",
      "Annoncer est facultatif : il faut venir de remporter un pli et que la pioche contienne au moins une carte. Les cartes restent en main, posées face visible.",
      "Le premier compte annoncé crée l'atout. Si plusieurs comptes sont annoncés en même temps, le joueur choisit celui qui fixe l'atout.",
      "Premier compte : simple 4 pts, triple 5 pts. Comptes suivants : simple 2 pts, triple 3 pts.",
    ],
  },
  {
    title: "7. Compléter un compte",
    body: [
      "Après un compte simple, si le Valet correspondant est pioché au tout premier tirage suivant l'annonce, le compte devient triple.",
    ],
  },
  {
    title: "8. Phase finale (pioche vide)",
    body: [
      "Plus aucun compte ne peut être annoncé. Le second joueur doit fournir la couleur et battre s'il le peut ; sinon il joue sa plus forte carte de la couleur.",
      "Protection d'une bonne : si cette plus forte carte est un 10 ou un As qui serait perdu, il peut jouer la carte immédiatement inférieure.",
    ],
  },
  {
    title: "9. Points",
    body: [
      "Bonne (10 ou As) : 1 point. Main (dernier pli) : 1 point. Comptes selon leur valeur.",
      "Capturer le 10 d'atout de l'adversaire fait récupérer toutes les bonnes qu'il avait gagnées.",
    ],
  },
  {
    title: "10. Victoire",
    body: [
      "Le champ est remporté par le premier joueur gagnant trois tours, ou immédiatement par tout joueur obtenant au moins treize bonnes en un seul tour.",
    ],
  },
];

export function RulesPanel({ onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="panel max-h-[88dvh] w-full max-w-2xl overflow-y-auto p-6 sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="gold-text text-2xl">Règlement officiel</h2>
            <p className="text-xs text-muted-foreground">Aztèque — Version 1.0</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-gold/30 px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-secondary"
          >
            Fermer
          </button>
        </div>
        <div className="space-y-5">
          {sections.map((s) => (
            <section key={s.title}>
              <h3 className="mb-1 text-sm font-semibold text-gold">{s.title}</h3>
              {s.body.map((p, i) => (
                <p key={i} className="text-sm leading-relaxed text-muted-foreground">
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
