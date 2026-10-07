export function Footer() {
  return (
    // Latar chrome (bg-bg-secondary, sama seperti Header/ProviderPanel) — gelap di mode
    // gelap, terang di mode terang; tepi atas aksen fosfor 2px memisahkan tegas dari
    // konten di atasnya (tanpa warna baru, tanpa glow).
    <footer className="motion-enter border-t-2 border-accent bg-bg-secondary [--motion-i:340] [--enter-y:4px]">
      {/* M23: mobile lebih rapat (sm: kembali ke desktop).
          M28: satu baris pendek per kolom di SEMUA ukuran + padding dipangkas. */}
      <div className="shell py-2 sm:py-3">
        <div className="grid grid-cols-1 gap-2 sm:gap-3 md:grid-cols-3">
          {/* Kolom kiri: brand + tagline singkat */}
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-body font-extrabold tracking-[-0.03em] text-accent-text sm:text-title">
              StockMeta
            </p>
            <p className="text-small leading-[1.5] text-text-secondary">
              AI Metadata untuk Adobe Stock &amp; Shutterstock
            </p>
          </div>

          {/* Kolom tengah: disclaimer afiliasi */}
          <p className="min-w-0 text-small leading-[1.5] text-text-secondary">
            Alat independen — tidak berafiliasi dengan Adobe atau Shutterstock.
          </p>

          {/* Kolom kanan: catatan privasi */}
          <p className="min-w-0 text-small leading-[1.5] text-text-secondary">
            API key &amp; gambar diproses langsung di browser ke provider AI — tanpa server, tanpa pelacak.
          </p>
        </div>

        {/* Baris bawah: garis tipis struktural 1px, kiri hak cipta, kanan readout mono */}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2 sm:mt-3">
          <p className="font-mono text-meta text-text-muted">© 2026 StockMeta</p>
          <p className="font-mono text-meta text-text-muted">
            diproses lokal di browser
          </p>
        </div>
      </div>
    </footer>
  );
}
