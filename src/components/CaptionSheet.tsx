'use client';
// Lembar caption (M7): edit metadata per platform untuk frame terpilih — field + chip kata kunci
// + kategori resmi + tema per-foto + saran validasi, ekspor CSV di footer panel.
// M8: "Buat ulang frame ini" memakai jalur batch yang sama (useBatch.regenerateFrame)
// dengan konfirmasi inline bila slot sudah berisi. Audit A2: tombol juga tampil untuk
// frame 'siap' (strip aksi tenang di bawah status), bukan hanya frame 'gagal'.
import { useState } from 'react';
import type { ReactNode } from 'react';
import type { useBatch } from '../hooks/useBatch';
import type { useProvider } from '../hooks/useProvider';
import type { useSession } from '../hooks/useSession';
import { ADOBE_CATEGORIES, SHUTTERSTOCK_CATEGORIES } from '../lib/categories';
import { downloadCsv } from '../lib/csv';
import { fileStore } from '../lib/fileStore';
import { MAX_TITLE_CSV, MIN_KEYWORDS_ADOBE, MIN_KEYWORDS_SHUTTER } from '../lib/limits';
import { hasContent } from '../lib/metadata';
import type { AdobeMetadata, Frame, FrameStatus, ShutterstockMetadata } from '../lib/types';
import { validateMetadata } from '../lib/validate';
import { CopyButton } from './CopyButton';
import { KeywordEditor } from './KeywordEditor';
import { Panel } from './Panel';

type Session = ReturnType<typeof useSession>;
type ProviderApi = ReturnType<typeof useProvider>;
type BatchApi = ReturnType<typeof useBatch>;

const pad2 = (n: number) => String(n).padStart(2, '0');

function Field({ id, label, copyText, hint, children }: {
  id?: string;
  label: string;
  copyText?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-[11px] font-semibold leading-none tracking-[0.01em] text-ink-3">
          {label}
        </label>
        {copyText !== undefined && <CopyButton text={copyText} label={label} />}
      </div>
      {children}
      {hint && <p className="text-[12px] leading-relaxed text-ink-3">{hint}</p>}
    </div>
  );
}

const selectCls =
  'w-full appearance-none rounded-lg border border-line bg-well px-3 py-2 pr-8 text-[13.5px] font-semibold text-ink transition-colors hover:border-ink-3';

function SelectArrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-3">
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

export function CaptionSheet({ session, provider, batch }: {
  session: Session;
  provider: ProviderApi;
  batch: BatchApi;
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
  const showRegen = Boolean(frame && err && st === 'gagal');
  const hasFile = frame ? fileStore.has(frame.id) : false;
  const providerOk = provider.status === 'ok' && !provider.isSoon;
  const busy = batch.busy;
  const regenDisabled = !hasFile || !providerOk || busy;
  const regenHint = !hasFile
    ? 'File asli hilang setelah sesi di-restore — upload ulang gambar ini dulu.'
    : busy
      ? 'Batch sedang berjalan — tunggu selesai.'
      : !providerOk
        ? 'Tes koneksi provider dulu.'
        : '';
  const confirmTimpa = Boolean(frame && batch.regenConfirm === frame.id);

  return (
    <Panel
      id="lembar-caption"
      title="Lembar caption"
      meta={frame ? `Frame ${pad2(index + 1)} / ${pad2(frames.length)}` : `Frame -- / ${pad2(frames.length)}`}
      footer={
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => downloadCsv(frames, platform)}
            disabled={!canExport}
            className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-semibold text-ink transition-colors hover:bg-wash disabled:cursor-not-allowed disabled:opacity-45"
          >
            Export CSV
          </button>
          <span className="flex items-center gap-3">
            {rowsWithNotes > 0 && (
              <span className="text-[11px] font-medium text-ink-3">
                {rowsWithNotes} baris punya saran perbaikan
              </span>
            )}
            <span className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">
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
        className="mb-3 w-full items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-[13px] font-semibold text-ink-2 transition-colors hover:bg-wash lg:hidden"
      >
        <span className="inline-flex items-center gap-2">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" className={`transition-transform ${open ? '' : '-rotate-90'}`}>
            <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {open ? 'Sembunyikan detail' : 'Tampilkan detail'}
        </span>
        <span className="truncate font-mono text-[11px] uppercase tracking-[0.08em] text-ink-3">
          {frame ? frame.name : 'belum ada frame'}
        </span>
      </button>

      <div id="caption-body" className={`flex flex-col gap-4 ${open ? '' : 'max-lg:hidden'}`}>
        {!frame ? (
          <div className="flex min-h-32 items-center justify-center rounded-xl border border-dashed border-line p-6">
            <p className="text-center text-sm font-medium text-ink-3">
              Belum ada frame dipilih — pilih frame di lembar kerja untuk mengedit caption-nya.
            </p>
          </div>
        ) : (
          <>
            {/* Sub-strip full-bleed: nama file + status teks platform aktif */}
            <div className="-mx-4 -mt-4 flex items-center justify-between gap-3 border-b border-line bg-well px-4 py-2">
              <span className="truncate text-[12px] font-medium text-ink" title={frame.name}>
                {frame.name}
              </span>
              <span
                className={`shrink-0 font-mono text-[11px] font-bold uppercase tracking-[0.08em] ${
                  st === 'siap' ? 'text-success' : st === 'gagal' ? 'text-fail' : 'text-ink-2'
                }`}
              >
                {STATUS_LABEL[st]}
              </span>
            </div>

            {showRegen && (
              <div role="alert" className="rounded-lg border border-fail bg-accent-wash p-3">
                <p className="text-[13px] font-semibold leading-snug text-fail">{err}</p>
                {confirmTimpa ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-semibold text-ink">Timpa hasil yang ada?</span>
                    <button
                      type="button"
                      onClick={() => batch.regenerateFrame(frame.id)}
                      disabled={busy}
                      className="rounded-lg border border-fail px-3 py-1.5 text-[13px] font-semibold text-fail transition-colors hover:bg-fail hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      Ya, timpa
                    </button>
                    <button
                      type="button"
                      onClick={batch.dismissRegen}
                      className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-semibold text-ink-2 transition-colors hover:bg-wash hover:text-ink"
                    >
                      Batal
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => batch.regenerateFrame(frame.id)}
                    disabled={regenDisabled}
                    title={regenHint || undefined}
                    className="mt-2 rounded-lg border border-fail px-3 py-1.5 text-[13px] font-semibold text-fail transition-colors hover:bg-fail hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Buat ulang frame ini
                  </button>
                )}
                {regenHint && <p className="mt-1.5 text-[12px] leading-relaxed text-ink-2">{regenHint}</p>}
              </div>
            )}

            {/* A2: frame siap tetap bisa di-generate ulang — strip aksi tenang (bukan kotak error) */}
            {frame && st === 'siap' && (
              <div className="rounded-lg border border-line bg-well p-3">
                {confirmTimpa ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-semibold text-ink">Timpa hasil yang ada?</span>
                    <button
                      type="button"
                      onClick={() => batch.regenerateFrame(frame.id)}
                      disabled={busy}
                      className="rounded-lg border border-fail px-3 py-1.5 text-[13px] font-semibold text-fail transition-colors hover:bg-fail hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      Ya, timpa
                    </button>
                    <button
                      type="button"
                      onClick={batch.dismissRegen}
                      className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-semibold text-ink-2 transition-colors hover:bg-wash hover:text-ink"
                    >
                      Batal
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => batch.regenerateFrame(frame.id)}
                    disabled={regenDisabled}
                    title={regenHint || undefined}
                    className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-semibold text-ink-2 transition-colors hover:bg-wash hover:text-ink disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Buat ulang frame ini
                  </button>
                )}
                {regenHint && <p className="mt-1.5 text-[12px] leading-relaxed text-ink-3">{regenHint}</p>}
              </div>
            )}

            {platform === 'adobe' ? (
              <>
                <Field id="caption-title" label="Judul" copyText={title} hint={`maks ${MAX_TITLE_CSV} karakter, tanpa koma`}>
                  <div className="flex flex-col gap-1">
                    <textarea
                      id="caption-title"
                      rows={2}
                      value={title}
                      onChange={(e) => patchAdobe({ title: e.target.value })}
                      placeholder="Judul menjual, spesifik, tanpa frasa generik"
                      className="w-full resize-none rounded-lg border border-line bg-well px-3 py-2 text-[13.5px] leading-relaxed text-ink placeholder:text-ink-3"
                    />
                    <span className="self-end font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">
                      {title.length}/{MAX_TITLE_CSV}
                    </span>
                  </div>
                </Field>

                <KeywordEditor
                  keywords={adobe?.keywords ?? []}
                  min={MIN_KEYWORDS_ADOBE}
                  onChange={(list) => patchAdobe({ keywords: list })}
                />

                <Field id="caption-category" label="Kategori" copyText={adobe?.category ?? ''}>
                  <div className="relative">
                    <select
                      id="caption-category"
                      value={adobe?.category ?? ''}
                      onChange={(e) => patchAdobe({ category: e.target.value })}
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
                <Field id="caption-desc" label="Deskripsi" copyText={desc} hint="Tulis kalimat deskriptif utuh, bukan daftar kata.">
                  <textarea
                    id="caption-desc"
                    rows={3}
                    value={desc}
                    onChange={(e) => patchShutter({ description: e.target.value })}
                    placeholder="Satu dua kalimat yang menggambarkan subjek, gaya, dan suasana"
                    className="w-full resize-none rounded-lg border border-line bg-well px-3 py-2 text-[13.5px] leading-relaxed text-ink placeholder:text-ink-3"
                  />
                </Field>

                <KeywordEditor
                  keywords={shutter?.keywords ?? []}
                  min={MIN_KEYWORDS_SHUTTER}
                  onChange={(list) => patchShutter({ keywords: list })}
                />

                <Field id="caption-cat1" label="Kategori utama" copyText={cats[0] ?? ''}>
                  <div className="relative">
                    <select
                      id="caption-cat1"
                      value={cats[0] ?? ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        patchShutter({ categories: v ? (cats[1] && cats[1] !== v ? [v, cats[1]] : [v]) : [] });
                      }}
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

                <Field id="caption-cat2" label="Kategori tambahan (opsional)" copyText={cats[1] ?? ''}>
                  <div className="relative">
                    <select
                      id="caption-cat2"
                      value={cats[1] ?? ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        patchShutter({ categories: v ? [cats[0], v].filter(Boolean) : cats[0] ? [cats[0]] : [] });
                      }}
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

            <Field id="caption-tema" label="Tema untuk frame ini (opsional)" hint="Kosongkan untuk memakai tema batch.">
              <input
                id="caption-tema"
                type="text"
                value={frame.tema}
                onChange={(e) => setFrameTema(frame.id, e.target.value)}
                placeholder={tema || 'ikuti tema batch'}
                className="w-full rounded-lg border border-line bg-well px-3 py-2 text-[13.5px] text-ink placeholder:text-ink-3"
              />
            </Field>

            {notes.length > 0 && (
              <div className="rounded-lg border border-line bg-well p-3">
                <p className="mb-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">
                  Saran perbaikan
                </p>
                <ul className="flex flex-col gap-1.5">
                  {notes.map((note, i) => (
                    <li key={`${note.field}-${i}`} className="flex items-start gap-2 text-[12px] leading-relaxed text-ink-2">
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
          </>
        )}
      </div>
    </Panel>
  );
}
