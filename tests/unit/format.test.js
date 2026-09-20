'use strict';

const {
  normalizePhone,
  toWaNumber,
  prettyPhone,
  rupiah,
  formatDateId,
  ageOn,
  toCsv,
  csvCell,
  titleCase,
} = require('../../src/utils/format');

describe('normalizePhone', () => {
  test.each([
    ['081234567890', '081234567890'],
    ['+6281234567890', '081234567890'],
    ['6281234567890', '081234567890'],
    ['81234567890', '081234567890'],
    ['0812 3456 7890', '081234567890'],
    ['0812-3456-7890', '081234567890'],
  ])('menormalkan %s menjadi %s', (masukan, harapan) => {
    expect(normalizePhone(masukan)).toBe(harapan);
  });

  test.each([['', null], [null, null], ['0812', null], ['telepon', null], ['02112345678', null]])(
    'menolak %p',
    (masukan) => {
      expect(normalizePhone(masukan)).toBeNull();
    }
  );

  test('nomor terlalu panjang ditolak', () => {
    expect(normalizePhone('0812345678901234')).toBeNull();
  });
});

describe('toWaNumber', () => {
  test('memakai awalan 62 untuk tautan wa.me', () => {
    expect(toWaNumber('081243740109')).toBe('6281243740109');
  });

  test('mengembalikan null untuk nomor tidak sah', () => {
    expect(toWaNumber('bukan nomor')).toBeNull();
  });
});

describe('prettyPhone', () => {
  test('memberi spasi agar mudah dibaca', () => {
    expect(prettyPhone('081243740109')).toBe('0812 4374 0109');
  });
});

describe('rupiah', () => {
  test.each([
    [120000, 'Rp120.000'],
    [60000, 'Rp60.000'],
    [0, 'Rp0'],
    [1234567, 'Rp1.234.567'],
  ])('%i menjadi %s', (angka, harapan) => {
    expect(rupiah(angka)).toBe(harapan);
  });
});

describe('formatDateId', () => {
  test('menulis bulan dalam bahasa Indonesia', () => {
    expect(formatDateId('2026-11-24')).toBe('24 November 2026');
  });

  test('menambah nama hari bila diminta', () => {
    expect(formatDateId('2026-11-24', { withDay: true })).toBe('Selasa, 24 November 2026');
  });

  test('mengembalikan teks kosong untuk masukan kosong', () => {
    expect(formatDateId(null)).toBe('');
  });
});

describe('ageOn', () => {
  test('menghitung umur pada hari acara', () => {
    expect(ageOn('1995-04-17', '2026-11-24')).toBe(31);
  });

  test('belum ulang tahun pada hari acara', () => {
    expect(ageOn('1995-12-25', '2026-11-24')).toBe(30);
  });

  test('tepat berulang tahun pada hari acara', () => {
    expect(ageOn('2006-11-24', '2026-11-24')).toBe(20);
  });
});

describe('csvCell', () => {
  test('melindungi sel dari penyuntikan rumus spreadsheet', () => {
    expect(csvCell('=CMD()')).toBe('"\'=CMD()"');
    expect(csvCell('+62812')).toBe('"\'+62812"');
  });

  test('menggandakan tanda kutip', () => {
    expect(csvCell('Ukuran "L"')).toBe('"Ukuran ""L"""');
  });
});

describe('toCsv', () => {
  test('menyusun header dan baris', () => {
    const csv = toCsv(
      [{ nama: 'Budi', paket: 'lengkap' }],
      [
        { header: 'Nama', value: 'nama' },
        { header: 'Paket', value: (r) => r.paket.toUpperCase() },
      ]
    );
    expect(csv).toBe('"Nama","Paket"\r\n"Budi","LENGKAP"');
  });
});

describe('titleCase', () => {
  test('merapikan kapitalisasi dan spasi ganda', () => {
    expect(titleCase('  budi   SANTOSO ')).toBe('Budi Santoso');
  });
});
