// Pipeline metadata A→B→C→D per frame (murni, tanpa React):
// A observasi vision (di-cache pemanggil di sesi) → B metadata teks dari observation
// → C compliance deterministik → D grounding ketat (opsional).
// Gambar NYATA selalu dikirim di Tahap A; Tahap B/D tidak pernah menerima gambar.
// Provider tanpa supportsVision → error noVision, frame berhenti, TANPA fallback teks-saja.
import {
  complianceWarnings,
  defaultCategoryHint,
  type ComplianceWarning,
  type Observation
} from './observation';
import {
  ADOBE_KEYWORDS_MIN,
  SS_KEYWORDS_MIN,
  adobeCategoryLabels,
  shutterstockCategoryNames
} from './platform-rules';
import {
  buildGroundingPrompt,
  buildStageBPrompt,
  parseGroundingResponse,
  parseMetadataResponse,
  type ParsedMetadata
} from './prompt';
import { ProviderError } from './providers/retry';
import type { ImageInput, ProviderAdapter, WaitInfo } from './providers/types';
import type { Platform } from './types';

export interface PipelineArgs {
  adapter: ProviderAdapter;
  apiKey: string;
  image: ImageInput;
  platform: Platform;
  theme?: string;
  /** observation cache sesi — bila ada, Tahap A dilewati (ganti platform tidak observasi ulang) */
  cachedObservation?: Observation;
  strictVerify: boolean;
  signal?: AbortSignal;
  onWait?: (info: WaitInfo) => void;
  /** log peristiwa (mis. item grounding yang dihapus) — ditampilkan UI */
  log?: (msg: string) => void;
}

export interface PipelineResult {
  observation: Observation;
  /** true bila Tahap A benar-benar memanggil vision */
  observedFresh: boolean;
  metadata: ParsedMetadata;
  compliance: ComplianceWarning[];
  illustrationSuggested: boolean;
  editorialSuggested: boolean;
  /** keyword tak didukung yang DIHAPUS (terlihat di UI, dicatat log) */
  removedUnsupported: string[];
  /** kategori model tetap di luar daftar resmi setelah retry */
  categoryNeedsReview: boolean;
  /** true bila Tahap B diregenerasi (grounding / kategori) */
  regenerated: boolean;
}

function minKeywords(platform: Platform): number {
  return platform === 'adobe' ? ADOBE_KEYWORDS_MIN : SS_KEYWORDS_MIN;
}

function categoryValid(platform: Platform, category: string | undefined): boolean {
  if (!category) return false;
  return platform === 'adobe'
    ? adobeCategoryLabels().includes(category)
    : shutterstockCategoryNames().includes(category);
}

async function genStageB(args: PipelineArgs, obs: Observation): Promise<{ meta: ParsedMetadata; needsReview: boolean }> {
  const hint = defaultCategoryHint(obs, args.platform);
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await args.adapter.callText({
      apiKey: args.apiKey,
      prompt: buildStageBPrompt(args.platform, obs, hint),
      signal: args.signal,
      onWait: args.onWait
    });
    const meta = parseMetadataResponse(text, args.platform);
    // kategori di luar daftar resmi → ditolak lalu retry 1x (parser menandainya categoryAuto)
    if (!meta.categoryAuto && categoryValid(args.platform, meta.category)) {
      return { meta, needsReview: false };
    }
    if (attempt === 0) {
      args.log?.('Kategori di luar daftar resmi — regenerasi metadata 1x.');
      continue;
    }
    // tetap salah → JANGAN lolos diam-diam: kosongkan + tandai perlu ditinjau
    return { meta: { ...meta, category: '', categoryAuto: true }, needsReview: true };
  }
  throw new ProviderError('Gagal membuat metadata', { retryable: false });
}

function applyGrounding(keywords: string[], unsupported: string[]): { kept: string[]; removed: string[] } {
  const drop = new Set(unsupported.map((u) => u.trim().toLowerCase()).filter(Boolean));
  const kept: string[] = [];
  const removed: string[] = [];
  for (const kw of keywords) {
    if (drop.has(kw.trim().toLowerCase())) removed.push(kw);
    else kept.push(kw);
  }
  return { kept, removed };
}

export async function runFramePipeline(args: PipelineArgs): Promise<PipelineResult> {
  if (!args.adapter.supportsVision) {
    throw new ProviderError(
      `Provider ${args.adapter.label} tidak mendukung gambar — frame dihentikan (tanpa mode teks-saja).`,
      { retryable: false, noVision: true }
    );
  }
  // Tahap A — gambar nyata (atau cache sesi)
  let observation = args.cachedObservation;
  let observedFresh = false;
  if (!observation) {
    observation = await args.adapter.observeImage({
      apiKey: args.apiKey,
      image: args.image,
      theme: args.theme,
      signal: args.signal,
      onWait: args.onWait
    });
    observedFresh = true;
  }
  const obs: Observation = observation;

  // Tahap B — metadata teks dari observation (tanpa gambar)
  let regenerated = false;
  let stage = await genStageB(args, obs);
  let meta = stage.meta;
  let categoryNeedsReview = stage.needsReview;

  // Tahap D — verifikasi grounding (toggle default aktif)
  let removedUnsupported: string[] = [];
  if (args.strictVerify) {
    const ground = async (keywords: string[]): Promise<string[]> =>
      parseGroundingResponse(await args.adapter.callText({
        apiKey: args.apiKey,
        prompt: buildGroundingPrompt(obs, keywords),
        signal: args.signal,
        onWait: args.onWait
      }));
    let applied = applyGrounding(meta.keywords ?? [], await ground(meta.keywords ?? []));
    if (applied.kept.length < minKeywords(args.platform)) {
      // di bawah minimum → regenerasi Tahap B 1x lalu grounding ulang
      args.log?.('Keyword di bawah minimum setelah verifikasi — regenerasi 1x.');
      regenerated = true;
      stage = await genStageB(args, obs);
      meta = stage.meta;
      categoryNeedsReview = stage.needsReview;
      applied = applyGrounding(meta.keywords ?? [], await ground(meta.keywords ?? []));
    }
    if (applied.kept.length < minKeywords(args.platform)) {
      throw new Error(
        `Verifikasi ketat menghapus keyword tak didukung — keyword tidak cukup (sisa ${applied.kept.length}), tambah manual atau buat ulang.`
      );
    }
    if (applied.removed.length) {
      args.log?.(`Verifikasi ketat menghapus: ${applied.removed.join(', ')}`);
    }
    removedUnsupported = applied.removed;
    meta = { ...meta, keywords: applied.kept };
  }

  // Tahap C — compliance deterministik dari observation
  const comp = complianceWarnings(obs, args.platform);

  return {
    observation: obs,
    observedFresh,
    metadata: meta,
    compliance: comp.warnings,
    illustrationSuggested: comp.illustrationSuggested,
    editorialSuggested: comp.editorialSuggested,
    removedUnsupported,
    categoryNeedsReview,
    regenerated
  };
}
