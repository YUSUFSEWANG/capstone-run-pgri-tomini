/* ==========================================================================
   Layar masuk panitia.
   ========================================================================== */
(function () {
  'use strict';

  const { qs, api, pasangGalat, bersihkanGalat, tampilkanPesan, sibuk } = window.FR;

  const form = qs('#formMasuk');
  const kotakPesan = qs('#kotakPesan');
  const tombol = qs('#tombolMasuk');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    bersihkanGalat(form);
    tampilkanPesan(kotakPesan, 'info', null);

    const data = Object.fromEntries(new FormData(form).entries());

    sibuk(tombol, true, 'Memeriksa…');
    const hasil = await api.post('/api/admin/login', data);
    sibuk(tombol, false);

    if (!hasil.ok) {
      const umum = pasangGalat(form, hasil.errors);
      if (umum.length) {
        tampilkanPesan(kotakPesan, 'galat', umum);
        kotakPesan.classList.remove('sembunyi');
      }
      qs('input[name="password"]', form).value = '';
      return;
    }

    const lanjut = new URLSearchParams(window.location.search).get('next');
    // Hanya izinkan tujuan di dalam situs ini.
    window.location.href = lanjut && lanjut.startsWith('/') && !lanjut.startsWith('//') ? lanjut : '/admin';
  });
})();
