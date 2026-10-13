import Image from "next/image";

// A game's header art, or its title set as type when we have no image we're allowed to use
// (games that aren't on Steam).
export default function Artwork({
  title,
  image,
  sizes,
  eager = false,
}: {
  title: string;
  image: string | null;
  sizes: string;
  eager?: boolean;
}) {
  if (image) {
    return (
      <Image src={image} alt={`${title} artwork`} fill loading={eager ? "eager" : "lazy"} sizes={sizes} className="object-cover" />
    );
  }
  return (
    <span className="absolute inset-0 flex items-end bg-raised p-4">
      <span className="font-display text-2xl leading-tight font-bold text-balance text-muted">{title}</span>
    </span>
  );
}
