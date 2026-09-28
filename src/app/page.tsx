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
    // M11: tanpa tinggi tetap & tanpa overflow tersembunyi — halaman menggulir sebagai satu
    // dokumen; kedua panel tingginya mengikuti isi (lihat Panel.tsx).
    <div className="flex min-h-dvh flex-col">
      <Header
        provider={provider.provider}
        status={provider.status}
        session={session}
        disabled={batch.busy}
      />
      <ProviderPanel api={provider} busy={batch.busy} />

      <main className="grid grid-cols-1 items-start gap-3 p-3 lg:grid-cols-[3fr_2fr] lg:gap-3.5 lg:p-4">
        <Worksheet session={session} provider={provider} batch={batch} />
        <CaptionSheet session={session} provider={provider} batch={batch} />
      </main>
    </div>
  );
}
