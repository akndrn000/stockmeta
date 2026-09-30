export function Footer() {
  return (
    // Latar chrome (bg-bg-secondary, sama seperti Header/ProviderPanel) — gelap di mode
    // gelap, terang di mode terang; tepi atas aksen fosfor 2px memisahkan tegas dari
    // konten di atasnya (tanpa warna baru, tanpa glow).
    <footer className="border-t-2 border-accent bg-bg-secondary">
      <div className="shell py-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* Kolom kiri: brand + tagline */}
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-title font-extrabold tracking-[-0.03em] text-accent-text">
              StockMeta
            </p>
            <p className="text-small leading-[1.5] text-text-secondary">
              AI Metadata Generator untuk Adobe Stock &amp; Shutterstock
            </p>
          </div>

          {/* Kolom tengah: disclaimer afiliasi */}
          <p className="min-w-0 text-small leading-[1.5] text-text-secondary">
            StockMeta adalah alat independen dan tidak berafiliasi dengan Adobe atau
            Shutterstock; kedua nama tersebut adalah merek dagang pemiliknya masing-masing.
          </p>

          {/* Kolom kanan: catatan privasi */}
          <p className="min-w-0 text-small leading-[1.5] text-text-secondary">
            API key dan gambar dikirim langsung dari browser ke provider AI yang dipilih
            (Gemini/Groq/OpenRouter) — tidak pernah melewati server StockMeta; tanpa
            analytics atau pelacak.
          </p>
        </div>

        {/* Baris bawah: garis tipis struktural 1px, kiri hak cipta, kanan readout mono */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <p className="font-mono text-meta text-text-muted">© 2026 StockMeta</p>
          <p className="font-mono text-meta text-text-muted">
            diproses lokal di browser
          </p>
        </div>
      </div>
    </footer>
  );
}
