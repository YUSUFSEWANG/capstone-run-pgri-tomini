/* Berkas dukungan Cypress: dimuat sebelum setiap berkas uji. */

// Galat JavaScript yang tak tertangani dari halaman tidak boleh langsung
// menggagalkan uji alur; yang diperiksa adalah hasil yang dilihat pengguna.
Cypress.on('uncaught:exception', () => false);

/** Isi satu bidang formulir berdasarkan atribut name. */
Cypress.Commands.add('isi', (nama, nilai) => {
  cy.get(`[name="${nama}"]`).clear().type(nilai);
});

/** Masuk sebagai panitia lewat layar masuk sungguhan. */
Cypress.Commands.add('masukPanitia', () => {
  const sandi = Cypress.env('adminPass');
  // Tanpa nilai cadangan: password yang ditulis di sini ikut terbit ke repositori.
  if (!sandi) throw new Error('adminPass belum disetel. Jalankan lewat `npm run test:e2e`.');

  cy.visit('/admin/login');
  cy.get('[name="username"]').clear().type(Cypress.env('adminUser') || 'panitia');
  cy.get('[name="password"]').clear().type(sandi, { log: false });
  cy.get('button[type="submit"]').click();
  cy.location('pathname', { timeout: 10000 }).should('eq', '/admin');
});
