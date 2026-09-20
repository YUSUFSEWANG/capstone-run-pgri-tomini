/* ==========================================================================
   Kerangka bersama panel panitia: identitas, keluar, dan kabar singkat.
   ========================================================================== */
(function (global) {
  'use strict';

  const { qs, api, aman } = global.FR;

  // ------------------------------------------------------- kabar singkat
  let rotiEl = null;
  let rotiWaktu = null;

  function roti(pesan, jenis = 'info') {
    if (!rotiEl) {
      rotiEl = document.createElement('div');
      rotiEl.className = 'roti';
      rotiEl.setAttribute('role', 'status');
      rotiEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(rotiEl);
    }

    rotiEl.dataset.jenis = jenis;
    rotiEl.textContent = pesan;
    rotiEl.dataset.tampil = 'true';

    clearTimeout(rotiWaktu);
    rotiWaktu = setTimeout(() => { rotiEl.dataset.tampil = 'false'; }, 4200);
  }

  /** Terjemahkan larik galat dari server jadi satu baris kabar. */
  const rotiGalat = (hasil, cadangan) =>
    roti((hasil.errors && hasil.errors.map((e) => e.message).join(' ')) || cadangan || 'Tindakan gagal.', 'galat');

  // -------------------------------------------------------------- keluar
  async function keluar() {
    await api.post('/api/admin/logout');
    window.location.href = '/admin/login';
  }

  // ----------------------------------------------------------- identitas
  async function muatAku() {
    const hasil = await api.get('/api/admin/me');
    if (!hasil.ok) {
      window.location.href = '/admin/login';
      return null;
    }
    const wadah = qs('#akuNama');
    if (wadah) wadah.innerHTML = `<b>${aman(hasil.admin.name)}</b> <span>· ${aman(hasil.admin.role)}</span>`;
    return hasil.admin;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const tombolKeluar = qs('#tombolKeluar');
    if (tombolKeluar) tombolKeluar.addEventListener('click', keluar);

    // Tandai menu yang sedang dibuka.
    const jalur = window.location.pathname.replace(/\/$/, '') || '/admin';
    document.querySelectorAll('.adm-atas__nav a').forEach((tautan) => {
      const target = tautan.getAttribute('href').replace(/\/$/, '');
      if (target === jalur) tautan.setAttribute('aria-current', 'page');
    });
  });

  global.ADM = { roti, rotiGalat, keluar, muatAku };
})(window);
