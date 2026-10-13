import Image from "next/image";
import { useState } from "react";

// A game's header art, or its title set as type when there's no image or it fails to load
// (e.g. a newer Steam app whose header isn't at the classic path).
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
  const [failed, setFailed] = useState<string | null>(null);
  if (image && failed !== image) {
    return (
      <Image
        src={image}
        alt={`${title} artwork`}
        fill
        loading={eager ? "eager" : "lazy"}
        sizes={sizes}
        className="object-cover"
        onError={() => setFailed(image)}
      />
    );
  }
  return (
    <span className="absolute inset-0 flex items-end bg-raised p-4">
      <span className="font-display text-2xl leading-tight font-bold text-balance text-muted">{title}</span>
    </span>
  );
}
