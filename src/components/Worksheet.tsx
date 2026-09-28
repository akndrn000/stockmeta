'use client';
// Lembar kerja (M6): dropzone + grid thumbnail + status per platform + tema batch + tombol generate.
// Menggunakan instance useSession, useProvider & useBatch yang sama milik page.tsx (props).
// M8: "Buat metadata" menjalankan batch penuh; saat berjalan tombol jadi "Batalkan".
import { useEffect, useRef, useState } from 'react';
import { SOON_NOTE } from '../hooks/useProvider';
import type { useBatch } from '../hooks/useBatch';
import type { useProvider } from '../hooks/useProvider';
import type { useSession } from '../hooks/useSession';
import { fileStore } from '../lib/fileStore';
import { buildLimitMessage, filterIncomingFiles } from '../lib/frames';
import { makeThumbnail } from '../lib/image';
import { ACCEPTED_TYPES, BATCH_DELAY_OPTIONS_SEC, MAX_FRAMES } from '../lib/limits';
import type { Frame, FrameStatus, Platform } from '../lib/types';
import { Panel } from './Panel';

type Session = ReturnType<typeof useSession>;
type ProviderApi = ReturnType<typeof useProvider>;
type BatchApi = ReturnType<typeof useBatch>;

const pad2 = (n: number) => String(n).padStart(2, '0');
const THUMB_SIZE = 320;

function blankFrame(name: string): Omit<Frame, 'id'> {
  return {
    name,
    thumb: '',
    tema: '',
    status: { adobe: 'menunggu', shutterstock: 'menunggu' } as Record<Platform, FrameStatus>,
    error: { adobe: '', shutterstock: '' } as Record<Platform, string>,
    metadata: {}
  };
}

function NewSessionButton({ hasFrames, disabled, onConfirm }: {
  hasFrames: boolean;
  disabled?: boolean;
  onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  return (
    <button
      type="button"
      disabled={disabled}
      title={disabled ? 'Tunggu batch selesai' : undefined}
      onClick={() => {
        if (hasFrames && !armed) {
          setArmed(true);                       // konfirmasi dua langkah, batal otomatis 4 detik
          return;
        }
        setArmed(false);
        onConfirm();
      }}
      className={`rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
        armed ? 'border-fail text-fail' : 'border-line text-ink-2 hover:bg-wash hover:text-ink'
      }`}
    >
      {armed ? 'Yakin? Klik lagi' : 'Mulai sesi baru'}
    </button>
  );
}

function GenerateButton({
  disabled,
  busy,
  busyLabel,
  notice,
  hint,
  onGenerate,
  onCancel
}: {
  disabled: boolean;
  busy?: boolean;
  busyLabel?: string;
  notice?: string;
  hint?: string;
  onGenerate?: () => void;
  onCancel?: () => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onGenerate}
          disabled={disabled || busy}
          aria-busy={busy}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-45"
        >
          {busy && <span className="spinner spinner-on-accent" aria-hidden="true" />}
          {busy ? busyLabel : 'Buat metadata'}
        </button>
        {busy && (
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 rounded-lg border border-line px-4 py-2.5 text-[13.5px] font-semibold text-fail transition-colors hover:bg-wash hover:text-ink"
          >
            Batalkan
          </button>
        )}
      </div>
      {notice ? (
        <p role="status" className="text-[12px] leading-relaxed text-ink-2">{notice}</p>
      ) : (
        disabled && hint && <p className="text-[12px] leading-relaxed text-ink-3">{hint}</p>
      )}
    </div>
  );
}

function ProgressBar({
  show,
  busy,
  done,
  total,
  failed,
  label
}: {
  show: boolean;
  busy?: boolean;
  done: number;
  total: number;
  failed: number;
  label: string;
}) {
  if (!show || total === 0) return null;
  const processed = done + failed;
  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={processed}
        aria-label={label}
        className="h-1.5 overflow-hidden rounded-full border border-line bg-well"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width]"
          style={{ width: `${Math.round((processed / total) * 100)}%` }}
        />
      </div>
      {/* pengumuman akhir saat batch selesai/dibatalkan; saat berjalan tidak biar ramai */}
      <p
        role={busy ? undefined : 'status'}
        aria-live={busy ? undefined : 'polite'}
        className="font-mono text-[11px] text-ink-2"
      >
        {label}
      </p>
    </div>
  );
}

function FrameTile({
  frame,
  index,
  platform,
  active,
  note,
  needsUpload,
  processing,
  removeDisabled,
  onSelect,
  onRemove
}: {
  frame: Frame;
  index: number;
  platform: Platform;
  active: boolean;
  note?: string;
  needsUpload: boolean;
  processing: boolean;
  removeDisabled?: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const st = frame.status[platform];              // status & error SELALU platform aktif
  const err = frame.error[platform];

  return (
    <div
      className={`relative overflow-hidden rounded-lg bg-surface ${
        active ? 'border-2 border-accent bg-wash' : 'border border-line'
      }`}
    >
      <button
        type="button"
        aria-pressed={active}
        onClick={onSelect}
        className="block w-full text-left"
      >
        <div className="relative aspect-square bg-well">
          {frame.thumb ? (
            // eslint-disable-next-line @next/next/no-img-element -- thumbnail JPEG data-URL inline; next/image tidak mendukung data:
            <img src={frame.thumb} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full" aria-hidden="true" />
          )}
          <span className="absolute left-1.5 top-1.5 rounded border border-line bg-surface/85 px-1 py-px font-mono text-[10px] font-bold text-ink-2">
            {pad2(index + 1)}
          </span>
          {processing && (
            <div className="absolute inset-0 grid place-items-center bg-surface/75">
              <div className="flex flex-col items-center gap-1.5">
                <span className="spinner" aria-hidden="true" />
                <span className="text-[10px] font-semibold text-ink">Memproses...</span>
              </div>
            </div>
          )}
          {(st === 'siap' || st === 'gagal') && (
            <span
              title={st === 'gagal' && err ? err : undefined}
              className={`absolute bottom-1.5 right-1.5 inline-flex -rotate-[1.4deg] items-center rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.08em] ${
                st === 'siap'
                  ? 'border-success bg-surface text-success'
                  : 'border-fail bg-surface text-fail'
              }`}
            >
              {st === 'siap' ? 'SIAP' : 'GAGAL'}
              {st === 'gagal' && err && <span className="sr-only">: {err}</span>}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-0.5 px-2 py-1.5">
          <span className="truncate text-[12px] font-medium text-ink" title={frame.name}>
            {frame.name}
          </span>
          {note && (
            <span className="truncate font-mono text-[11px] text-ink-2" title={note}>
              {note}
            </span>
          )}
          {needsUpload && (
            <span
              title="Perlu upload ulang untuk generate ulang"
              className="inline-flex w-fit items-center gap-1 rounded border border-dashed border-line px-1 py-px font-mono text-[10px] text-ink-3"
            >
              <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                <path
                  d="M8.7 5A3.7 3.7 0 1 1 7.6 2.3M8.7 1.2V4H5.9"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              upload ulang
              <span className="sr-only">Perlu upload ulang untuk generate ulang</span>
            </span>
          )}
        </div>
      </button>
      <button
        type="button"
        onClick={onRemove}
        disabled={removeDisabled}
        aria-label={`Hapus frame ${frame.name}`}
        title={removeDisabled ? 'Tunggu batch selesai' : 'Hapus frame'}
        className="btn-compact absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-md border border-line bg-surface/85 text-ink-2 transition-colors hover:border-fail hover:text-fail disabled:cursor-not-allowed disabled:opacity-45 before:absolute before:-inset-1.5 before:content-['']"
      >
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

export function Worksheet({ session, provider, batch }: {
  session: Session;
  provider: ProviderApi;
  batch: BatchApi;
}) {
  const { frames, sel, tema, platform, notes, addFrame, removeFrame, updateFrame, select, setTema, newSession } =
    session;
  const busy = batch.busy;
  const [dragOver, setDragOver] = useState(false);
  const [limitMsg, setLimitMsg] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const full = frames.length >= MAX_FRAMES;

  useEffect(
    () => () => {
      if (noteTimer.current) clearTimeout(noteTimer.current);
    },
    []
  );

  function showLimit(msg: string) {
    setLimitMsg(msg);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setLimitMsg(''), 6000);
  }

  async function ingest(list: FileList | File[]) {
    if (busy) return;                          // menambah frame di tengah batch mengubah daftar target
    const result = filterIncomingFiles(Array.from(list), frames.length);
    const msg = buildLimitMessage(result);
    if (msg) showLimit(msg);                     // tidak pernah menelan file diam-diam
    for (const file of result.accepted) {
      const id = addFrame(blankFrame(file.name));
      fileStore.set(id, file);
      const thumb = await makeThumbnail(file, THUMB_SIZE);
      if (thumb) updateFrame(id, { thumb });
    }
  }

  function resetSession() {
    newSession();
    fileStore.clear();
    setLimitMsg('');
    if (noteTimer.current) clearTimeout(noteTimer.current);
  }

  const generateDisabled =
    frames.length === 0 || provider.isSoon || provider.status !== 'ok';
  const generateHint =
    frames.length === 0
      ? 'Tambah minimal satu gambar untuk mengaktifkan pembuatan.'
      : provider.isSoon
        ? SOON_NOTE
        : provider.status !== 'ok'
          ? 'Tes koneksi provider dulu.'
          : '';

  const done = frames.filter((f) => f.status[platform] === 'siap').length;
  const failed = frames.filter((f) => f.status[platform] === 'gagal').length;

  // label progress: saat jalan memakai hitungan batch, sesudahnya hasil batch terakhir,
  // idle memakai hitungan sesi
  const lastBatch = frames.length ? batch.summary : null;
  const bar = busy
    ? batch.progress
    : lastBatch
      ? { done: lastBatch.done, failed: lastBatch.failed, total: lastBatch.total }
      : { done, failed, total: frames.length };
  const label = busy
    ? `Memproses ${Math.min(bar.done + bar.failed + 1, bar.total)} dari ${bar.total}...`
    : lastBatch
      ? lastBatch.cancelled
        ? `Batch dibatalkan — ${lastBatch.done} siap`
        : `Batch selesai — ${lastBatch.done} siap · ${lastBatch.failed} gagal`
      : `Batch selesai — ${done} siap · ${failed} gagal`;
  const showBar = busy || Boolean(lastBatch) || done + failed > 0;

  return (
    <Panel
      title="Lembar kerja"
      meta={`${pad2(frames.length)} / ${MAX_FRAMES} frame`}
      actions={
        <NewSessionButton hasFrames={frames.length > 0} disabled={busy} onConfirm={resetSession} />
      }
    >
      <div
        className="flex flex-col gap-4"
        onDragOver={(e) => {
          e.preventDefault();
          if (!full && !busy) setDragOver(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (busy) return;
          if (e.dataTransfer.files.length) void ingest(e.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          multiple
          disabled={busy}
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void ingest(e.target.files);
            e.target.value = '';                 // bisa memilih file yang sama lagi
          }}
        />

        {frames.length === 0 ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={`flex min-h-44 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
              dragOver ? 'border-accent bg-accent-wash' : 'border-line hover:border-ink-3'
            }`}
          >
            <span className="text-[15px] font-semibold text-ink">
              Letakkan gambar di sini, atau klik untuk memilih
            </span>
            <span className="font-mono text-[11px] text-ink-3">
              JPG / PNG / WEBP · maks {MAX_FRAMES} frame per batch
            </span>
          </button>
        ) : (
          <button
            type="button"
            disabled={full || busy}
            title={busy ? 'Tunggu batch selesai' : full ? 'Batch penuh' : undefined}
            onClick={() => inputRef.current?.click()}
            className={`w-full rounded-lg border px-3 py-2 text-[13px] font-semibold transition-colors ${
              full || busy
                ? 'cursor-not-allowed border-line text-ink-3 opacity-60'
                : dragOver
                  ? 'border-accent bg-accent-wash text-accent-text'
                  : 'border-line text-ink-2 hover:bg-wash hover:text-ink'
            }`}
          >
            {full ? 'Batch penuh' : '+ Tambah frame'}
          </button>
        )}

        {limitMsg && (
          <p role="status" className="-mt-1 text-[12px] font-medium text-fail">
            {limitMsg}
          </p>
        )}

        {frames.length > 0 && (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5">
            {frames.map((frame, i) => (
              <li key={frame.id}>
                <FrameTile
                  frame={frame}
                  index={i}
                  platform={platform}
                  active={sel === frame.id}
                  note={notes[frame.id]}
                  needsUpload={!fileStore.has(frame.id)}
                  processing={busy && batch.currentId === frame.id}
                  removeDisabled={busy}
                  // Pilih frame + gulir ke lembar caption hanya di layar kecil (di ≥1024px keduanya terlihat)
                  onSelect={() => {
                    select(frame.id);
                    if (!window.matchMedia('(max-width: 1023px)').matches) return;
                    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                    document
                      .getElementById('lembar-caption')
                      ?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
                  }}
                  onRemove={() => removeFrame(frame.id)}
                />
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="tema-batch"
            className="text-[11px] font-semibold leading-none tracking-[0.01em] text-ink-3"
          >
            Tema utama (opsional)
          </label>
          <input
            id="tema-batch"
            type="text"
            value={tema}
            onChange={(e) => setTema(e.target.value)}
            placeholder="Halloween / Christmas / New Year / St. Patrick's Day"
            className="w-full rounded-lg border border-line bg-well px-3 py-2 text-[13.5px] text-ink placeholder:text-ink-3"
          />
          <p className="text-[12px] leading-relaxed text-ink-3">
            Berlaku untuk seluruh batch — tiap frame bisa di-override di lembar caption.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="jeda-antar-foto"
            className="text-[11px] font-semibold leading-none tracking-[0.01em] text-ink-3"
          >
            Jeda antar foto
          </label>
          <select
            id="jeda-antar-foto"
            value={batch.delaySec}
            disabled={busy}
            title={busy ? 'Tunggu batch selesai' : undefined}
            onChange={(e) => batch.setDelay(Number(e.target.value))}
            className="w-full appearance-none rounded-lg border border-line bg-well px-3 py-2 text-[13.5px] font-semibold text-ink transition-colors hover:border-ink-3 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {BATCH_DELAY_OPTIONS_SEC.map((s) => (
              <option key={s} value={s}>{s} detik</option>
            ))}
          </select>
          <p className="text-[12px] leading-relaxed text-ink-3">
            Naikkan jika sering muncul &lsquo;Menunggu limit reset&rsquo;.
          </p>
        </div>

        <GenerateButton
          disabled={generateDisabled}
          hint={generateHint}
          busy={busy}
          busyLabel={label}
          notice={batch.notice}
          onGenerate={batch.startBatch}
          onCancel={batch.cancel}
        />
        {/* M11: timpa semua hasil platform aktif — hanya bila ada minimal satu frame siap/gagal
            (frame 'menunggu' saja sudah tercakup tombol "Buat metadata") */}
        {frames.some((f) => f.status[platform] === 'siap' || f.status[platform] === 'gagal') && (
          <div className="flex flex-col gap-1.5">
            {batch.regenAllConfirm === platform ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-well px-3 py-2.5">
                <span className="text-[13px] font-semibold text-ink">Ganti semua hasil yang sudah ada?</span>
                <button
                  type="button"
                  onClick={batch.regenerateAll}
                  disabled={busy}
                  className="rounded-lg border border-fail px-3 py-1.5 text-[13px] font-semibold text-fail transition-colors hover:bg-fail hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Ya, ganti semua
                </button>
                <button
                  type="button"
                  onClick={batch.dismissRegenAll}
                  className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-semibold text-ink-2 transition-colors hover:bg-wash hover:text-ink"
                >
                  Batal
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={batch.regenerateAll}
                disabled={generateDisabled || busy}
                title={
                  busy
                    ? 'Tunggu batch selesai'
                    : generateDisabled
                      ? generateHint
                      : 'Generate ulang SEMUA frame platform ini, menimpa hasil yang sudah ada'
                }
                className="w-full rounded-lg border border-line px-4 py-2.5 text-[13.5px] font-semibold text-ink-2 transition-colors hover:bg-wash hover:text-ink disabled:cursor-not-allowed disabled:opacity-45"
              >
                Buat ulang semua
              </button>
            )}
          </div>
        )}
        <ProgressBar show={showBar} busy={busy} done={bar.done} total={bar.total} failed={bar.failed} label={label} />
        {!busy && failed > 0 && (
          <button
            type="button"
            onClick={batch.startBatch}
            className="w-full rounded-lg border border-fail px-4 py-2 text-[13px] font-semibold text-fail transition-colors hover:bg-accent-wash"
          >
            Coba lagi frame gagal
          </button>
        )}
      </div>
    </Panel>
  );
}
