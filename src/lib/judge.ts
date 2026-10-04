// Juri kepatuhan AI: prompt, parser ketat, dan konsensus deterministik.
// Transport (fetch) milik adapter (callJudge); file ini murni logika tanpa jaringan.
import type { Observation } from './observation';
import { JUDGE_IDEAL_COUNT, LOW_CONFIDENCE_THRESHOLD, RULE_IDS } from './platform-rules';
import type { JudgeCheck, JudgeCheckStatus, JudgeInput, JudgeOutput, JudgeVerdict } from './providers/types';

/** Label baku hasil — selalu saran, bukan keputusan platform. */
export const JUDGE_DISCLAIMER = 'Perkiraan kelolosan (saran, bukan keputusan platform)';

/** hash djb2 slot metadata — cache juri invalid saat metadata berubah */
export function hashMetadata(metadata: unknown): string {
  const s = JSON.stringify(metadata ?? null);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

/** Prompt perbaikan: metadata + fix gabungan → revisi (hasil wajib cek keras ulang). */
export function buildFixPrompt(metadataText: string, fixes: string[]): string {
  return [
    'Perbaiki metadata stok foto di bawah mengikuti SARAN PERBAIKAN juri. Ubah seminimal mungkin; JANGAN menambah fakta baru yang tidak ada di metadata.',
    '',
    'METADATA:',
    metadataText,
    '',
    'SARAN PERBAIKAN:',
    fixes.length ? fixes.map((f) => '- ' + f).join('\n') : '(tidak ada saran spesifik — rapikan sesuai aturan umum)',
    '',
    'Keluarkan HANYA JSON valid dengan field yang sama (title/description/keywords/category atau categories), tanpa teks tambahan, tanpa markdown code block.'
  ].join('\n');
}

export function buildJudgePrompt(input: { observation: Observation; metadataText: string; rulesBlock: string; hardContext: string; withoutImage: boolean }): string {
  const lines = [
    'Kamu adalah JURI KEPATUHAN metadata stok foto. Nilai HANYA berdasar ATURAN yang diberikan dan isi gambar/observasi.',
    'JANGAN mengarang aturan di luar daftar. Hal di luar aturan = status "n/a", BUKAN gagal.',
    input.withoutImage
      ? 'Catatan: kamu TIDAK menerima gambar (hanya observasi JSON) — tandai ini dan jangan menghukum metadata karenanya.'
      : 'Kamu menerima gambar + observasi JSON — utamakan isi gambar bila keduanya berbeda.',
    '',
    input.rulesBlock,
    '',
    'KONTEKS CEK KERAS (deterministik, sudah pasti):',
    input.hardContext || '(tidak ada temuan cek keras)',
    '',
    'OBSERVASI GAMBAR (JSON):',
    JSON.stringify(input.observation),
    '',
    'METADATA YANG AKAN DIEKSPOR:',
    input.metadataText,
    '',
    'Format JSON:',
    '{"verdict": "pass"|"pass_with_notes"|"fail", "score": 0-100,',
    ' "checks": [{"rule_id": string (WAJIB salah satu RULE_ID di atas), "status": "ok"|"warn"|"fail"|"n/a", "evidence": string, "fix": string}],',
    ' "unsupported_metadata": string[] (item metadata yang tak didukung gambar), "ip_risks": string[],',
    ' "category_ok": boolean, "suggested_category": string|null,',
    ' "needs_editorial_or_release": boolean, "confidence": 0-1}',
    '',
    'Keluarkan HANYA JSON valid, tanpa teks tambahan, tanpa markdown code block.'
  ];
  return lines.join('\n');
}

function jsonError(message: string): Error {
  return Object.assign(new Error(message), { kind: 'json' });
}

function pick(o: Record<string, unknown>, k: string): unknown {
  const hit = Object.keys(o).find((x) => x.toLowerCase() === k);
  return hit ? o[hit] : undefined;
}

const VERDICTS: readonly string[] = ['pass', 'pass_with_notes', 'fail'];
const STATUSES: readonly string[] = ['ok', 'warn', 'fail', 'n/a'];
const KNOWN_RULES = new Set<string>(RULE_IDS);

/**
 * Parser ketat keluaran juri. rule_id yang tidak ada di platform-rules.ts → error
 * kind 'json' (di-retry; gagal permanen = frame gagal, bukan lolos diam-diam).
 */
export function parseJudgeResponse(raw: string): JudgeOutput {
  const s = String(raw).trim()
    .replace(/^```[a-z]*\s*/i, '')
    .replace(/\s*```$/, '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a === -1 || b <= a) throw jsonError('JSON tidak valid');
  let json: unknown;
  try { json = JSON.parse(s.slice(a, b + 1)); }
  catch { throw jsonError('JSON tidak valid'); }
  if (typeof json !== 'object' || json === null) throw jsonError('JSON tidak valid');
  const o = json as Record<string, unknown>;

  const verdict = pick(o, 'verdict');
  if (typeof verdict !== 'string' || !VERDICTS.includes(verdict)) {
    throw jsonError('Hasil juri tidak valid: verdict tidak dikenal');
  }
  const score = pick(o, 'score');
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 100) {
    throw jsonError('Hasil juri tidak valid: score di luar 0-100');
  }
  const confidence = pick(o, 'confidence');
  if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw jsonError('Hasil juri tidak valid: confidence di luar 0-1');
  }
  const checksRaw = pick(o, 'checks');
  if (!Array.isArray(checksRaw)) throw jsonError('Hasil juri tidak valid: checks bukan array');
  const checks: JudgeCheck[] = checksRaw.map((item) => {
    if (typeof item !== 'object' || item === null) throw jsonError('Hasil juri tidak valid: check rusak');
    const c = item as Record<string, unknown>;
    if (typeof c.rule_id !== 'string' || !KNOWN_RULES.has(c.rule_id)) {
      throw jsonError('Hasil juri tidak valid: rule_id tidak dikenal: ' + String(c.rule_id));
    }
    if (typeof c.status !== 'string' || !STATUSES.includes(c.status)) {
      throw jsonError('Hasil juri tidak valid: status check tidak dikenal');
    }
    return {
      rule_id: c.rule_id,
      status: c.status as JudgeCheckStatus,
      evidence: typeof c.evidence === 'string' ? c.evidence : '',
      fix: typeof c.fix === 'string' ? c.fix : ''
    };
  });
  const strList = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => String(x ?? '').trim()).filter(Boolean) : [];
  const categoryOk = pick(o, 'category_ok');
  const suggested = pick(o, 'suggested_category');
  const needsRelease = pick(o, 'needs_editorial_or_release');
  return {
    verdict: verdict as JudgeVerdict,
    score,
    checks,
    unsupported_metadata: strList(pick(o, 'unsupported_metadata')),
    ip_risks: strList(pick(o, 'ip_risks')),
    category_ok: categoryOk === true,
    suggested_category: typeof suggested === 'string' && suggested.trim() ? suggested.trim() : null,
    needs_editorial_or_release: needsRelease === true,
    confidence
  };
}

/** Prompt juri lengkap dari input transport (dipakai adapter sebelum POST). */
export function judgePromptFor(input: JudgeInput): string {
  return buildJudgePrompt({
    observation: input.observation,
    metadataText: input.metadataText,
    rulesBlock: input.rulesBlock,
    hardContext: input.hardContext,
    withoutImage: !input.sendImage
  });
}

/* ---------------- konsensus deterministik ---------------- */

export type CombinedBadge = 'LOLOS' | 'LOLOS_DENGAN_CATATAN' | 'TIDAK_LOLOS' | 'PERLU_DITINJAU';

export const BADGE_LABEL: Record<CombinedBadge, string> = {
  LOLOS: 'LOLOS',
  LOLOS_DENGAN_CATATAN: 'LOLOS DENGAN CATATAN',
  TIDAK_LOLOS: 'TIDAK LOLOS',
  PERLU_DITINJAU: 'PERLU DITINJAU'
};

export interface MergedCheck {
  rule_id: string;
  status: JudgeCheckStatus;
  evidence: string[];
  fix: string;
}

const WORST: Record<JudgeCheckStatus, number> = { fail: 3, warn: 2, ok: 1, 'n/a': 0 };

/** Gabung checks per rule_id: status terburuk, semua evidence, fix paling sering. */
export function mergeChecks(judges: JudgeOutput[]): MergedCheck[] {
  const byRule = new Map<string, { status: JudgeCheckStatus; evidence: string[]; fixes: Map<string, number> }>();
  for (const j of judges) {
    for (const c of j.checks) {
      let slot = byRule.get(c.rule_id);
      if (!slot) {
        slot = { status: 'n/a', evidence: [], fixes: new Map() };
        byRule.set(c.rule_id, slot);
      }
      if (WORST[c.status] > WORST[slot.status]) slot.status = c.status;
      const ev = c.evidence.trim();
      if (ev && !slot.evidence.includes(ev)) slot.evidence.push(ev);
      const fix = c.fix.trim();
      if (fix) slot.fixes.set(fix, (slot.fixes.get(fix) ?? 0) + 1);
    }
  }
  return [...byRule.entries()].map(([rule_id, slot]) => {
    let fix = '';
    let best = 0;
    for (const [text, n] of slot.fixes) {
      if (n > best) { best = n; fix = text; }
    }
    return { rule_id, status: slot.status, evidence: slot.evidence, fix };
  });
}

export interface ConsensusResult {
  badge: CombinedBadge;
  checks: MergedCheck[];
  unsupported: string[];
  ipRisks: string[];
  needsEditorialOrRelease: boolean;
  avgConfidence: number;
  judgeCount: number;
  judgeNote: string;
}

const hasConcreteEvidence = (j: JudgeOutput): boolean =>
  j.checks.some((c) => c.status === 'fail' && c.evidence.trim().length > 0) || j.unsupported_metadata.length > 0;

/**
 * Konsensus deterministik:
 * - 1+ error cek keras → TIDAK LOLOS (apa pun kata juri).
 * - Semua pass → LOLOS; tanpa fail tapi ada pass_with_notes → LOLOS DENGAN CATATAN.
 * - Fail ber-evidence tanpa pass → TIDAK LOLOS; campuran pass+fail → PERLU DITINJAU.
 * - Rata-rata confidence < 0.6 → PERLU DITINJAU (menurunkan LOLOS/CATATAN).
 */
export function consensusJudge(hardErrorCount: number, judges: JudgeOutput[]): ConsensusResult {
  const unsupported = [...new Set(judges.flatMap((j) => j.unsupported_metadata))];
  const ipRisks = [...new Set(judges.flatMap((j) => j.ip_risks))];
  const needsEditorialOrRelease = judges.some((j) => j.needs_editorial_or_release);
  const avgConfidence = judges.length
    ? judges.reduce((s, j) => s + j.confidence, 0) / judges.length
    : 0;
  const judgeNote = 'juri: ' + judges.length + ' dari ' + JUDGE_IDEAL_COUNT;
  const base: Omit<ConsensusResult, 'badge'> = {
    checks: mergeChecks(judges),
    unsupported,
    ipRisks,
    needsEditorialOrRelease,
    avgConfidence,
    judgeCount: judges.length,
    judgeNote
  };

  if (hardErrorCount > 0) return { ...base, badge: 'TIDAK_LOLOS' };
  if (!judges.length) return { ...base, badge: 'PERLU_DITINJAU' };

  const verdicts = judges.map((j) => j.verdict);
  const fails = judges.filter((j) => j.verdict === 'fail');
  let badge: CombinedBadge;
  if (fails.length === 0) {
    badge = verdicts.every((v) => v === 'pass') ? 'LOLOS' : 'LOLOS_DENGAN_CATATAN';
  } else if (verdicts.some((v) => v === 'pass')) {
    badge = 'PERLU_DITINJAU'; // juri berbeda pendapat
  } else {
    badge = fails.some(hasConcreteEvidence) ? 'TIDAK_LOLOS' : 'PERLU_DITINJAU';
  }
  if ((badge === 'LOLOS' || badge === 'LOLOS_DENGAN_CATATAN') && avgConfidence < LOW_CONFIDENCE_THRESHOLD) {
    badge = 'PERLU_DITINJAU';
  }
  return { ...base, badge };
}
