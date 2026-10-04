// Kontrak seragam untuk semua provider (lihat codebase-design: satu seam, adapter per provider).
// Tiap provider (Groq/Gemini/OpenRouter) punya TEPAT SATU model (lihat models.ts).
// supportsVision menandai dukungan gambar — frame pada provider tanpa vision BERHENTI
// dengan error jelas dan TIDAK PERNAH jatuh ke mode teks-saja.
import type { Observation } from '../observation';
import type { AnalysisResult } from '../types';
import type { ParsedMetadata } from '../prompt';
import type { Platform, ProviderId } from '../types';
import type { WaitInfo } from './retry';

export type { WaitInfo };

/** base64 MURNI tanpa prefix data: */
export interface ImageInput {
  base64: string;
  mimeType: string;
}

export type TestResult =
  | { ok: true }
  | { ok: false; message: string };

export interface TestOpts {
  signal?: AbortSignal;
}

export interface GenerateArgs {
  apiKey: string;
  image: ImageInput;
  platform: Platform;
  theme?: string;
  signal?: AbortSignal;
  onWait?: (info: WaitInfo) => void;
}

// M29: argumen analisis — sama seperti GenerateArgs TANPA theme (reviewer tidak butuh tema).
export interface AnalyzeArgs {
  apiKey: string;
  image: ImageInput;
  platform: Platform;
  signal?: AbortSignal;
  onWait?: (info: WaitInfo) => void;
}

/** panggilan teks murni (Tahap B/D, juri, perbaikan) — TANPA gambar */
export interface TextArgs {
  apiKey: string;
  prompt: string;
  signal?: AbortSignal;
  onWait?: (info: WaitInfo) => void;
}

/** Tahap A: gambar nyata + tema sebagai petunjuk (bukan sumber isi) */
export interface ObserveArgs {
  apiKey: string;
  image: ImageInput;
  theme?: string;
  signal?: AbortSignal;
  onWait?: (info: WaitInfo) => void;
}
/* ---------------- juri kepatuhan ---------------- */

export type JudgeVerdict = 'pass' | 'pass_with_notes' | 'fail';
export type JudgeCheckStatus = 'ok' | 'warn' | 'fail' | 'n/a';

export interface JudgeCheck {
  rule_id: string;
  status: JudgeCheckStatus;
  evidence: string;
  fix: string;
}

export interface JudgeOutput {
  verdict: JudgeVerdict;
  score: number;
  checks: JudgeCheck[];
  unsupported_metadata: string[];
  ip_risks: string[];
  category_ok: boolean;
  suggested_category: string | null;
  needs_editorial_or_release: boolean;
  confidence: number;
}

export interface JudgeInput {
  apiKey: string;
  /** gambar dikirim HANYA bila supportsVision + toggle aktif; bila tidak, observation saja */
  image?: ImageInput;
  sendImage: boolean;
  observation: Observation;
  /** metadata yang akan diekspor, sudah diserialkan pemanggil */
  metadataText: string;
  /** blok ATURAN dari renderRulesBlock() */
  rulesBlock: string;
  /** ringkasan hasil cek keras sebagai konteks */
  hardContext: string;
  /** fakta risiko deterministik (metrik + outcome + kemiripan) — juri hanya menafsirkan */
  riskContext?: string;
  signal?: AbortSignal;
  onWait?: (info: WaitInfo) => void;
}

/** pola pesan error API yang berarti endpoint/model tidak mendukung gambar */
const VISION_ERROR_RE = /image|vision|multimodal|inline_data|content\s*part|unsupported.*media|media.*unsupported/i;

/** true bila pesan error menandakan gambar tidak didukung (bukan kuota/jaringan) */
export function isVisionNotSupportedError(message: string): boolean {
  return VISION_ERROR_RE.test(message);
}

export interface ProviderAdapter {
  id: ProviderId;
  label: string;
  /** false → frame berhenti dengan error jelas; tidak ada fallback teks-saja */
  supportsVision: boolean;
  testConnection(apiKey: string, opts?: TestOpts): Promise<TestResult>;
  generateForImage(args: GenerateArgs): Promise<ParsedMetadata>;
  /** M29: nilai kelayakan upload (reviewer), bukan metadata. */
  analyzeImage(args: AnalyzeArgs): Promise<AnalysisResult>;
  /** Tahap A: pengamatan vision dari gambar nyata (bukan dari nama file/tema). */
  observeImage(args: ObserveArgs): Promise<Observation>;
  /** panggilan teks murni (Tahap B/D, juri tanpa gambar, perbaikan) */
  callText(args: TextArgs): Promise<string>;
  /** juri kepatuhan: kirim gambar hanya bila supportsVision + input.sendImage */
  callJudge(input: JudgeInput): Promise<JudgeOutput>;
  /** inspeksi crop detail 100% (opsional; tanpa vision → dilewati). */
  inspectCrop?(input: CropInspectInput): Promise<CropInspectOutput>;
}

/** Inspeksi satu crop resolusi asli oleh model vision (temperature 0, seed tetap). */
export interface CropInspectInput {
  apiKey: string;
  image: ImageInput;
  region: string;
  seed: number;
  signal?: AbortSignal;
  onWait?: (info: WaitInfo) => void;
}

export interface CropInspectOutput {
  visible_noise: 'none' | 'mild' | 'clear';
  blur_or_soft: 'none' | 'mild' | 'clear';
  artifacts_or_halos: 'none' | 'mild' | 'clear';
  dust_or_sensor_spots: boolean;
  ai_glitches: string[];
  notes: string;
}
