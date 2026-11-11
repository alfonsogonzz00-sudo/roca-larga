import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Roca Larga · Caravelle F.C. vs S.D. Monecillo",
    short_name: "Roca Larga",
    description: "Partidos, estadísticas, votaciones MVP y pronósticos de Caravelle F.C. y S.D. Monecillo.",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b0f0c",
    theme_color: "#0b0f0c",
    lang: "es-ES",
    categories: ["sports"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
