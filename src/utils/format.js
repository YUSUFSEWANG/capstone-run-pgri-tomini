'use strict';

/**
 * Normalisasi nomor telepon Indonesia ke bentuk kanonik `08xxxxxxxxxx`.
 * Menerima 0812..., +62812..., 62812..., dan variasi berspasi/strip.
 * Mengembalikan null jika bukan nomor yang masuk akal.
 */
function normalizePhone(input) {
  if (!input) return null;
  let digits = String(input).replace(/[^\d+]/g, '');

  if (digits.startsWith('+62')) digits = '0' + digits.slice(3);
  else if (digits.startsWith('62')) digits = '0' + digits.slice(2);
  else if (digits.startsWith('8')) digits = '0' + digits;

  digits = digits.replace(/\D/g, '');

  if (!/^08\d{8,12}$/.test(digits)) return null;
  return digits;
}

/** Ubah nomor kanonik jadi format wa.me (62xxx). */
function toWaNumber(phone) {
  const normal = normalizePhone(phone);
  return normal ? '62' + normal.slice(1) : null;
}

/** Tampilkan nomor dengan spasi agar mudah dibaca: 0812 3456 7890 */
function prettyPhone(phone) {
  const normal = normalizePhone(phone);
  if (!normal) return phone || '';
  return normal.replace(/(\d{4})(\d{4})(\d+)/, '$1 $2 $3');
}

/** 120000 -> "Rp120.000" */
function rupiah(amount) {
  const value = Number(amount) || 0;
  return 'Rp' + value.toLocaleString('id-ID');
}

const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

const DAYS_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

/** "2026-11-24" -> "24 November 2026" (opsi withDay menambah "Selasa, ") */
function formatDateId(isoDate, { withDay = false } = {}) {
  if (!isoDate) return '';
  const date = new Date(String(isoDate).slice(0, 10) + 'T00:00:00');
  if (Number.isNaN(date.getTime())) return String(isoDate);
  const base = `${date.getDate()} ${MONTHS_ID[date.getMonth()]} ${date.getFullYear()}`;
  return withDay ? `${DAYS_ID[date.getDay()]}, ${base}` : base;
}

/** "2026-09-19 14:03:22" (UTC dari SQLite) -> "19 Sep 2026, 22:03 WITA" */
function formatDateTimeId(sqlDateTime) {
  if (!sqlDateTime) return '';
  const date = new Date(String(sqlDateTime).replace(' ', 'T') + 'Z');
  if (Number.isNaN(date.getTime())) return String(sqlDateTime);
  const parts = new Intl.DateTimeFormat('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Makassar',
  }).format(date);
  return `${parts} WITA`;
}

/** Hitung umur pada tanggal acara. */
function ageOn(birthDate, referenceDate) {
  const birth = new Date(String(birthDate).slice(0, 10) + 'T00:00:00');
  const ref = new Date(String(referenceDate).slice(0, 10) + 'T00:00:00');
  if (Number.isNaN(birth.getTime()) || Number.isNaN(ref.getTime())) return null;
  let age = ref.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    ref.getMonth() < birth.getMonth() ||
    (ref.getMonth() === birth.getMonth() && ref.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

/** Bungkus satu sel CSV agar aman dibuka di Excel. */
function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  // Cegah formula injection saat file dibuka di spreadsheet.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Susun larik objek jadi teks CSV lengkap dengan header. */
function toCsv(rows, columns) {
  const header = columns.map((col) => csvCell(col.header)).join(',');
  const body = rows.map((row) =>
    columns.map((col) => csvCell(typeof col.value === 'function' ? col.value(row) : row[col.value])).join(',')
  );
  return [header, ...body].join('\r\n');
}

/** Rapikan kapitalisasi nama: "budi  SANTOSO" -> "Budi Santoso" */
function titleCase(text) {
  return String(text || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\S+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

module.exports = {
  normalizePhone,
  toWaNumber,
  prettyPhone,
  rupiah,
  formatDateId,
  formatDateTimeId,
  ageOn,
  csvCell,
  toCsv,
  titleCase,
  MONTHS_ID,
  DAYS_ID,
};
