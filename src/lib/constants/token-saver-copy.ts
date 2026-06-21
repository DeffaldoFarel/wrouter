// Teks deskripsi untuk fitur Token Saver (RTK & Caveman Mode).
// Dipakai bersama di halaman Dashboard dan Settings.
//
// Ada dua varian: SHORT (ringkas, untuk kartu kecil di Dashboard)
// dan LONG (lebih lengkap, untuk panel detail di Settings).
// Kalau mau benar-benar diseragamkan, tinggal arahkan kedua tempat
// pakai varian yang sama.

export const RTK_DESCRIPTION_SHORT =
  "Compress tool_result. Saves 20-40% input tokens.";

export const RTK_DESCRIPTION_LONG =
  "Compresses tool_result content. Saves 20-40% input tokens with no quality loss.";

export const CAVEMAN_DESCRIPTION_SHORT =
  "Terse-style output. Saves up to 65% output tokens.";

export const CAVEMAN_DESCRIPTION_LONG =
  "Aggressive terse-style output. Saves up to 65% output tokens. May reduce quality.";

// Objek gabungan biar gampang di-import dalam satu nama.
export const TOKEN_SAVER_DESCRIPTION = {
  rtk: {
    short: RTK_DESCRIPTION_SHORT,
    long: RTK_DESCRIPTION_LONG,
  },
  caveman: {
    short: CAVEMAN_DESCRIPTION_SHORT,
    long: CAVEMAN_DESCRIPTION_LONG,
  },
} as const;
