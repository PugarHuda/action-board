// Tiny i18n for Action Board — EN + ID. Pure, no DOM, no deps.
// app.js applies these to [data-i18n] / [data-i18n-ph] elements and to
// dynamically built strings via t(lang, key, vars).

export const LANGS = ["en", "id"];

const NOTES_PH_EN =
  "Paste raw meeting notes or a brain-dump here…\n\n" +
  "e.g.\n- @Sara to send the deck by Fri, urgent\n- follow up with vendor about pricing\n" +
  "- Tom will fix the login bug tomorrow\n- nice to have: dark mode someday";
const NOTES_PH_ID =
  "Tempel catatan rapat atau brain-dump mentah di sini…\n\n" +
  "mis.\n- @Sara kirim deck sebelum Jum, urgent\n- follow up ke vendor soal harga\n" +
  "- Tom akan fix bug login besok\n- nice to have: dark mode nanti";

export const DICT = {
  en: {
    ready: "Ready — paste notes to begin",
    connecting: "Connecting…",
    connectFail: "Failed to connect to Anna runtime",
    sendSummary: "↗ Send summary to chat",
    notesPlaceholder: NOTES_PH_EN,
    extract: "✦ Extract action items",
    extracting: "✦ Extracting…",
    ownerLabel: "Owner",
    everyone: "Everyone",
    sortPriority: "↓ Priority",
    addPlaceholder: "Add a task manually…",
    addBtn: "+ Add",
    clear: "Clear",
    colTodo: "To Do",
    colDoing: "In Progress",
    colDone: "Done",
    emptyTitle: "No action items yet.",
    emptyBody: "Paste notes above and hit Extract — the AI does the first pass, you stay the reviewer.",
    prioHigh: "High", prioMedium: "Medium", prioLow: "Low",
    // dynamic / templated
    pasteFirst: "Paste some notes first.",
    added: "Added {n} item{s} ({src}){dup}. Review & approve →",
    dupSuffix: ", skipped {d} duplicate{s}",
    alreadyOnBoard: "Those items are already on the board.",
    noneDetected: "No action items detected. Try clearer notes.",
    extractFail: "Extraction failed: {e}",
    nothingToSummarize: "Nothing to summarize yet.",
    summarySent: "Summary sent to chat ✓",
    summaryFail: "Could not post to chat: {e}",
    boardCleared: "Board cleared.",
    nothingToExport: "Nothing to export yet.",
    exported: "Exported {f}",
    exportClip: "Download blocked by sandbox — copied {f} contents to clipboard.",
    exportFail: "Export failed in this runtime.",
    confirmClear: "Remove all cards from the board?",
  },
  id: {
    ready: "Siap — tempel catatan untuk mulai",
    connecting: "Menyambungkan…",
    connectFail: "Gagal terhubung ke runtime Anna",
    sendSummary: "↗ Kirim ringkasan ke chat",
    notesPlaceholder: NOTES_PH_ID,
    extract: "✦ Ekstrak action item",
    extracting: "✦ Mengekstrak…",
    ownerLabel: "Pemilik",
    everyone: "Semua",
    sortPriority: "↓ Prioritas",
    addPlaceholder: "Tambah tugas manual…",
    addBtn: "+ Tambah",
    clear: "Bersihkan",
    colTodo: "To Do",
    colDoing: "Dikerjakan",
    colDone: "Selesai",
    emptyTitle: "Belum ada action item.",
    emptyBody: "Tempel catatan di atas lalu klik Ekstrak — AI pass pertama, kamu tetap peninjau.",
    prioHigh: "Tinggi", prioMedium: "Sedang", prioLow: "Rendah",
    pasteFirst: "Tempel catatan dulu.",
    added: "Menambahkan {n} item ({src}){dup}. Tinjau & setujui →",
    dupSuffix: ", melewati {d} duplikat",
    alreadyOnBoard: "Item itu sudah ada di papan.",
    noneDetected: "Tak ada action item terdeteksi. Coba catatan yang lebih jelas.",
    extractFail: "Ekstraksi gagal: {e}",
    nothingToSummarize: "Belum ada yang bisa diringkas.",
    summarySent: "Ringkasan terkirim ke chat ✓",
    summaryFail: "Gagal kirim ke chat: {e}",
    boardCleared: "Papan dibersihkan.",
    nothingToExport: "Belum ada yang bisa diekspor.",
    exported: "Terekspor {f}",
    exportClip: "Unduhan diblokir sandbox — isi {f} disalin ke clipboard.",
    exportFail: "Ekspor gagal di runtime ini.",
    confirmClear: "Hapus semua kartu dari papan?",
  },
};

// Translate `key` for `lang`, interpolating {vars}. Falls back to EN, then key.
export function t(lang, key, vars) {
  const s = (DICT[lang] && DICT[lang][key]) ?? DICT.en[key] ?? key;
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : ""));
}
