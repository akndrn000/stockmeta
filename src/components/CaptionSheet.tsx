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
import { downloadCsv } from '../lib/csv';
import { MAX_DESCRIPTION, MAX_TITLE_CSV, MIN_KEYWORDS_ADOBE, MIN_KEYWORDS_SHUTTER } from '../lib/limits';
import { hasContent } from '../lib/metadata';
import type { AdobeMetadata, Frame, FrameStatus, ShutterstockMetadata } from '../lib/types';
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
      className={`shrink-0 font-mono text-meta font-bold uppercase tracking-[0.08em] transition-colors ${
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
          rata kanan (ml-auto), sehingga label & tombol salin tidak pernah meluber. */}
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <label htmlFor={id} className="text-meta font-semibold leading-none tracking-[0.01em] text-text-muted">
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
  'h-10 w-full appearance-none rounded border border-border-control bg-surface-elevated px-3 py-2 pr-8 text-body font-semibold text-text transition-colors hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-50';

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
  const { frames, sel, platform, tema, updateMetadata, setFrameTema } = session;
  const [open, setOpen] = useState(true);

  const index = frames.findIndex((f) => f.id === sel);
  const frame: Frame | null = index >= 0 ? frames[index] : null;
  const m = frame?.metadata[platform];
  const adobe = platform === 'adobe' ? (m as AdobeMetadata | undefined) : undefined;
  const shutter = platform === 'shutterstock' ? (m as ShutterstockMetadata | undefined) : undefined;
  // saran hanya kalau slot platform aktif sudah berisi — slot kosong jangan dinilai (error frame gagal tetap tampil)
  const notesFor = (f: Frame): ReturnType<typeof validateMetadata> => {
    const sm = f.metadata[platform];
    return sm && hasContent(platform, sm) ? validateMetadata(platform, sm, f.name) : [];
  };
  const notes = frame ? notesFor(frame) : [];
  const rowsWithNotes = frames.filter((f) => notesFor(f).length > 0).length;
  // footer: jumlah baris yang benar-benar diekspor (slot berisi) — bukan jumlah frame
  const exportRows = frames.filter((f) => {
    const sm = f.metadata[platform];
    return sm !== undefined && hasContent(platform, sm);
  }).length;
  const canExport = frames.some((f) => Boolean(f.metadata[platform]));

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
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* M14: aria-disabled + title (pola M13) — alasan "kenapa mati" tetap muncul sebagai
              tooltip di semua peramban dan tetap bisa dibaca pembaca layar, walau tombol
              tidak bisa diklik. onClick tetap di-guard. */}
          <button
            type="button"
            onClick={() => {
              if (canExport) downloadCsv(frames, platform);
            }}
            aria-disabled={canExport ? undefined : true}
            title={
              canExport
                ? 'Ekspor metadata yang sudah terisi ke CSV'
                : frames.length === 0
                  ? 'Belum ada frame — upload gambar dulu di lembar kerja.'
                  : 'Belum ada metadata — jalankan Buat metadata dulu.'
            }
            className={`rounded border border-border-control px-3 py-1.5 text-body font-semibold text-text transition-colors hover:bg-accent-tint ${
              canExport ? '' : 'cursor-not-allowed opacity-45'
            }`}
          >
            Export CSV
          </button>
          <span className="flex flex-wrap items-center gap-3">
            {rowsWithNotes > 0 && (
              <span className="text-meta font-medium text-text-muted">
                {rowsWithNotes} baris punya saran perbaikan
              </span>
            )}
            <span className="font-mono text-meta font-bold uppercase tracking-[0.08em] text-text-secondary">
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
        className="mb-3 w-full items-center justify-between gap-2 rounded border border-border-control px-3 py-2 text-body font-semibold text-text-secondary transition-colors hover:bg-accent-tint lg:hidden"
      >
        <span className="inline-flex items-center gap-2">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" className={`transition-transform ${open ? '' : '-rotate-90'}`}>
            <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {open ? 'Sembunyikan detail' : 'Tampilkan detail'}
        </span>
        <span className="truncate font-mono text-meta uppercase tracking-[0.08em] text-text-muted">
          {frame ? frame.name : 'belum ada frame'}
        </span>
      </button>

      <div id="caption-body" className={`flex flex-col gap-4 ${open ? '' : 'max-lg:hidden'}`}>
        {/* M14: strip nama file + status hanya bila ada frame terpilih — kotak kosong M13
            ("Belum ada frame dipilih") dihapus; struktur field di bawah yang menandai
            lembar ini masih kosong (semuanya nonaktif sampai ada frame). */}
        {frame && (
          <div className="-mx-4 -mt-4 flex items-center justify-between gap-3 border-b border-border bg-surface-elevated px-4 py-2">
            <span className="truncate text-small font-medium text-text" title={frame.name}>
              {frame.name}
            </span>
            {/* M16: badge status = garis 2px (sama seperti badge status provider & tile) —
                label netral (menunggu/proses) memakai garis putus-putus warna abu-agar
                konsisten dengan badge provider saat idle. */}
            <span
              className={`badge-bracket shrink-0 rounded border-2 px-2 py-0.5 font-mono text-meta font-bold uppercase tracking-[0.08em] transition-colors ${
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
          <div role="alert" className="rounded-md border-2 border-error bg-error-tint p-3">
            <p className="text-body font-semibold leading-snug text-error">{err}</p>
          </div>
        )}

        {/* M14: field SELALU dirender — struktur sama seperti kondisi terisi, hanya
            dinonaktifkan (input/select/salin) selama belum ada frame terpilih. */}
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
                  text={`${title.length}/${MAX_TITLE_CSV} · tanpa koma`}
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
                className="w-full resize-none rounded border border-border-control bg-surface-elevated px-3 py-2 text-body leading-relaxed text-text transition-colors placeholder:text-text-muted hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </Field>

            <KeywordEditor
              keywords={adobe?.keywords ?? []}
              min={MIN_KEYWORDS_ADOBE}
              onChange={(list) => patchAdobe({ keywords: list })}
              disabled={!frame}
            />

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
          </>
        ) : (
          <>
            <Field
              id="caption-desc"
              label="Deskripsi"
              copyText={desc}
              hint="Tulis kalimat deskriptif utuh, bukan daftar kata."
              disabled={!frame}
              note={
                <FieldNote
                  id="caption-desc-note"
                  text={`${desc.length}/${MAX_DESCRIPTION}`}
                  tone={toneFor(desc.length, MAX_DESCRIPTION)}
                />
              }
            >
              {/* Petunjuk instruksional tetap di bawah kotak; hanya penghitung yang masuk
                  ke baris label (M18). */}
              <textarea
                id="caption-desc"
                rows={3}
                value={desc}
                onChange={(e) => patchShutter({ description: e.target.value })}
                placeholder="Satu dua kalimat yang menggambarkan subjek, gaya, dan suasana"
                disabled={!frame}
                aria-describedby="caption-desc-note"
                className="w-full resize-none rounded border border-border-control bg-surface-elevated px-3 py-2 text-body leading-relaxed text-text transition-colors placeholder:text-text-muted hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </Field>

            <KeywordEditor
              keywords={shutter?.keywords ?? []}
              min={MIN_KEYWORDS_SHUTTER}
              onChange={(list) => patchShutter({ keywords: list })}
              disabled={!frame}
            />

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

            <Field id="caption-cat2" label="Kategori tambahan (opsional)" copyText={cats[1] ?? ''} disabled={!frame}>
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
          </>
        )}

        {/* M14: hint "Kosongkan untuk memakai tema batch." dihapus — labelnya sudah menjelaskan */}
        <Field id="caption-tema" label="Tema untuk frame ini (opsional)" disabled={!frame}>
          <input
            id="caption-tema"
            type="text"
            value={frame?.tema ?? ''}
            onChange={(e) => {
              if (frame) setFrameTema(frame.id, e.target.value);
            }}
            placeholder={tema || 'ikuti tema batch'}
            disabled={!frame}
            className="h-10 w-full rounded border border-border-control bg-surface-elevated px-3 py-2 text-body text-text transition-colors placeholder:text-text-muted hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </Field>

        {/* Saran hanya relevan saat ada frame + slot berisi — selain itu tidak dirender */}
        {notes.length > 0 && (
          <div className="rounded-md border border-border bg-surface-elevated p-3">
            <p className="mb-1.5 font-mono text-meta font-bold uppercase tracking-[0.08em] text-text-muted">
              Saran perbaikan
            </p>
            <ul className="flex flex-col gap-1.5">
              {notes.map((note, i) => (
                <li key={`${note.field}-${i}`} className="flex items-start gap-2 text-small leading-relaxed text-text-secondary">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" className="mt-0.5 shrink-0 text-accent-text">
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
    </Panel>
  );
}
