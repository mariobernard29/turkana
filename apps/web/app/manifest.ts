import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Turkana POS",
    short_name: "Turkana POS",
    description: "Punto de venta de Turkana Jewelry",
    start_url: "/pos",
    display: "fullscreen",
    orientation: "any",
    background_color: "#faf8f5",
    theme_color: "#2b2b2b",
    icons: [
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
