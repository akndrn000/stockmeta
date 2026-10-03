// Kontrak seragam untuk semua provider (lihat codebase-design: satu seam, adapter per provider).
// Tiap provider punya TEPAT SATU model (lihat models.ts) — tanpa pemilihan model dinamis.
import type { AnalysisResult } from '../types';
import type { ParsedMetadata } from '../prompt';
import type { Platform, ProviderId } from '../types';
import type { WaitInfo } from './retry';

/** base64 MURNI tanpa prefix data: */
export interface ImageInput {
  base64: string;
  mimeType: string;
}

export type TestResult =
  | { ok: true }
  | { ok: false; message: string };

export interface GenerateArgs {
  apiKey: string;
  image: ImageInput;
  platform: Platform;
  theme?: string;
  signal?: AbortSignal;
  onWait?: (info: WaitInfo) => void;
}

// M29: argumen analisis — sama seperti GenerateArgs TANPA theme (reviewer tidak butuh tema).
// `model` diterima tapi diabaikan: tiap provider memakai TEPAT SATU model (models.ts).
export interface AnalyzeArgs {
  apiKey: string;
  model?: string;
  image: ImageInput;
  platform: Platform;
  signal?: AbortSignal;
  onWait?: (info: WaitInfo) => void;
}

export interface ProviderAdapter {
  id: ProviderId;
  testConnection(apiKey: string, signal?: AbortSignal): Promise<TestResult>;
  generateForImage(args: GenerateArgs): Promise<ParsedMetadata>;
  /** M29: nilai kelayakan upload (reviewer), bukan metadata. */
  analyzeImage(args: AnalyzeArgs): Promise<AnalysisResult>;
}
