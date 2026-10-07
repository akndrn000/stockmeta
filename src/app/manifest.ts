import type { MetadataRoute } from "next";

// Ikon PWA: berkasnya dibuat scripts/export-icons.py dari geometri src/app/icon.svg.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "StockMeta",
    short_name: "StockMeta",
    description:
      "Buat judul, deskripsi, kata kunci, dan kategori untuk Adobe Stock dan Shutterstock secara batch. Berjalan di browser; API key tidak pernah melewati server aplikasi ini.",
    start_url: "/",
    display: "standalone",
    background_color: "#050907",
    theme_color: "#050907",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
