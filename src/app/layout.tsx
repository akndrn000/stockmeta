import type { Metadata, Viewport } from "next";
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
  metadataBase: new URL("https://stockmeta-gold.vercel.app/"),
  title: "StockMeta — Metadata AI untuk Adobe Stock & Shutterstock",
  description:
    "Buat judul, deskripsi, kata kunci, dan kategori unggahan stok secara batch dengan Gemini atau Groq. API key disimpan hanya di browser Anda.",
};

// M19: viewport mengikuti lebar perangkat + safe-area (HP berponi/landscape) tanpa
// memblokir zoom (tanpa maximumScale/userScalable) — API Next 16 "viewport" export.
// themeColor per skema = --bg tiap mode (globals.css), supaya bilah browser menyatu
// dengan latar halaman. Jangan tambah <meta name="theme-color"> manual — Next yang
// menghasilkannya dari sini.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#050907' },
    { media: '(prefers-color-scheme: light)', color: '#f0f3f1' },
  ],
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
