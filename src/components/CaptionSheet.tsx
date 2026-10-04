'use client';
// Lembar caption (M7): edit metadata per platform untuk frame terpilih — field + chip kata kunci
// + kategori resmi + tema per-foto + saran validasi, ekspor CSV di footer panel.
// M13: aksi "buat ulang" pindah ke ikon tile di Worksheet (frame gagal maupun siap);
// yang tinggal di sini hanya KOTAK ERROR frame gagal (pesan error lengkap) — tanpa tombol,
// tanpa konfirmasi. Lembar ini kini murni editor, jadi tidak lagi menerima props
// provider/batch.
// M14: TIDAK ADA lagi kotak kosong "Belum ada frame dipilih" — struktur field selalu dirender
// (Judul/Deskripsi, Kata kunci, Kategori, Tema, Saran bila relevan, footer Export CSV) dan
// hanya dinonaktifkan sampai ada frame terpilih, supaya lembar tidak pernah terlihat kosong.
// M18: penghitung keluar dari dalam kotak (posisi M13) → sebaris dengan LABEL field, di atas
// kotak isian. Baris label: label di kiri, keterangan + tombol salin di kanan (flex-wrap,
// turun ke baris kedua yang tetap rata kanan bila layar sempit). Ruang cadangan dalam kotak
// (pb-6) ikut dihapus karena tidak ada lagi teks yang menumpang di atas kolom isian.
import { useState } from 'react';
import type { ReactNode } from 'react';
import type { useSession } from '../hooks/useSession';
import { ADOBE_CATEGORIES, SHUTTERSTOCK_CATEGORIES } from '../lib/categories';
import { downloadCsv, planCsv, portalFileName } from '../lib/csv';
import { MAX_DESCRIPTION, MAX_KEYWORDS, MAX_KEYWORDS_ADOBE, MAX_TITLE_CSV, MIN_KEYWORDS_ADOBE, MIN_KEYWORDS_SHUTTER } from '../lib/limits';
import { hasContent } from '../lib/metadata';
import { sanitizeAdobeTitle, CSV_MAX_ROWS } from '../lib/platform-rules';import type { AdobeMetadata, Frame, FrameStatus, ShutterstockMetadata } from '../lib/types';
import { validateMetadata } from '../lib/validate';
import { CopyButton } from './CopyButton';
import { KeywordEditor } from './KeywordEditor';
import { Panel } from './Panel';

type Session = ReturnType<typeof useSession>;

const pad2 = (n: number) => String(n).padStart(2, '0');

// Keterangan bantu penghitung/kuota — sebaris dengan label field, di atas kotak isian (M18;
// menggantikan posisi M13 yang menempel di pojok kanan bawah textarea). M17: nada peringatan —
// netral sampai 60% kuota (text-muted), mulai 60% → warning, melewati batas → error.
// Tetap dipakai sebagai aria-describedby textarea.
function FieldNote({ text, tone = 'ok', id }: { text: string; tone?: 'ok' | 'near' | 'over'; id?: string }) {
  return (
    <span
      id={id}
      className={`shrink-0 font-mono text-meta font-bold uppercase tracking-[0.08em] tabular-nums transition-colors duration-150 ${
        tone === 'over' ? 'text-error' : tone === 'near' ? 'text-warning' : 'text-text-muted'
      }`}
    >
      {text}
    </span>
  );
}

/** 60% kuota → peringatan; melewati batas → error (berlaku untuk judul & deskripsi) */
const toneFor = (len: number, max: number): 'ok' | 'near' | 'over' =>
  len > max ? 'over' : len >= Math.ceil(max * 0.6) ? 'near' : 'ok';

function Field({ id, label, copyText, note, hint, disabled, children }: {
  id?: string;
  label: string;
  copyText?: string;
  /** M18: penghitung/keterangan sebaris dengan label (label kiri, keterangan + salin kanan) */
  note?: ReactNode;
  hint?: string;
  /** M14: nonaktifkan tombol salin saat belum ada frame terpilih */
  disabled?: boolean;
  children: ReactNode;
}) {
  const hasRight = note !== undefined || copyText !== undefined;
  return (
    <div className="flex flex-col gap-1.5">
      {/* M18: flex-wrap bila layar sempit — grup kanan turun ke baris kedua dan tetap
          rata kanan (ml-auto), sehingga label & tombol salin tidak pernah meluber.
          M19: flex-1 — baris label mengisi sisa tinggi field. Saat dua field berdampingan
          (grid Kategori ↔ Tema, M19 E.4) kedua kolom diregangkan ke tinggi baris yang
          sama, jadi baris label keduanya selalu setara tinggi walau satu kolom punya
          tombol "Salin" (28/44px) dan kolom lain hanya teks label — kotak dropdown &
          input di bawahnya pun sejajar persis. Field tunggal tingginya tetap = isi
          (container auto-height → tanpa ruang tambahan). */}
      <div className="flex flex-1 flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <label htmlFor={id} className="text-meta font-semibold uppercase tracking-[0.06em] text-text-muted">
          {label}
        </label>
        {hasRight && (
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            {note}
            {copyText !== undefined && <CopyButton text={copyText} label={label} disabled={disabled} />}
          </span>
        )}
      </div>
      {children}
      {hint && <p className="text-small leading-relaxed text-text-muted">{hint}</p>}
    </div>
  );
}

const selectCls =
  'h-10 w-full appearance-none rounded-md border border-border-control bg-surface-elevated px-3 py-2 pr-8 text-body font-semibold text-text transition-colors duration-150 hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-50';

function SelectArrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted">
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const STATUS_LABEL: Record<FrameStatus, string> = {
  menunggu: 'Menunggu',
  memproses: 'Memproses',
  siap: 'Siap',
  gagal: 'Gagal'
};

export function CaptionSheet({ session }: {
  session: Session;
}) {
  const { frames, sel, platform, tema, updateMetadata, setFrameTema, setPortalName, setFrameFlags } = session;
  const [open, setOpen] = useState(true);
  const [showDialog, setShowDialog] = useState(false);

  const index = frames.findIndex((f) => f.id === sel);
  const frame: Frame | null = index >= 0 ? frames[index] : null;
  const m = frame?.metadata[platform];
  const adobe = platform === 'adobe' ? (m as AdobeMetadata | undefined) : undefined;
  const shutter = platform === 'shutterstock' ? (m as ShutterstockMetadata | undefined) : undefined;
  // saran hanya kalau slot platform aktif sudah berisi — slot kosong jangan dinilai (error frame gagal tetap tampil)
  const notesFor = (f: Frame): ReturnType<typeof validateMetadata> => {
    const sm = f.metadata[platform];
    if (!sm || !hasContent(platform, sm)) return { errors: [], warnings: [] };
    return validateMetadata(platform, sm, portalFileName(f));
  };
  const result = frame ? notesFor(frame) : { errors: [], warnings: [] };
  const rowsWithNotes = frames.filter((f) => {
    const r = notesFor(f);
    return r.errors.length + r.warnings.length > 0;
  }).length;
  // footer/dialog: hanya baris berisi & TANPA error cek keras yang diekspor
  const plan = planCsv(frames, platform);
  const exportRows = plan.exportable.length;
  const canExport = exportRows > 0;
  // Peringatan pra-unduh: frame berisiko tinggi ikut dihitung (tidak memblokir
  // kecuali error cek keras). Frame ditahan disembunyikan dari ekspor.
  const highRiskCount = plan.exportable.filter((f) =>
    platform === 'adobe'
      ? f.riskAdobe?.overall === 'tinggi'
      : f.riskShutterstock?.estimate === 'Kemungkinan ditolak'
  ).length;

  const patchAdobe = (patch: Partial<AdobeMetadata>) => {
    if (frame) updateMetadata(frame.id, 'adobe', patch);
  };
  const patchShutter = (patch: Partial<ShutterstockMetadata>) => {
    if (frame) updateMetadata(frame.id, 'shutterstock', patch);
  };

  const title = adobe?.title ?? '';
  const desc = shutter?.description ?? '';
  const cats = shutter?.categories ?? [];

  const st = frame ? frame.status[platform] : 'menunggu';
  const err = frame ? frame.error[platform] : '';
  const showError = Boolean(frame && err && st === 'gagal');

  // M19 (E.4): field "Tema untuk frame ini" dipasangkan dua kolom dengan Kategori bila
  // kartu cukup lebar (@container → @md), satu kolom bila sempit. JSX dipakai ulang oleh
  // kedua cabang platform supaya urutan & jumlah field tetap sama.
  const temaField = (
    <Field id="caption-tema" label="Tema untuk frame ini" disabled={!frame}>
      <input
        id="caption-tema"
        type="text"
        value={frame?.tema ?? ''}
        onChange={(e) => {
          if (frame) setFrameTema(frame.id, e.target.value);
        }}
        placeholder={tema || 'ikuti tema batch'}
        disabled={!frame}
        className="h-10 w-full rounded-md border border-border-control bg-surface-elevated px-3 py-2 text-body text-text transition-colors duration-150 placeholder:text-text-muted hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-50"
      />
    </Field>
  );

  return (
    <Panel
      id="lembar-caption"
      title="Lembar caption"
      // M14: placeholder header tetap terbaca walau belum ada frame — 0 frame → "Frame -- / --",
      // ada frame tapi belum terpilih → "Frame -- / total sesi" (bukan angka 0 yang membingungkan)
      meta={
        frame
          ? `Frame ${pad2(index + 1)} / ${pad2(frames.length)}`
          : frames.length > 0
            ? `Frame -- / ${pad2(frames.length)}`
            : 'Frame -- / --'
      }
      footer={
        // M12: flex-wrap — di layar sempit / zoom tinggi baris footer turun, tidak meluber
        // M23: mobile lebih rapat (sm: kembali ke desktop)
        <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
          {/* M14: aria-disabled + title (pola M13) — alasan "kenapa mati" tetap muncul sebagai
              tooltip di semua peramban dan tetap bisa dibaca pembaca layar, walau tombol
              tidak bisa diklik. onClick tetap di-guard. */}
          <button
            type="button"
            onClick={() => {
              if (canExport) setShowDialog(true);
            }}
            aria-disabled={canExport ? undefined : true}
            title={
              canExport
                ? 'Periksa daftar file lalu ekspor metadata ke CSV'
                : frames.length === 0
                  ? 'Belum ada frame — upload gambar dulu di lembar kerja.'
                  : 'Belum ada baris lolos cek keras — perbaiki error dulu.'
            }
            className={`inline-flex items-center gap-2 rounded-md border border-accent/40 bg-accent-tint/60 px-3 py-1 text-small font-semibold text-accent-text transition-colors duration-150 hover:border-accent hover:bg-accent-tint sm:px-3.5 sm:py-1.5 sm:text-body ${
              canExport ? '' : 'cursor-not-allowed opacity-45 hover:border-accent/40 hover:bg-accent-tint/60'
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M7 1.8v6.6m0 0L4.4 5.9M7 8.4l2.6-2.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M1.9 9.4v1.5a1.3 1.3 0 0 0 1.3 1.3h7.6a1.3 1.3 0 0 0 1.3-1.3V9.4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Export CSV
          </button>
          <span className="flex flex-wrap items-center gap-3">
            {rowsWithNotes > 0 && (
              <span className="text-meta font-medium uppercase tracking-[0.06em] text-warning">
                {rowsWithNotes} baris punya saran perbaikan
              </span>
            )}
            <span className="rounded-full border border-border bg-bg-secondary px-2.5 py-1 font-mono text-meta font-bold uppercase tracking-[0.06em] text-text-secondary tabular-nums">
              {exportRows} baris
            </span>
          </span>
        </div>
      }
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="caption-body"
        className="mb-3 flex w-full flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-md border border-border bg-transparent px-2 py-1.5 text-small font-semibold text-text-secondary transition-colors duration-150 hover:border-border-control hover:bg-accent-tint hover:text-text sm:px-3 sm:py-2 sm:text-body lg:hidden"
      >
        <span className="inline-flex shrink-0 items-center gap-2">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" className={`transition-transform duration-150 ${open ? '' : '-rotate-90'}`}>
            <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {open ? 'Sembunyikan detail' : 'Tampilkan detail'}
        </span>
        <span
          className="min-w-0 truncate font-mono text-meta uppercase tracking-[0.08em] text-text-muted"
          title={frame ? frame.name : undefined}
        >
          {frame ? frame.name : 'belum ada frame'}
        </span>
      </button>

      <div id="caption-body" className={`flex flex-col gap-3 @container sm:gap-4 ${open ? '' : 'max-lg:hidden'}`}>
        {/* Empty state ramah: ikon + teks yang sudah ada ("belum ada frame") + ruang lega —
            hanya saat sesi benar-benar kosong; seluruh field tetap dirender di bawahnya.
            M23: di <640px jauh lebih ramping (ikon 14, padding 16 vertikal); sm:
            mengembalikan proporsi desktop. */}
        {frames.length === 0 && (
          <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-border-strong bg-bg-secondary px-3 py-4 text-center sm:gap-2 sm:px-4 sm:py-8">
            <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-md border border-border bg-surface text-text-muted sm:h-10 sm:w-10">
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 sm:h-[18px] sm:w-[18px]">
                <rect x="2.5" y="4" width="15" height="12" rx="2" />
                <path d="M2.5 12.5l3.6-3.2a1.5 1.5 0 0 1 2 0l4.4 3.9" />
                <path d="M12.2 11.2l1.5-1.3a1.5 1.5 0 0 1 2 0l1.8 1.6" />
                <circle cx="7.2" cy="7.8" r="1.1" />
              </svg>
            </span>
            <p className="font-mono text-meta font-bold uppercase tracking-[0.08em] text-text-secondary">
              belum ada frame
            </p>
          </div>
        )}
        {/* M14: strip nama file + status hanya bila ada frame terpilih — kotak kosong M13
            ("Belum ada frame dipilih") dihapus; struktur field di bawah yang menandai
            lembar ini masih kosong (semuanya nonaktif sampai ada frame). */}
        {frame && (
          <div className="-mx-3 -mt-3 flex items-center justify-between gap-3 border-b border-border bg-surface-elevated px-3 py-1.5 sm:-mx-4 sm:-mt-4 sm:px-4 sm:py-2">
            <span className="truncate text-small font-medium text-text" title={frame.name}>
              {frame.name}
            </span>
            {/* M16: badge status = garis 2px (sama seperti badge status provider & tile) —
                label netral (menunggu/proses) memakai garis putus-putus warna abu-agar
                konsisten dengan badge provider saat idle. */}
            <span
              className={`badge-bracket shrink-0 rounded-md border-2 px-2 py-0.5 font-mono text-meta font-bold uppercase tracking-[0.08em] transition-colors duration-150 ${
                st === 'siap'
                  ? 'border-success text-success'
                  : st === 'gagal'
                    ? 'border-error text-error'
                    : 'border-dashed border-border-strong text-text-secondary'
              }`}
            >
              {STATUS_LABEL[st]}
            </span>
          </div>
        )}

        {/* M13: hanya pesan error — tombol & konfirmasi "Timpa hasil yang ada?" pindah
            ke ikon buat ulang di tile Worksheet (showError = ada frame + status gagal) */}
        {showError && (
          <div role="alert" className="rounded-lg border-2 border-error bg-error-tint p-2 sm:p-3">
            <p className="text-small font-semibold leading-snug text-error sm:text-body">{err}</p>
          </div>
        )}

        {/* M14: field SELALU dirender — struktur sama seperti kondisi terisi, hanya
            dinonaktifkan (input/select/salin) selama belum ada frame terpilih. */}
        <Field id="caption-portal" label="Nama file di portal" disabled={!frame} hint="Dipakai apa adanya di kolom Filename CSV — samakan dengan nama di portal.">
          <input
            id="caption-portal"
            type="text"
            value={frame ? portalFileName(frame) : ''}
            onChange={(e) => {
              if (frame) setPortalName(frame.id, e.target.value);
            }}
            placeholder={frame?.name ?? ''}
            disabled={!frame}
            spellCheck={false}
            autoCapitalize="none"
            className="h-10 w-full rounded-md border border-border-control bg-surface-elevated px-3 py-2 font-mono text-body text-text transition-colors duration-150 placeholder:text-text-muted hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </Field>
        {platform === 'adobe' ? (
          <>
            <Field
              id="caption-title"
              label="Judul"
              copyText={title}
              disabled={!frame}
              note={
                <FieldNote
                  id="caption-title-note"
                  text={`${title.length}/${MAX_TITLE_CSV}`}
                  tone={toneFor(title.length, MAX_TITLE_CSV)}
                />
              }
            >
              {/* M18: penghitung naik ke baris label — textarea kembali py-2 (ruang pb-6
                  untuk teks yang menempel di dalam kotak tidak diperlukan lagi) */}
              <textarea
                id="caption-title"
                rows={2}
                value={title}
                onChange={(e) => patchAdobe({ title: e.target.value })}
                placeholder="Judul menjual, spesifik, tanpa frasa generik"
                disabled={!frame}
                aria-describedby="caption-title-note"
                className="w-full resize-none rounded-md border border-border-control bg-surface-elevated px-3 py-2 text-body leading-relaxed text-text transition-colors duration-150 placeholder:text-text-muted hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-50"
              />
              {/* sanitasi terlihat: nilai asli tetap tersimpan, ekspor memakai versi bersih */}
              {sanitizeAdobeTitle(title).changed && title.trim() !== '' && (
                <p className="text-small text-warning">
                  Diekspor sebagai “{sanitizeAdobeTitle(title).text}” (koma/karakter khusus diganti).
                </p>
              )}
            </Field>

            <KeywordEditor
              keywords={adobe?.keywords ?? []}
              min={MIN_KEYWORDS_ADOBE}
              max={MAX_KEYWORDS_ADOBE}
              onChange={(list) => patchAdobe({ keywords: list })}
              disabled={!frame}
            />

            {/* M19 (E.4): Kategori + Tema berdampingan bila kartu cukup lebar */}
            <div className="grid gap-3 @md:grid-cols-2 @md:gap-4">
              <Field id="caption-category" label="Kategori" copyText={adobe?.category ?? ''} disabled={!frame}>
                <div className="relative">
                  <select
                    id="caption-category"
                    value={adobe?.category ?? ''}
                    onChange={(e) => patchAdobe({ category: e.target.value })}
                    disabled={!frame}
                    className={selectCls}
                  >
                    <option value="">— pilih kategori —</option>
                    {ADOBE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <SelectArrow />
                </div>
              </Field>
              {temaField}
            </div>
          </>
        ) : (
          <>
            <Field
              id="caption-desc"
              label="Deskripsi"
              copyText={desc}
              disabled={!frame}
              note={
                <FieldNote
                  id="caption-desc-note"
                  text={`${desc.length}/${MAX_DESCRIPTION}`}
                  tone={toneFor(desc.length, MAX_DESCRIPTION)}
                />
              }
            >
              {/* Hint statis di bawah kotak dihapus — minimal 5 kata tetap divalidasi
                  via blok "Saran perbaikan". Hanya penghitung di baris label (M18). */}
              <textarea
                id="caption-desc"
                rows={3}
                value={desc}
                onChange={(e) => patchShutter({ description: e.target.value })}
                placeholder="Satu dua kalimat yang menggambarkan subjek, gaya, dan suasana"
                disabled={!frame}
                aria-describedby="caption-desc-note"
                className="w-full resize-none rounded-md border border-border-control bg-surface-elevated px-3 py-2 text-body leading-relaxed text-text transition-colors duration-150 placeholder:text-text-muted hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </Field>

            <KeywordEditor
              keywords={shutter?.keywords ?? []}
              min={MIN_KEYWORDS_SHUTTER}
              max={MAX_KEYWORDS}
              onChange={(list) => patchShutter({ keywords: list })}
              disabled={!frame}
            />

            {/* M19 (E.4): dua select kategori berdampingan bila kartu cukup lebar */}
            <div className="grid gap-3 @md:grid-cols-2 @md:gap-4">
              <Field id="caption-cat1" label="Kategori utama" copyText={cats[0] ?? ''} disabled={!frame}>
                <div className="relative">
                  <select
                    id="caption-cat1"
                    value={cats[0] ?? ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      patchShutter({ categories: v ? (cats[1] && cats[1] !== v ? [v, cats[1]] : [v]) : [] });
                    }}
                    disabled={!frame}
                    className={selectCls}
                  >
                    <option value="">— pilih kategori —</option>
                    {SHUTTERSTOCK_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <SelectArrow />
                </div>
              </Field>

              <Field id="caption-cat2" label="Kategori tambahan" copyText={cats[1] ?? ''} disabled={!frame}>
                <div className="relative">
                  <select
                    id="caption-cat2"
                    value={cats[1] ?? ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      patchShutter({ categories: v ? [cats[0], v].filter(Boolean) : cats[0] ? [cats[0]] : [] });
                    }}
                    disabled={!frame}
                    className={selectCls}
                  >
                    <option value="">— pilih kategori —</option>
                    {SHUTTERSTOCK_CATEGORIES.filter((c) => c !== cats[0]).map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <SelectArrow />
                </div>
              </Field>
            </div>

            {/* Toggle Shutterstock per frame (default mati) → kolom CSV E-G */}
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              <label className="inline-flex cursor-pointer items-center gap-2 text-small font-semibold text-text-secondary">
                <input
                  type="checkbox"
                  checked={frame?.illustration === true}
                  disabled={!frame}
                  onChange={(e) => {
                    if (frame) setFrameFlags(frame.id, { illustration: e.target.checked });
                  }}
                  className="h-4 w-4 shrink-0 cursor-pointer accent-accent disabled:cursor-not-allowed disabled:opacity-50"
                />
                Ilustrasi
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2 text-small font-semibold text-text-secondary">
                <input
                  type="checkbox"
                  checked={frame?.editorial === true}
                  disabled={!frame}
                  onChange={(e) => {
                    if (frame) setFrameFlags(frame.id, { editorial: e.target.checked });
                  }}
                  className="h-4 w-4 shrink-0 cursor-pointer accent-accent disabled:cursor-not-allowed disabled:opacity-50"
                />
                Editorial
              </label>
            </div>
            {frame?.editorial === true && (
              <p role="note" className="text-small text-warning">
                Frame ditandai Editorial — tulis format caption editorial secara manual.
                {/* TODO [VERIFIKASI]: format caption editorial khusus belum dipastikan. */}
              </p>
            )}
          </>
        )}

        {/* M14: hint "Kosongkan untuk memakai tema batch." dihapus — labelnya sudah menjelaskan.
            M19: di cabang Adobe field ini ikut grid dua kolom bersama Kategori (lihat atas). */}
        {platform === 'shutterstock' && temaField}

        {/* Error cek keras = PEMBLOKIR (frame dilewati saat ekspor); warning = saran. */}
        {result.errors.length > 0 && (
          <div role="alert" className="rounded-lg border-2 border-error bg-error-tint p-2 sm:p-3">
            <p className="mb-1.5 font-mono text-meta font-bold uppercase tracking-[0.08em] text-error">
              Tidak lolos cek keras — frame ini dilewati saat ekspor
            </p>
            <ul className="flex flex-col gap-1.5">
              {result.errors.map((note, i) => (
                <li key={`err-${note.field}-${i}`} className="text-small leading-relaxed text-text-secondary">
                  {note.message}
                </li>
              ))}
            </ul>
          </div>
        )}
        {/* Saran hanya relevan saat ada frame + slot berisi — selain itu tidak dirender.
            Kotak AMBER lembut (non-pemblokir): judul & ikon warning, isi tetap teks sekunder
            supaya kontras AA di kedua mode. */}
        {result.warnings.length > 0 && (
          <div className="rounded-lg border border-warning/45 bg-warning-tint p-2 sm:p-3">
            <p className="mb-1.5 flex items-center gap-1.5 font-mono text-meta font-bold uppercase tracking-[0.08em] text-warning">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M6 1.6l4.6 8H1.4l4.6-8z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                <path d="M6 5v1.9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <circle cx="6" cy="8.5" r="0.7" fill="currentColor" />
              </svg>
              Saran perbaikan
            </p>
            <ul className="flex flex-col gap-1.5">
              {result.warnings.map((note, i) => (
                <li key={`warn-${note.field}-${i}`} className="flex items-start gap-2 text-small leading-relaxed text-text-secondary">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" className="mt-0.5 shrink-0 text-warning">
                    <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M6 3.4v.1M6 5.4v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  <span>{note.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Dialog pra-unduh: daftar Filename + catatan sama-persis + error/peringatan.
          Blokir hanya untuk error cek keras; nilai juri TIDAK LOLOS hanya peringatan. */}
      {showDialog && (
        <div role="dialog" aria-modal="true" aria-label="Konfirmasi ekspor CSV" className="fixed inset-0 z-50 grid place-items-center bg-surface/80 p-4">
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-xl border border-border bg-surface-elevated p-4">
            <p className="text-body font-semibold text-text">Ekspor CSV {platform === 'adobe' ? 'Adobe Stock' : 'Shutterstock'}</p>
            <p className="text-small text-text-secondary">
              {plan.exportable.length} baris ditulis ke {plan.filename}. Kolom Filename harus sama persis
              dengan nama file di portal (huruf besar/kecil + ekstensi).
            </p>
            <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border border-border p-2 font-mono text-small text-text-secondary">
              {plan.exportable.map((f) => (
                <li key={f.id} className="truncate" title={portalFileName(f)}>{portalFileName(f)}</li>
              ))}
            </ul>
            {(plan.skipped.length > 0 || plan.overBytes || plan.overRows) && (
              <div role="alert" className="rounded-lg border-2 border-error bg-error-tint p-2 text-small text-text-secondary">
                {plan.skipped.length > 0 && (
                  <p>{plan.skipped.length} frame dilewati karena error cek keras: {plan.skipped.map((s) => portalFileName(s.frame)).join(', ')}</p>
                )}
                {plan.overBytes && <p>Ukuran CSV melebihi 1 MB — kurangi jumlah frame.</p>}
                {plan.overRows && <p>Lebih dari {CSV_MAX_ROWS} baris — kurangi jumlah frame.</p>}
              </div>
            )}
            {plan.warnCount > 0 && (
              <p className="text-small text-warning">{plan.warnCount} peringatan non-pemblokir ikut diekspor apa adanya.</p>
            )}
            {plan.heldBack.length > 0 && (
              <p className="text-small text-text-secondary">{plan.heldBack.length} frame ditahan disembunyikan dari ekspor (bukan dihapus).</p>
            )}
            {highRiskCount > 0 && (
              <p role="note" className="text-small text-warning">
                {highRiskCount} frame berisiko tinggi ikut diekspor (peringatan, tidak memblokir kecuali error cek keras).
              </p>
            )}
            <p className="text-small text-text-muted">Hasil juri TIDAK LOLOS hanya peringatan — tidak memblokir unduhan. Lihat panel kepatuhan.</p>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDialog(false)}
                className="rounded-md border border-border-control px-3 py-1.5 text-small font-semibold text-text-secondary hover:bg-accent-tint hover:text-text"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={plan.overBytes || plan.overRows || plan.exportable.length === 0}
                onClick={() => {
                  downloadCsv(plan.exportable, platform);
                  setShowDialog(false);
                }}
                className="rounded-md border-2 border-accent bg-accent px-3 py-1.5 text-small font-semibold text-accent-contrast disabled:cursor-not-allowed disabled:opacity-45"
              >
                Unduh {plan.exportable.length} baris
              </button>
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}
