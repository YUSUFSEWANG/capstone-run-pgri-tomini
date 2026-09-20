/* ==========================================================================
   Pengaturan panitia: masa pendaftaran, harga, kuota jersey, password.
   ========================================================================== */
(function () {
  'use strict';

  const { qs, api, aman, rupiah, waktu, pasangGalat, bersihkanGalat, sibuk, salin } = window.FR;
  const { muatAku, roti, rotiGalat } = window.ADM;

  const formSetelan = qs('#formSetelan');
  const formJersey = qs('#formJersey');
  const formPassword = qs('#formPassword');
  const formAkun = qs('#formAkun');

  // -------------------------------------------------------------- muat
  async function muat() {
    const hasil = await api.get('/api/admin/settings');
    if (!hasil.ok) {
      rotiGalat(hasil, 'Pengaturan gagal dimuat.');
      return;
    }

    isiSetelan(hasil.settings);
    gambarKuota(hasil.jersey);
    gambarKeadaan(hasil.state);
  }

  function isiSetelan(s) {
    qs(`input[name="registration_open"][value="${s.registration_open}"]`).checked = true;
    formSetelan.registration_start.value = s.registration_start || '';
    formSetelan.registration_end.value = s.registration_end || '';
    formSetelan.quota_total.value = s.quota_total;
    formSetelan.price_lengkap.value = s.price_lengkap;
    formSetelan.price_hemat.value = s.price_hemat;
    formSetelan.unique_code_enabled.checked = Boolean(s.unique_code_enabled);
    formSetelan.announcement.value = s.announcement || '';
    formSetelan.whatsapp_group_url.value = s.whatsapp_group_url || '';
  }

  function gambarKuota(jersey) {
    qs('#daftarKuota').innerHTML = jersey
      .map(
        (j) => `
      <div class="kuota-baris">
        <span class="kuota-baris__ukuran">${aman(j.size)}</span>
        <span class="kuota-baris__ket">Terpesan ${j.used} · sisa ${j.remaining}</span>
        <input class="isian" type="number" name="${aman(j.size)}" value="${j.quota}" min="${j.used}" max="100000"
               aria-label="Kuota ukuran ${aman(j.size)}">
      </div>`
      )
      .join('');
  }

  /** Beri tahu panitia keadaan pendaftaran yang sebenarnya, bukan hanya setelannya. */
  function gambarKeadaan(state) {
    const kotak = qs('#kotakKeadaan');
    const terbuka = state.open;

    kotak.className = `pesan pesan--${terbuka ? 'sukses' : 'ingat'}`;
    kotak.innerHTML =
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11 7h2v2h-2V7zm0 4h2v6h-2v-6zm1-9a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/></svg>' +
      `<div>
         <p class="pesan__judul">${terbuka ? 'Pendaftaran sedang terbuka' : 'Pendaftaran sedang tertutup'}</p>
         <p>${terbuka
            ? `Peserta bisa mengisi formulir sekarang. Terisi ${state.taken}${state.quota ? ` dari ${state.quota} kuota` : ' pendaftaran'}.`
            : aman(state.reason)}</p>
       </div>`;
    kotak.classList.remove('sembunyi');
  }

  // ------------------------------------------------------------- simpan
  formSetelan.addEventListener('submit', async (event) => {
    event.preventDefault();
    bersihkanGalat(formSetelan);

    const data = Object.fromEntries(new FormData(formSetelan).entries());
    data.unique_code_enabled = formSetelan.unique_code_enabled.checked ? 'true' : 'false';

    sibuk(qs('#tombolSimpan'), true, 'Menyimpan…');
    const hasil = await api.put('/api/admin/settings', data);
    sibuk(qs('#tombolSimpan'), false);

    if (!hasil.ok) {
      const umum = pasangGalat(formSetelan, hasil.errors);
      return rotiGalat({ errors: umum.map((m) => ({ message: m })) }, 'Ada isian yang belum benar.');
    }

    roti(hasil.message, 'sukses');
    muat();
  });

  formJersey.addEventListener('submit', async (event) => {
    event.preventDefault();

    const data = Object.fromEntries(new FormData(formJersey).entries());

    sibuk(qs('#tombolJersey'), true, 'Menyimpan…');
    const hasil = await api.put('/api/admin/jersey', data);
    sibuk(qs('#tombolJersey'), false);

    if (!hasil.ok) return rotiGalat(hasil, 'Kuota jersey gagal disimpan.');

    roti(hasil.message, 'sukses');
    gambarKuota(hasil.jersey);
  });

  formPassword.addEventListener('submit', async (event) => {
    event.preventDefault();
    bersihkanGalat(formPassword);

    const data = Object.fromEntries(new FormData(formPassword).entries());

    sibuk(qs('#tombolPassword'), true, 'Mengganti…');
    const hasil = await api.post('/api/admin/password', data);
    sibuk(qs('#tombolPassword'), false);

    if (!hasil.ok) {
      pasangGalat(formPassword, hasil.errors);
      return;
    }

    formPassword.reset();
    roti(hasil.message, 'sukses');
  });

  // ------------------------------------------------------- akun panitia
  const PERAN = { ketua: 'Ketua', panitia: 'Panitia' };

  async function muatAkun() {
    const hasil = await api.get('/api/admin/accounts');
    if (!hasil.ok) return rotiGalat(hasil, 'Daftar akun gagal dimuat.');
    gambarAkun(hasil.accounts, hasil.me);
    return undefined;
  }

  function gambarAkun(akun, akuId) {
    qs('#daftarAkun').innerHTML = akun
      .map((a) => {
        const sendiri = a.id === akuId;
        return `
      <div class="akun-baris">
        <div class="akun-baris__utama">
          <p class="akun-baris__nama">${aman(a.name)}${sendiri ? ' <small>(kamu)</small>' : ''}</p>
          <p class="akun-baris__ket">${aman(a.username)} · masuk terakhir ${a.last_login_at ? waktu(a.last_login_at) : 'belum pernah'}</p>
        </div>
        <span class="tanda" data-peran="${aman(a.role)}">${aman(PERAN[a.role] || a.role)}</span>
        <div class="akun-baris__aksi">
          <button class="tbl tbl--kecil tbl--hantu" type="button" data-reset="${a.id}">Reset password</button>
          <button class="tbl tbl--kecil tbl--hantu" type="button" data-hapus="${a.id}"
                  data-nama="${aman(a.username)}"${sendiri ? ' disabled' : ''}>Hapus</button>
        </div>
      </div>`;
      })
      .join('');
  }

  /** Password hanya ada di memori peramban sesaat; server tidak menyimpannya. */
  function tampilkanSandi(pesan, sandi) {
    const kotak = qs('#kotakSandi');
    kotak.innerHTML =
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 1 3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 6a2.5 2.5 0 0 1 2.5 2.5V11h.5v6h-6v-6h.5V9.5A2.5 2.5 0 0 1 12 7zm0 1.5a1 1 0 0 0-1 1V11h2V9.5a1 1 0 0 0-1-1z"/></svg>' +
      `<div>
         <p class="pesan__judul">${aman(pesan)}</p>
         <p class="akun-sandi" id="sandiBaru">${aman(sandi)}</p>
         <button class="tbl tbl--kecil" type="button" id="salinSandi">Salin password</button>
       </div>`;
    kotak.classList.remove('sembunyi');

    qs('#salinSandi').addEventListener('click', async () => {
      roti((await salin(sandi)) ? 'Password disalin.' : 'Gagal menyalin. Catat manual.', 'sukses');
    });
    kotak.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  if (formAkun) {
    formAkun.addEventListener('submit', async (event) => {
      event.preventDefault();
      bersihkanGalat(formAkun);

      const data = Object.fromEntries(new FormData(formAkun).entries());

      sibuk(qs('#tombolAkun'), true, 'Membuat…');
      const hasil = await api.post('/api/admin/accounts', data);
      sibuk(qs('#tombolAkun'), false);

      if (!hasil.ok) {
        const umum = pasangGalat(formAkun, hasil.errors);
        if (umum.length) rotiGalat({ errors: umum.map((m) => ({ message: m })) });
        return;
      }

      formAkun.reset();
      tampilkanSandi(hasil.message, hasil.password);
      muatAkun();
    });

    qs('#daftarAkun').addEventListener('click', async (event) => {
      const tombolReset = event.target.closest('[data-reset]');
      const tombolHapus = event.target.closest('[data-hapus]');

      if (tombolReset) {
        if (!window.confirm('Buat password baru untuk akun ini? Password lamanya langsung tidak berlaku.')) return;
        const hasil = await api.post(`/api/admin/accounts/${tombolReset.dataset.reset}/reset-password`);
        if (!hasil.ok) return rotiGalat(hasil, 'Password gagal diganti.');
        tampilkanSandi(hasil.message, hasil.password);
        return muatAkun();
      }

      if (tombolHapus) {
        if (!window.confirm(`Hapus akun "${tombolHapus.dataset.nama}"? Nama pemverifikasi pada data peserta yang pernah ia sahkan akan ikut hilang.`)) return;
        const hasil = await api.del(`/api/admin/accounts/${tombolHapus.dataset.hapus}`);
        if (!hasil.ok) return rotiGalat(hasil, 'Akun gagal dihapus.');
        roti(hasil.message, 'sukses');
        return muatAkun();
      }

      return undefined;
    });
  }

  (async () => {
    const aku = await muatAku();
    if (!aku) return;
    muat();
    // Kelola akun hanya untuk ketua; server tetap memeriksa ulang peran ini.
    if (aku.role === 'ketua') {
      qs('#panelAkun').classList.remove('sembunyi');
      muatAkun();
    }
  })();
})();
