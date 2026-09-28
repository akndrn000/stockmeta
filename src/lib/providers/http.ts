// Baca body respons sekali: JSON kalau valid, teks apa adanya kalau bukan (untuk pesan error
// dan info retry di dalam body). Tidak pernah mencetak URL/header — key tidak boleh bocor.
export async function readBody(res: Response): Promise<{ data: unknown; raw: string }> {
  const raw = await res.text().catch(() => '');
  let data: unknown = null;
  if (raw) {
    try { data = JSON.parse(raw); }
    catch { data = null; }
  }
  return { data, raw };
}
