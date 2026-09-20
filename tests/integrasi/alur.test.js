'use strict';

const bantu = require('../bantu');
const uji = bantu.siapkan();

const request = require('supertest');
const { app, db, akun } = uji;
const { pesertaContoh, JPEG_SAH } = bantu;

const settingsService = require('../../src/services/settings.service');

beforeAll(() => {
  // Uji dijalankan kapan saja, jadi jadwal diabaikan dan formulir dipaksa buka.
  settingsService.update({ registration_open: 'open' });
});

afterAll(() => uji.bersihkan());

/** Daftarkan satu peserta dan kembalikan datanya. */
async function daftar(ubah = {}) {
  const res = await request(app).post('/api/registrations').send(pesertaContoh(ubah));
  return res;
}

// ==========================================================================
describe('Pendaftaran', () => {
  test('menyimpan peserta dan menerbitkan nomor registrasi berurutan', async () => {
    const res = await daftar();

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.participant.reg_number).toMatch(/^FRPT-2026-\d{4}$/);
    expect(res.body.participant.payment_status).toBe('pending');
    expect(res.body.participant.amount).toBe(120000);
    expect(res.body.payment.bank.account).toBe('036301026063507');

    const kedua = await daftar({ phone: '081100000002', jersey_size: 'L' });
    expect(kedua.body.participant.reg_number).toBe('FRPT-2026-0002');
  });

  test('menyamarkan nomor telepon pada balasan publik', async () => {
    const res = await daftar({ phone: '081399887766', jersey_size: 'S' });
    expect(res.body.participant.phone_masked).toMatch(/^0813\*+766$/);
  });

  test('menolak data yang tidak lengkap dengan pesan per bidang', async () => {
    const res = await request(app).post('/api/registrations').send({ full_name: 'A' });

    expect(res.status).toBe(422);
    expect(res.body.ok).toBe(false);
    const bidang = res.body.errors.map((g) => g.field);
    expect(bidang).toEqual(expect.arrayContaining(['full_name', 'gender', 'birth_date', 'phone']));
  });

  test('mengurangi stok jersey untuk paket lengkap', async () => {
    const sebelum = db.prepare("SELECT used FROM jersey_stock WHERE size = 'XL'").get().used;
    await daftar({ phone: '081300000011', jersey_size: 'XL' });
    const sesudah = db.prepare("SELECT used FROM jersey_stock WHERE size = 'XL'").get().used;

    expect(sesudah).toBe(sebelum + 1);
  });

  test('tidak mengambil stok jersey untuk paket hemat', async () => {
    const sebelum = db.prepare('SELECT SUM(used) AS n FROM jersey_stock').get().n;
    const res = await daftar({ phone: '081300000012', package: 'hemat', jersey_size: '' });
    const sesudah = db.prepare('SELECT SUM(used) AS n FROM jersey_stock').get().n;

    expect(res.status).toBe(201);
    expect(res.body.participant.amount).toBe(60000);
    expect(res.body.participant.jersey_size).toBeNull();
    expect(sesudah).toBe(sebelum);
  });

  test('menolak ukuran jersey yang sudah habis', async () => {
    db.prepare("UPDATE jersey_stock SET quota = used WHERE size = 'XXL'").run();

    const res = await daftar({ phone: '081300000013', jersey_size: 'XXL' });

    expect(res.status).toBe(409);
    expect(res.body.errors[0].field).toBe('jersey_size');
    expect(res.body.errors[0].message).toMatch(/habis/i);
  });

  test('menolak pendaftaran saat panitia menutup formulir', async () => {
    settingsService.update({ registration_open: 'closed' });
    const res = await daftar({ phone: '081300000014', jersey_size: 'M' });

    expect(res.status).toBe(409);
    expect(res.body.errors[0].message).toMatch(/ditutup/i);

    settingsService.update({ registration_open: 'open' });
  });
});

// ==========================================================================
describe('Cek status', () => {
  test('menemukan pendaftaran lewat nomor registrasi', async () => {
    const dibuat = await daftar({ phone: '081300000021', jersey_size: 'M' });
    const reg = dibuat.body.participant.reg_number;

    const res = await request(app).get('/api/registrations/check').query({ q: reg });

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].reg_number).toBe(reg);
  });

  test('menampilkan semua pendaftaran atas satu nomor WhatsApp', async () => {
    const nomor = '081355555555';
    await daftar({ phone: nomor, full_name: 'Guru Satu', jersey_size: 'M' });
    await daftar({ phone: nomor, full_name: 'Guru Dua', package: 'hemat', jersey_size: '' });

    const res = await request(app).get('/api/registrations/check').query({ q: nomor });

    expect(res.body.results).toHaveLength(2);
  });

  test('memberi pesan ramah saat data tidak ditemukan', async () => {
    const res = await request(app).get('/api/registrations/check').query({ q: 'FRPT-2026-9999' });

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(0);
    expect(res.body.message).toMatch(/belum ada pendaftaran/i);
  });
});

// ==========================================================================
describe('Unggah bukti pembayaran', () => {
  let reg;
  let akhiranNomor;

  beforeAll(async () => {
    const nomor = '081377778888';
    akhiranNomor = nomor.slice(-4);
    const res = await daftar({ phone: nomor, jersey_size: 'M' });
    reg = res.body.participant.reg_number;
  });

  test('menolak nomor registrasi yang tidak ada', async () => {
    const res = await request(app)
      .post('/api/registrations/FRPT-2026-9999/proof')
      .field('phone_last4', '8888')
      .attach('proof', JPEG_SAH, 'bukti.jpg');

    expect(res.status).toBe(404);
  });

  test('menolak berkas yang isinya bukan gambar walau berekstensi jpg', async () => {
    const res = await request(app)
      .post(`/api/registrations/${reg}/proof`)
      .field('phone_last4', akhiranNomor)
      .attach('proof', Buffer.from('ini cuma teks biasa'), 'palsu.jpg');

    expect(res.status).toBe(400);
    expect(res.body.errors[0].message).toMatch(/rusak|bukan gambar/i);
  });

  test('menolak jenis berkas di luar daftar izin', async () => {
    const res = await request(app)
      .post(`/api/registrations/${reg}/proof`)
      .field('phone_last4', akhiranNomor)
      .attach('proof', Buffer.from('MZ'), 'virus.exe');

    expect(res.status).toBe(400);
    expect(res.body.errors[0].message).toMatch(/JPG, PNG, atau PDF/i);
  });

  test('menolak unggahan dengan 4 angka terakhir yang salah', async () => {
    const res = await request(app)
      .post(`/api/registrations/${reg}/proof`)
      .field('phone_last4', '0000')
      .attach('proof', JPEG_SAH, 'bukti.jpg');

    expect(res.status).toBe(403);
    expect(res.body.errors[0].field).toBe('phone_last4');
  });

  test('menerima bukti yang sah dan memindahkan status ke menunggu verifikasi', async () => {
    const res = await request(app)
      .post(`/api/registrations/${reg}/proof`)
      .field('phone_last4', akhiranNomor)
      .attach('proof', JPEG_SAH, 'bukti.jpg');

    expect(res.status).toBe(200);
    expect(res.body.participant.payment_status).toBe('review');
    expect(res.body.participant.has_proof).toBe(true);
  });
});

// ==========================================================================
describe('Panel panitia', () => {
  const agen = request.agent(app);
  let peserta;

  beforeAll(async () => {
    const nomor = '081399990000';
    const dibuat = await daftar({ phone: nomor, full_name: 'Peserta Verifikasi', jersey_size: 'L' });
    peserta = dibuat.body.participant;

    await request(app)
      .post(`/api/registrations/${peserta.reg_number}/proof`)
      .field('phone_last4', nomor.slice(-4))
      .attach('proof', JPEG_SAH, 'bukti.jpg');
  });

  test('menolak akses sebelum masuk', async () => {
    const res = await request(app).get('/api/admin/stats');
    expect(res.status).toBe(401);
  });

  test('menolak password yang salah', async () => {
    const res = await request(app)
      .post('/api/admin/login')
      .send({ username: akun.username, password: 'passwordsalah' });

    expect(res.status).toBe(401);
    expect(res.body.errors[0].message).toMatch(/salah/i);
  });

  test('menerima kredensial yang benar', async () => {
    const res = await agen.post('/api/admin/login').send(akun);

    expect(res.status).toBe(200);
    expect(res.body.admin.username).toBe(akun.username);
  });

  test('menyajikan statistik setelah masuk', async () => {
    const res = await agen.get('/api/admin/stats');

    expect(res.status).toBe(200);
    expect(res.body.stats.total).toBeGreaterThan(0);
    expect(res.body.stats.jersey).toHaveLength(5);
  });

  test('menyaring daftar peserta berdasarkan status', async () => {
    const res = await agen.get('/api/admin/participants').query({ status: 'review' });

    expect(res.status).toBe(200);
    expect(res.body.rows.length).toBeGreaterThan(0);
    expect(res.body.rows.every((r) => r.payment_status === 'review')).toBe(true);
  });

  test('mencari peserta berdasarkan nama', async () => {
    const res = await agen.get('/api/admin/participants').query({ search: 'Peserta Verifikasi' });

    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0].reg_number).toBe(peserta.reg_number);
  });

  test('menyertakan tautan WhatsApp siap kirim', async () => {
    const res = await agen.get('/api/admin/participants').query({ search: 'Peserta Verifikasi' });
    expect(res.body.rows[0].wa_link).toMatch(/^https:\/\/wa\.me\/6281399990000\?text=/);
  });

  test('menolak verifikasi peserta yang belum mengunggah bukti', async () => {
    const tanpaBukti = await daftar({ phone: '081344443333', jersey_size: 'M' });
    const daftarRes = await agen.get('/api/admin/participants').query({ search: tanpaBukti.body.participant.reg_number });
    const id = daftarRes.body.rows[0].id;

    const res = await agen.post(`/api/admin/participants/${id}/verify`).send({});

    expect(res.status).toBe(409);
    expect(res.body.errors[0].message).toMatch(/belum mengunggah/i);
  });

  test('memverifikasi pembayaran dan menerbitkan nomor BIB', async () => {
    const daftarRes = await agen.get('/api/admin/participants').query({ search: peserta.reg_number });
    const id = daftarRes.body.rows[0].id;

    const res = await agen.post(`/api/admin/participants/${id}/verify`).send({});

    expect(res.status).toBe(200);
    expect(res.body.participant.payment_status).toBe('verified');
    expect(Number(res.body.participant.bib_number)).toBeGreaterThan(1000);
    expect(res.body.participant.verifier_name).toBe('Panitia Uji');
  });

  test('menolak bukti disertai alasan yang dibaca peserta', async () => {
    const nomor = '081322221111';
    const dibuat = await daftar({ phone: nomor, jersey_size: 'M' });
    await request(app)
      .post(`/api/registrations/${dibuat.body.participant.reg_number}/proof`)
      .field('phone_last4', nomor.slice(-4))
      .attach('proof', JPEG_SAH, 'bukti.jpg');

    const daftarRes = await agen.get('/api/admin/participants').query({ search: dibuat.body.participant.reg_number });
    const id = daftarRes.body.rows[0].id;

    const res = await agen
      .post(`/api/admin/participants/${id}/reject`)
      .send({ note: 'Nominal transfer tidak sesuai paket.' });

    expect(res.status).toBe(200);
    expect(res.body.participant.payment_status).toBe('rejected');

    const publik = await request(app).get('/api/registrations/check').query({ q: dibuat.body.participant.reg_number });
    expect(publik.body.results[0].admin_note).toBe('Nominal transfer tidak sesuai paket.');
  });

  test('melepas nomor BIB bila peserta yang sudah sah ternyata ditolak', async () => {
    const nomor = '081355556666';
    const dibuat = await daftar({ phone: nomor, full_name: 'Peserta Salah Sah', jersey_size: 'M' });
    const reg = dibuat.body.participant.reg_number;

    await request(app)
      .post(`/api/registrations/${reg}/proof`)
      .field('phone_last4', nomor.slice(-4))
      .attach('proof', JPEG_SAH, 'bukti.jpg');

    const daftarRes = await agen.get('/api/admin/participants').query({ search: reg });
    const id = daftarRes.body.rows[0].id;

    const sah = await agen.post(`/api/admin/participants/${id}/verify`).send({});
    const bib = sah.body.participant.bib_number;
    expect(bib).toBeTruthy();

    const ditolak = await agen
      .post(`/api/admin/participants/${id}/reject`)
      .send({ note: 'Ternyata bukti milik orang lain.' });

    expect(ditolak.body.participant.payment_status).toBe('rejected');
    expect(ditolak.body.participant.bib_number).toBeNull();

    // Kartu ikut hangus supaya tidak ada nomor balapan tanpa pembayaran sah.
    const kartu = await request(app).get(`/api/registrations/${reg}/card`);
    expect(kartu.status).toBe(409);

    // Nomor yang dilepas boleh dipakai lagi oleh peserta berikutnya.
    const berikut = '081355557777';
    const lain = await daftar({ phone: berikut, jersey_size: 'M' });
    await request(app)
      .post(`/api/registrations/${lain.body.participant.reg_number}/proof`)
      .field('phone_last4', berikut.slice(-4))
      .attach('proof', JPEG_SAH, 'bukti.jpg');

    const cariLain = await agen.get('/api/admin/participants').query({ search: lain.body.participant.reg_number });
    const sahLain = await agen.post(`/api/admin/participants/${cariLain.body.rows[0].id}/verify`).send({});
    expect(sahLain.body.participant.bib_number).toBe(bib);
  });

  test('menolak penolakan tanpa alasan', async () => {
    const daftarRes = await agen.get('/api/admin/participants').query({ search: peserta.reg_number });
    const id = daftarRes.body.rows[0].id;

    const res = await agen.post(`/api/admin/participants/${id}/reject`).send({ note: '' });

    expect(res.status).toBe(422);
  });

  test('mengekspor rekap dalam bentuk CSV', async () => {
    for (const nama of ['peserta', 'daftar-hadir', 'jersey', 'keuangan']) {
      const res = await agen.get(`/api/admin/export/${nama}`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.headers['content-disposition']).toMatch(/\.csv"$/);
      expect(res.text.charCodeAt(0)).toBe(0xfeff); // penanda BOM untuk Excel
    }
  });

  test('menolak nama ekspor yang tidak dikenal', async () => {
    const res = await agen.get('/api/admin/export/entah-apa');
    expect(res.status).toBe(404);
  });

  test('menyimpan perubahan setelan', async () => {
    const res = await agen.put('/api/admin/settings').send({ quota_total: '250', announcement: 'Uji pengumuman' });

    expect(res.status).toBe(200);
    expect(res.body.settings.quota_total).toBe(250);

    const publik = await request(app).get('/api/info');
    expect(publik.body.announcement).toBe('Uji pengumuman');
  });

  test('menolak kuota jersey di bawah jumlah yang sudah dipesan', async () => {
    const res = await agen.put('/api/admin/jersey').send({ L: '0' });

    expect(res.status).toBe(422);
    expect(res.body.errors[0].message).toMatch(/sudah dipesan/i);
  });

  test('mencatat jejak aktivitas panitia', async () => {
    const res = await agen.get('/api/admin/stats');
    const aksi = res.body.activity.map((a) => a.action);

    expect(aksi).toEqual(expect.arrayContaining(['verifikasi', 'tolak-bukti', 'ekspor']));
  });

  test('menutup sesi saat keluar', async () => {
    await agen.post('/api/admin/logout');
    const res = await agen.get('/api/admin/stats');
    expect(res.status).toBe(401);
  });
});

// ==========================================================================
describe('Akun panitia', () => {
  const ketua = request.agent(app);
  let akunBaru;
  let sandiBaru;

  beforeAll(async () => {
    await ketua.post('/api/admin/login').send(akun);
  });

  test('membuat akun baru dengan password acak', async () => {
    const res = await ketua.post('/api/admin/accounts').send({
      name: 'munawir',
      username: 'Munawir',
      role: 'panitia',
    });

    expect(res.status).toBe(201);
    expect(res.body.account.username).toBe('munawir'); // dikecilkan otomatis
    expect(res.body.account.name).toBe('Munawir');
    expect(res.body.account.role).toBe('panitia');
    expect(res.body.password).toHaveLength(12);

    akunBaru = res.body.account;
    sandiBaru = res.body.password;
  });

  test('tidak pernah mengirim hash password ke peramban', async () => {
    const res = await ketua.get('/api/admin/accounts');

    expect(res.status).toBe(200);
    expect(res.body.accounts.length).toBeGreaterThanOrEqual(2);
    res.body.accounts.forEach((a) => expect(a.password_hash).toBeUndefined());
  });

  test('akun baru bisa masuk dengan password yang diberikan', async () => {
    const res = await request(app)
      .post('/api/admin/login')
      .send({ username: akunBaru.username, password: sandiBaru });

    expect(res.status).toBe(200);
    expect(res.body.admin.role).toBe('panitia');
  });

  test('menolak username yang sudah dipakai', async () => {
    const res = await ketua.post('/api/admin/accounts').send({
      name: 'Munawir Kedua',
      username: 'munawir',
      role: 'panitia',
    });

    expect(res.status).toBe(409);
    expect(res.body.errors[0].message).toMatch(/sudah dipakai/i);
  });

  test('menolak username yang mengandung spasi', async () => {
    const res = await ketua.post('/api/admin/accounts').send({
      name: 'Nama Sah',
      username: 'ada spasi',
      role: 'panitia',
    });

    expect(res.status).toBe(422);
    expect(res.body.errors[0].field).toBe('username');
  });

  test('menolak peran di luar ketua dan panitia', async () => {
    const res = await ketua.post('/api/admin/accounts').send({
      name: 'Nama Sah',
      username: 'pengawas',
      role: 'superadmin',
    });

    expect(res.status).toBe(422);
  });

  test('menghalangi akun panitia mengelola akun', async () => {
    const panitia = request.agent(app);
    await panitia.post('/api/admin/login').send({ username: akunBaru.username, password: sandiBaru });

    expect((await panitia.get('/api/admin/accounts')).status).toBe(403);
    expect((await panitia.post('/api/admin/accounts').send({ name: 'Coba Saja', username: 'coba', role: 'ketua' })).status).toBe(403);
    expect((await panitia.delete(`/api/admin/accounts/${akunBaru.id}`)).status).toBe(403);
  });

  test('reset password membuat password lama tidak berlaku', async () => {
    const res = await ketua.post(`/api/admin/accounts/${akunBaru.id}/reset-password`);

    expect(res.status).toBe(200);
    expect(res.body.password).not.toBe(sandiBaru);

    const lama = await request(app)
      .post('/api/admin/login')
      .send({ username: akunBaru.username, password: sandiBaru });
    expect(lama.status).toBe(401);

    const baru = await request(app)
      .post('/api/admin/login')
      .send({ username: akunBaru.username, password: res.body.password });
    expect(baru.status).toBe(200);
  });

  test('boleh menghapus ketua lain, tapi tidak pernah dirinya sendiri', async () => {
    const dibuat = await ketua.post('/api/admin/accounts').send({
      name: 'Ketua Cadangan',
      username: 'ketua2',
      role: 'ketua',
    });
    expect(dibuat.status).toBe(201);

    const berdua = await ketua.get('/api/admin/accounts');
    expect(berdua.body.accounts.filter((a) => a.role === 'ketua')).toHaveLength(2);
    expect((await ketua.delete(`/api/admin/accounts/${dibuat.body.account.id}`)).status).toBe(200);

    // Tinggal satu ketua, dan ia tertahan oleh larangan hapus-diri-sendiri.
    // Itulah yang menjaga jumlah ketua tidak pernah mencapai nol.
    const sendirian = await ketua.get('/api/admin/accounts');
    expect(sendirian.body.accounts.filter((a) => a.role === 'ketua')).toHaveLength(1);

    const res = await ketua.delete(`/api/admin/accounts/${sendirian.body.me}`);
    expect(res.status).toBe(409);
    expect(res.body.errors[0].message).toMatch(/sendiri/i);
  });

  test('menghapus akun panitia dan mencatatnya di jejak aksi', async () => {
    const res = await ketua.delete(`/api/admin/accounts/${akunBaru.id}`);
    expect(res.status).toBe(200);

    const sisa = await ketua.get('/api/admin/accounts');
    expect(sisa.body.accounts.some((a) => a.id === akunBaru.id)).toBe(false);

    const jejak = await ketua.get('/api/admin/stats');
    expect(jejak.body.activity.map((a) => a.action)).toEqual(
      expect.arrayContaining(['tambah-akun', 'reset-password', 'hapus-akun'])
    );
  });

  test('menolak akun yang tidak ada', async () => {
    expect((await ketua.post('/api/admin/accounts/99999/reset-password')).status).toBe(404);
    expect((await ketua.delete('/api/admin/accounts/99999')).status).toBe(404);
  });
});

// ==========================================================================
describe('Kartu peserta', () => {
  const agen = request.agent(app);

  test('belum terbit sebelum pembayaran diverifikasi', async () => {
    const dibuat = await daftar({ phone: '081366667777', jersey_size: 'M' });
    const res = await request(app).get(`/api/registrations/${dibuat.body.participant.reg_number}/card`);

    expect(res.status).toBe(409);
    expect(res.body.errors[0].message).toMatch(/diverifikasi/i);
  });

  test('terbit lengkap dengan kode QR setelah diverifikasi', async () => {
    const nomor = '081388889999';
    const dibuat = await daftar({ phone: nomor, full_name: 'Peserta Kartu', jersey_size: 'M' });
    const reg = dibuat.body.participant.reg_number;

    await request(app)
      .post(`/api/registrations/${reg}/proof`)
      .field('phone_last4', nomor.slice(-4))
      .attach('proof', JPEG_SAH, 'bukti.jpg');

    await agen.post('/api/admin/login').send(akun);
    const daftarRes = await agen.get('/api/admin/participants').query({ search: reg });
    await agen.post(`/api/admin/participants/${daftarRes.body.rows[0].id}/verify`).send({});

    const res = await request(app).get(`/api/registrations/${reg}/card`);

    expect(res.status).toBe(200);
    expect(res.body.card.full_name).toBe('Peserta Kartu');
    expect(res.body.card.bib_number).toBeTruthy();
    expect(res.body.card.qr).toMatch(/^data:image\/png;base64,/);
    expect(res.body.card.event.distance).toBe('7 KM');
  });
});

// ==========================================================================
describe('Ajakan grup WhatsApp', () => {
  const agen = request.agent(app);
  const TAUTAN = 'https://chat.whatsapp.com/AbCdEfGhIjKlMnOp';

  afterAll(() => settingsService.update({ whatsapp_group_url: '' }));

  test('menolak tautan yang bukan WhatsApp', async () => {
    const res = settingsService.update({ whatsapp_group_url: 'https://contoh.com/grup' });

    expect(res.ok).toBe(false);
    expect(res.errors[0].field).toBe('whatsapp_group_url');
  });

  test('disembunyikan selama panitia belum mengisi tautannya', async () => {
    settingsService.update({ whatsapp_group_url: '' });
    const dibuat = await daftar({ phone: '081311112222' });

    expect(dibuat.body.group).toBeNull();
  });

  test('ikut dikirim di halaman selesai daftar setelah tautan diisi', async () => {
    expect(settingsService.update({ whatsapp_group_url: TAUTAN }).ok).toBe(true);

    const dibuat = await daftar({ phone: '081322223333' });
    expect(dibuat.body.group.url).toBe(TAUTAN);
    expect(dibuat.body.group.manfaat.length).toBeGreaterThan(0);
  });

  test('ditahan di halaman cek sampai pembayaran disahkan', async () => {
    const nomor = '081333334444';
    const dibuat = await daftar({ phone: nomor, full_name: 'Peserta Grup', jersey_size: 'M' });
    const reg = dibuat.body.participant.reg_number;

    // Nomor registrasi mudah ditebak, jadi status "pending" belum boleh
    // membocorkan tautan grup ke sembarang orang yang mencoba menebak.
    const sebelum = await request(app).get('/api/registrations/check').query({ q: reg });
    expect(sebelum.body.group).toBeNull();

    await request(app)
      .post(`/api/registrations/${reg}/proof`)
      .field('phone_last4', nomor.slice(-4))
      .attach('proof', JPEG_SAH, 'bukti.jpg');

    await agen.post('/api/admin/login').send(akun);
    const daftarRes = await agen.get('/api/admin/participants').query({ search: reg });
    await agen.post(`/api/admin/participants/${daftarRes.body.rows[0].id}/verify`).send({});

    const sesudah = await request(app).get('/api/registrations/check').query({ q: reg });
    expect(sesudah.body.group.url).toBe(TAUTAN);
  });
});
