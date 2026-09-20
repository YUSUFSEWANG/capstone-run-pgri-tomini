/**
 * Perjalanan lengkap satu peserta, dari membuka beranda sampai kartu
 * pesertanya terbit setelah panitia memverifikasi pembayaran.
 * Urutan uji dalam berkas ini saling bergantung, jadi jangan diacak.
 */

const PESERTA = {
  nama: 'Nurul Fadilah Tomini',
  telepon: '081255667788',
  lahir: '1994-08-12',
  instansi: 'SDN 4 Tomini',
  daruratNama: 'Ahmad Fadilah',
  daruratTelepon: '082199887766',
};

let nomorRegistrasi = null;
let nomorBib = null;

describe('Perjalanan peserta', () => {
  it('beranda menampilkan identitas acara dan hitung mundur', () => {
    cy.visit('/');

    cy.contains('h1', 'PGRI Tomini').should('be.visible');
    cy.contains('.bib-kartu__jarak', '7').should('be.visible');
    cy.get('#mundurHari').should('not.have.text', '—');

    // Harga diambil dari setelan panitia, bukan angka tetap di HTML.
    cy.get('[data-harga="lengkap"]').should('contain.text', 'Rp');
    cy.get('#ukuranTersedia .ukuran__cip').should('have.length.greaterThan', 1);
  });

  it('rel kilometer bergerak saat halaman digulir', () => {
    cy.visit('/');
    cy.get('#progresKm').should('have.text', '0.0 KM');
    cy.scrollTo('bottom', { duration: 300 });
    cy.get('#progresKm').should('not.have.text', '0.0 KM');
  });

  it('menolak formulir yang belum lengkap', () => {
    cy.visit('/pendaftaran');
    cy.get('#formDaftar').should('be.visible');
    cy.get('#tombolKirim').click();

    cy.get('[data-bidang="full_name"]').should('have.attr', 'data-galat');
    cy.get('[data-bidang="full_name"] .bidang__galat').should('be.visible');
  });

  it('menampilkan ukuran jersey hanya untuk Paket Lengkap', () => {
    cy.visit('/pendaftaran');

    cy.get('#bidangUkuran').should('have.class', 'sembunyi');
    cy.get('[name="package"][value="lengkap"]').check({ force: true });
    cy.get('#bidangUkuran').should('not.have.class', 'sembunyi');
    cy.get('[name="package"][value="hemat"]').check({ force: true });
    cy.get('#bidangUkuran').should('have.class', 'sembunyi');
  });

  it('mengisi ringkasan biaya mengikuti paket yang dipilih', () => {
    cy.visit('/pendaftaran');

    cy.get('#ringkasTotal').should('have.text', 'Rp0');
    cy.get('[name="package"][value="lengkap"]').check({ force: true });
    cy.get('#ringkasPaket').should('contain.text', 'Lengkap');
    cy.get('#ringkasTotal').should('contain.text', 'Rp120.000');
  });

  it('menyimpan pendaftaran dan menerbitkan nomor registrasi', () => {
    cy.visit('/pendaftaran');

    cy.isi('full_name', PESERTA.nama);
    cy.get('[name="gender"][value="P"]').check({ force: true });
    cy.get('[name="birth_date"]').type(PESERTA.lahir);
    cy.isi('phone', PESERTA.telepon);
    cy.isi('institution', PESERTA.instansi);

    cy.get('[name="package"][value="lengkap"]').check({ force: true });
    cy.get('[name="jersey_size"]:not(:disabled)').first().check({ force: true });

    cy.isi('emergency_name', PESERTA.daruratNama);
    cy.isi('emergency_phone', PESERTA.daruratTelepon);
    cy.get('[name="agreement"]').check({ force: true });

    cy.get('#tombolKirim').click();

    cy.get('#panelHasil', { timeout: 10000 }).should('be.visible');
    cy.get('.hasil__nomor')
      .should('contain.text', 'FRPT-2026-')
      .invoke('text')
      .then((teks) => { nomorRegistrasi = teks.trim(); });

    cy.get('.nominal').should('contain.text', 'Rp120.000');
    cy.contains('a', 'Unggah bukti pembayaran').should('be.visible');
  });

  it('menampilkan status "menunggu pembayaran" di halaman cek', () => {
    cy.then(() => {
      cy.visit(`/cek?q=${nomorRegistrasi}`);
    });

    cy.get('.status-kartu', { timeout: 10000 }).should('have.length', 1);
    cy.get('.status-kartu__kepala').should('have.attr', 'data-status', 'pending');
    // Nama tampil kapital lewat CSS; teks di DOM tetap seperti yang diketik.
    cy.get('.status-kartu').should('contain.text', PESERTA.nama);
    cy.contains('.rinci dd', 'Belum dikirim').should('be.visible');
  });

  it('menolak unggahan dengan 4 angka terakhir yang salah', () => {
    cy.then(() => {
      cy.visit(`/cek?q=${nomorRegistrasi}`);
    });

    cy.get('input[type="file"]').selectFile('cypress/fixtures/bukti.jpg', { force: true });
    cy.get('[name="phone_last4"]').type('0000');
    cy.contains('button', 'Kirim bukti pembayaran').click();

    cy.get('[data-bidang="phone_last4"]').should('have.attr', 'data-galat');
  });

  it('menerima bukti pembayaran yang sah', () => {
    cy.then(() => {
      cy.visit(`/cek?q=${nomorRegistrasi}`);
    });

    cy.get('input[type="file"]').selectFile('cypress/fixtures/bukti.jpg', { force: true });
    cy.get('[data-pratinjau]').should('not.have.class', 'sembunyi');
    cy.get('[name="phone_last4"]').type(PESERTA.telepon.slice(-4));
    cy.contains('button', 'Kirim bukti pembayaran').click();

    cy.get('[data-pesan]').should('contain.text', 'Bukti pembayaran terkirim');
    cy.get('.status-kartu__kepala', { timeout: 10000 }).should('have.attr', 'data-status', 'review');
  });

  it('belum menerbitkan kartu peserta sebelum diverifikasi', () => {
    cy.then(() => {
      cy.visit(`/kartu/${nomorRegistrasi}`);
    });

    cy.get('.kosong', { timeout: 10000 }).should('be.visible');
    cy.contains('.kosong__judul', 'Kartu belum terbit').should('be.visible');
  });
});

describe('Panel panitia', () => {
  it('melindungi dasbor dari pengunjung yang belum masuk', () => {
    cy.visit('/admin');
    cy.location('pathname').should('eq', '/admin/login');
  });

  it('menolak password yang salah', () => {
    cy.visit('/admin/login');
    cy.get('[name="username"]').type('panitia');
    cy.get('[name="password"]').type('passwordngasal');
    cy.get('button[type="submit"]').click();

    cy.get('#kotakPesan').should('be.visible').and('contain.text', 'salah');
    cy.location('pathname').should('eq', '/admin/login');
  });

  it('menampilkan dasbor setelah masuk', () => {
    cy.masukPanitia();

    cy.get('#kartuAngka .stat').should('have.length', 5);
    cy.contains('.stat__label', 'Menunggu diperiksa').should('be.visible');
    cy.get('#batangJersey .batang__baris').should('have.length', 5);
  });

  it('menyaring peserta berdasarkan status', () => {
    cy.intercept('GET', '/api/admin/participants*').as('muatPeserta');
    cy.masukPanitia();
    cy.visit('/admin/peserta');
    cy.wait('@muatPeserta');

    cy.get('#saringStatus').select('review');
    cy.wait('@muatPeserta'); // tabel dimuat ulang dari server

    cy.get('#isiTabel tr[data-id]').should('have.length.greaterThan', 0);
    cy.get('#isiTabel .tanda').each(($t) => {
      expect($t.attr('data-status')).to.eq('review');
    });
  });

  it('memverifikasi pembayaran dan menerbitkan nomor BIB', () => {
    cy.intercept('GET', '/api/admin/participants*').as('muatPeserta');
    cy.masukPanitia();
    cy.visit('/admin/peserta');
    cy.wait('@muatPeserta');

    cy.then(() => {
      cy.get('#cariNama').type(nomorRegistrasi);
    });
    cy.wait('@muatPeserta'); // pencarian ditunda 320 ms sebelum dikirim

    cy.get('#isiTabel tr[data-id]').should('have.length', 1).click();
    cy.get('#laci').should('have.attr', 'data-buka', 'true');
    cy.get('#laciBadan').should('contain.text', PESERTA.nama);

    cy.on('window:confirm', () => true);
    cy.contains('#laciKaki button', 'Sahkan pembayaran').click();

    cy.get('.roti').should('contain.text', 'Nomor BIB');
    cy.get('#laciBadan .tanda[data-status="verified"]').should('be.visible');

    cy.get('#laciBadan')
      .invoke('text')
      .then((teks) => {
        nomorBib = (teks.match(/BIB\s+(\d+)/) || [])[1];
        expect(Number(nomorBib)).to.be.greaterThan(1000);
      });
  });

  it('menyediakan unduhan rekap CSV', () => {
    cy.masukPanitia();
    cy.request('/api/admin/export/daftar-hadir').then((res) => {
      expect(res.status).to.eq(200);
      expect(res.headers['content-type']).to.match(/text\/csv/);
      expect(res.body).to.contain('No. BIB');
    });
  });

  it('menampilkan keadaan pendaftaran di halaman pengaturan', () => {
    cy.masukPanitia();
    cy.visit('/admin/pengaturan');

    cy.get('#kotakKeadaan').should('be.visible').and('contain.text', 'Pendaftaran sedang terbuka');
    cy.get('#daftarKuota .kuota-baris').should('have.length', 5);
  });
});

describe('Kartu peserta setelah verifikasi', () => {
  it('menerbitkan kartu lengkap dengan nomor BIB dan kode QR', () => {
    cy.then(() => {
      cy.visit(`/kartu/${nomorRegistrasi}`);
    });

    cy.get('.tiket', { timeout: 10000 }).should('be.visible');
    cy.get('.tiket__nama').should('contain.text', PESERTA.nama);
    cy.get('.tiket__qr img').should('have.attr', 'src').and('match', /^data:image\/png;base64,/);

    cy.then(() => {
      cy.get('.tiket__bib b').should('have.text', nomorBib);
    });
  });
});
