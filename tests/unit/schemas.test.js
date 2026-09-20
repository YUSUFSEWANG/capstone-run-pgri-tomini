'use strict';

const { registrationSchema, toFieldErrors, MIN_AGE } = require('../../src/utils/schemas');
const { pesertaContoh } = require('../bantu');

/** Jalankan validasi dan kembalikan peta bidang -> pesan. */
function galatDari(data) {
  const hasil = registrationSchema.safeParse(data);
  if (hasil.success) return null;
  return Object.fromEntries(toFieldErrors(hasil.error).map((g) => [g.field, g.message]));
}

describe('registrationSchema — data yang benar', () => {
  test('menerima pendaftaran lengkap', () => {
    const hasil = registrationSchema.safeParse(pesertaContoh());
    expect(hasil.success).toBe(true);
  });

  test('merapikan nama dan menormalkan nomor telepon', () => {
    const hasil = registrationSchema.safeParse(
      pesertaContoh({ full_name: '  siti   RAHMAWATI ', phone: '+62 812-3456-7890' })
    );
    expect(hasil.success).toBe(true);
    expect(hasil.data.full_name).toBe('Siti Rahmawati');
    expect(hasil.data.phone).toBe('081234567890');
  });

  test('mengubah isian opsional yang kosong menjadi null', () => {
    const hasil = registrationSchema.safeParse(
      pesertaContoh({ email: '', address: '   ', institution: '', health_note: '' })
    );
    expect(hasil.success).toBe(true);
    expect(hasil.data.email).toBeNull();
    expect(hasil.data.address).toBeNull();
    expect(hasil.data.institution).toBeNull();
  });

  test('menerima persetujuan dalam bentuk teks dari formulir HTML', () => {
    expect(registrationSchema.safeParse(pesertaContoh({ agreement: 'on' })).success).toBe(true);
    expect(registrationSchema.safeParse(pesertaContoh({ agreement: 'true' })).success).toBe(true);
  });
});

describe('registrationSchema — data yang salah', () => {
  test('nama terlalu pendek', () => {
    expect(galatDari(pesertaContoh({ full_name: 'Ab' }))).toHaveProperty('full_name');
  });

  test('nomor WhatsApp tidak masuk akal', () => {
    expect(galatDari(pesertaContoh({ phone: '123' }))).toHaveProperty('phone');
  });

  test('email salah format', () => {
    expect(galatDari(pesertaContoh({ email: 'bukan-email' }))).toHaveProperty('email');
  });

  test(`peserta di bawah ${MIN_AGE} tahun pada hari acara ditolak`, () => {
    expect(galatDari(pesertaContoh({ birth_date: '2020-01-01' }))).toHaveProperty('birth_date');
  });

  test('paket lengkap tanpa ukuran jersey ditolak', () => {
    const galat = galatDari(pesertaContoh({ package: 'lengkap', jersey_size: '' }));
    expect(galat.jersey_size).toMatch(/ukuran/i);
  });

  test('paket hemat tanpa ukuran jersey diterima', () => {
    const hasil = registrationSchema.safeParse(pesertaContoh({ package: 'hemat', jersey_size: '' }));
    expect(hasil.success).toBe(true);
    expect(hasil.data.jersey_size).toBeNull();
  });

  test('tanpa persetujuan ditolak', () => {
    expect(galatDari(pesertaContoh({ agreement: false }))).toHaveProperty('agreement');
  });

  test('kontak darurat wajib diisi', () => {
    const galat = galatDari(pesertaContoh({ emergency_name: '', emergency_phone: '' }));
    expect(galat).toHaveProperty('emergency_name');
    expect(galat).toHaveProperty('emergency_phone');
  });

  test('paket di luar daftar ditolak', () => {
    expect(galatDari(pesertaContoh({ package: 'vip' }))).toHaveProperty('package');
  });

  test('catatan kesehatan melebihi batas ditolak', () => {
    expect(galatDari(pesertaContoh({ health_note: 'a'.repeat(301) }))).toHaveProperty('health_note');
  });
});
