// Penyimpanan File asli di memori (module-level) — hanya hidup selama tab terbuka.
// Tidak pernah masuk localStorage (hanya thumbnail yang dipersistenkan ke sesi).
const store = new Map<number, File>();

export const fileStore = {
  set(id: number, file: File): void { store.set(id, file); },
  get(id: number): File | undefined { return store.get(id); },
  has(id: number): boolean { return store.has(id); },
  delete(id: number): void { store.delete(id); },
  clear(): void { store.clear(); }
};
