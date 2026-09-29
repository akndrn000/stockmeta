'use client';
import { CaptionSheet } from '../components/CaptionSheet';
import { Header } from '../components/Header';
import { ProviderPanel } from '../components/ProviderPanel';
import { Worksheet } from '../components/Worksheet';
import { useBatch } from '../hooks/useBatch';
import { useProvider } from '../hooks/useProvider';
import { useSession } from '../hooks/useSession';

// Satu instance hook per aplikasi: useProvider dipakai Header + ProviderPanel + Worksheet;
// useSession dipakai Header + Worksheet + CaptionSheet; useBatch menyambungkan keduanya ke
// alur generate — jangan membuat instance baru di mana pun.
export default function Home() {
  const provider = useProvider();
  const session = useSession();
  const batch = useBatch(session, provider);

  return (
    // M11/M12: tanpa tinggi yang dipaksa ke viewport & tanpa overflow tersembunyi —
    // halaman menggulir sebagai satu dokumen; tinggi tiap elemen = isinya.
    // M19: container `.shell` (padding fluid + safe-area, max 120rem) dipakai bersama
    // Header & ProviderPanel supaya tepinya sejajar; grid baru `minmax(0,1.4fr) /
    // minmax(24rem,1fr)` mulai 1120px (satu kolom di bawahnya) dan items-start supaya
    // tinggi kartu mengikuti isi — kolom caption sticky di ≥1120px.
    <div>
      <Header
        provider={provider.provider}
        status={provider.status}
        session={session}
        disabled={batch.busy}
      />
      <ProviderPanel api={provider} busy={batch.busy} />

      <main className="shell grid grid-cols-1 items-start gap-4 py-4 min-[1120px]:grid-cols-[minmax(0,1.4fr)_minmax(24rem,1fr)] min-[1120px]:py-6 [@media(max-height:500px)]:py-2">
        <Worksheet session={session} provider={provider} batch={batch} />
        {/* M13: CaptionSheet tidak lagi butuh provider/batch — aksi buat ulang pindah ke tile */}
        {/* M14: tinggi kartu = isi (items-start); di ≥1120px kolom caption menempel
            saat menggulir, dengan offset di bawah header lengket. */}
        <div className="min-w-0 self-start min-[1120px]:sticky min-[1120px]:top-28">
          <CaptionSheet session={session} />
        </div>
      </main>
    </div>
  );
}
