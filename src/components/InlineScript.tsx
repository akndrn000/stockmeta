// Pola Next 16 "Preventing Flash": script inline yang dijalankan browser saat parsing.
// Server merender type="text/javascript" (dieksekusi saat hard navigation);
// klien merender type="text/plain" (diabaikan — navigasi lunak sudah memakai state klien).
// suppressHydrationWarning supaya perbedaan type tidak memicu hydration error.
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
