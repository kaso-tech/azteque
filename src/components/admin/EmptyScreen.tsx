/**
 * Placeholder pour les écrans de la console encore à venir.
 *
 * Une console qui dit "ce n'est pas encore fait" reste lisible ; une console
 * qui cache ses trous, non. Ce composant tient l'emplacement de l'écran à
 * paraître, avec un titre et un sous-titre, en attendant la livraison suivante.
 */
export function EmptyScreen({ title, description }: { title: string; description: string }) {
  return (
    <section className="panel mx-auto max-w-3xl px-6 py-10 text-center">
      <h2 className="font-display text-xl text-gold">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </section>
  );
}
