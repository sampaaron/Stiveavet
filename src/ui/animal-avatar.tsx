import { cn } from "./cn";

/**
 * Pastille d'un animal : son initiale, teintée selon l'espèce. Plus lisible qu'une icône
 * identique pour tous, et la couleur seule ne porte aucune information.
 */
export function AnimalAvatar({
  name,
  species,
  size = "md",
}: {
  name: string;
  species: "dog" | "cat";
  size?: "md" | "lg";
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center font-display font-semibold ring-1 ring-black/5",
        species === "dog"
          ? "bg-brand-soft text-brand-ink"
          : "bg-accent/10 text-accent",
        size === "lg"
          ? "size-16 rounded-[20px] text-3xl"
          : "size-10 rounded-full text-lg",
      )}
    >
      {name.trim().charAt(0).toLocaleUpperCase("fr") || "?"}
    </span>
  );
}
