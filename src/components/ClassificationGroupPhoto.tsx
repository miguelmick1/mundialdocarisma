"use client";

import { useEffect, useState } from "react";

const PHOTOS = [
  { src: "/historia/turma-2002.jpeg", label: "A turma no começo da história" },
  { src: "/historia/turma-intermediaria.jpeg", label: "Mais um capítulo da nossa história" },
  { src: "/historia/turma-2026.jpeg", label: "A turma em 2026" },
] as const;

export default function ClassificationGroupPhoto() {
  const [photoIndex, setPhotoIndex] = useState<number | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("classification-group-photo");
    const previous = stored == null ? -1 : Number(stored);
    const choices = PHOTOS.map((_, index) => index).filter((index) => index !== previous);
    const next = choices[Math.floor(Math.random() * choices.length)] ?? 0;
    sessionStorage.setItem("classification-group-photo", String(next));
    setPhotoIndex(next);
  }, []);

  const photo = PHOTOS[photoIndex ?? 0];
  return <figure className={`classification-group-photo ${photoIndex == null ? "loading" : ""}`}>
    <img src={photo.src} alt={photo.label} />
    <figcaption><span>Nosso bolão, nossa história</span><strong>{photo.label}</strong></figcaption>
  </figure>;
}
