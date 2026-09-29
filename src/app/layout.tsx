import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import { InlineScript } from "../components/InlineScript";
import "./globals.css";

// M15: SATU font monospace untuk seluruh halaman (body & heading) — hierarki dibentuk dari
// ukuran dan ketebalan, bukan dari font kedua (Archivo & Courier Prime dibuang).
const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "StockMeta — Metadata AI untuk Adobe Stock & Shutterstock",
  description:
    "Buat judul, deskripsi, kata kunci, dan kategori unggahan stok secara batch dengan Gemini atau Groq. API key disimpan hanya di browser Anda.",
};

// Nilai sama dengan THEME_KEY ('stockmeta_theme') di src/lib/storage.ts — sengaja inline
// supaya layout tetap server component tanpa mengimpor modul storage.
// Script di <head> berjalan sinkron saat parsing HTML, sebelum paint pertama (panduan
// Next 16 "Preventing Flash"): baca preferensi tersimpan, fallback ke preferensi sistem.
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('stockmeta_theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="id"
      data-theme="dark"
      suppressHydrationWarning
      className={`${jetbrains.variable} antialiased`}
    >
      <head>
        <InlineScript html={THEME_SCRIPT} />
      </head>
      <body>{children}</body>
    </html>
  );
}
