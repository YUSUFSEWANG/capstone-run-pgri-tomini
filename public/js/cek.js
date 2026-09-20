/* ==========================================================================
   Cek status pendaftaran + unggah bukti pembayaran.
   ========================================================================== */
(function () {
  'use strict';

  const { qs, qsa, api, rupiah, aman, waktu, tampilkanPesan, sibuk, salin, popupGrup } = window.FR;

  const form = qs('#formCek');
  const isian = qs('#isianCari');
  const tombol = qs('#tombolCari');
  const kotakPesan = qs('#kotakPesan');
  const wadah = qs('#hasilCek');

  let batasUnggah = { maxBytes: 5 * 1024 * 1024, maxLabel: '5 MB', accept: '.jpg,.jpeg,.png,.pdf' };

  api.get('/api/info').then((info) => {
    if (info.ok && info.upload) batasUnggah = info.upload;
  });

  // ------------------------------------------------------------- pencarian
  async function cari(q, { diamDiam = false } = {}) {
    if (!diamDiam) sibuk(tombol, true, 'Mencari…');
    tampilkanPesan(kotakPesan, 'info', null);

    const hasil = await api.get(`/api/registrations/check?q=${encodeURIComponent(q)}`);
    if (!diamDiam) sibuk(tombol, false);

    if (!hasil.ok) {
      wadah.innerHTML = '';
      tampilkanPesan(kotakPesan, 'galat', (hasil.errors || []).map((e) => e.message));
      kotakPesan.classList.remove('sembunyi');
      return;
    }

    if (!hasil.results.length) {
      wadah.innerHTML = `
        <div class="kosong">
          <h2 class="kosong__judul">Belum ketemu</h2>
          <p class="kosong__teks">${aman(hasil.message)}</p>
          <p style="display:flex;gap:var(--s-4);flex-wrap:wrap;justify-content:center">
            <a class="tbl tbl--utama" href="/pendaftaran">Daftar sekarang</a>
            <a class="tbl tbl--hantu" href="https://wa.me/6281243740109" target="_blank" rel="noopener">Tanya panitia</a>
          </p>
        </div>`;
      return;
    }

    kotakPesan.classList.add('sembunyi');
    wadah.innerHTML =
      (hasil.results.length > 1
        ? `<p class="bidang__bantuan" style="margin-bottom:var(--s-4)">Ditemukan ${hasil.results.length} pendaftaran atas data ini.</p>`
        : '') + hasil.results.map(gambarKartu).join('');

    pasangAksi();

    // Server hanya mengirim `group` bila ada pendaftaran yang sudah disahkan.
    const sah = hasil.results.find((p) => p.payment_status === 'verified');
    if (sah) popupGrup(hasil.group, sah.reg_number);
  }

  // --------------------------------------------------------------- tampilan
  const NASIHAT = {
    pending: 'Kami belum menerima bukti pembayaranmu. Transfer sesuai nominal di bawah, lalu unggah buktinya di sini.',
    review: 'Bukti sudah masuk dan sedang diperiksa panitia. Biasanya selesai dalam 1x24 jam pada hari kerja.',
    verified: 'Pembayaranmu sah. Nomor BIB sudah terbit dan kartu peserta bisa diunduh.',
    rejected: 'Bukti yang kamu kirim belum bisa diterima. Perbaiki sesuai catatan panitia, lalu unggah ulang.',
  };

  function gambarKartu(p) {
    const bisaUnggah = p.payment_status !== 'verified';
    const perluBayar = p.payment_status === 'pending' || p.payment_status === 'rejected';

    return `
    <article class="status-kartu" data-reg="${aman(p.reg_number)}">
      <header class="status-kartu__kepala" data-status="${aman(p.payment_status)}">
        <span class="status-kartu__reg">${aman(p.reg_number)}</span>
        <span class="label">${aman(p.status_label)}</span>
      </header>

      <div class="status-kartu__badan">
        <p style="font-family:var(--teriak);font-size:var(--t-2);font-weight:900;text-transform:uppercase;line-height:1;margin-bottom:var(--s-4)">
          ${aman(p.full_name)}
        </p>

        <p class="pesan pesan--${p.payment_status === 'rejected' ? 'galat' : p.payment_status === 'verified' ? 'sukses' : 'info'}"
           style="margin-bottom:var(--s-5)">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11 7h2v2h-2V7zm0 4h2v6h-2v-6zm1-9a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/></svg>
          <span>${aman(NASIHAT[p.payment_status] || '')}${
            p.admin_note ? `<br><b>Catatan panitia:</b> ${aman(p.admin_note)}` : ''
          }</span>
        </p>

        <dl class="rinci">
          <div><dt>Paket</dt><dd>${aman(p.package_label)}</dd></div>
          <div><dt>Ukuran jersey</dt><dd>${p.jersey_size ? aman(p.jersey_size) : 'Tanpa jersey'}</dd></div>
          <div><dt>Nominal transfer</dt><dd>${aman(p.amount_label)}</dd></div>
          <div><dt>Nomor WhatsApp</dt><dd>${aman(p.phone_masked)}</dd></div>
          <div><dt>Waktu daftar</dt><dd>${aman(waktu(p.created_at))}</dd></div>
          <div><dt>Bukti pembayaran</dt><dd>${p.has_proof ? aman(waktu(p.proof_uploaded_at)) : 'Belum dikirim'}</dd></div>
        </dl>

        ${p.bib_number ? gambarBib(p) : ''}
        ${perluBayar ? gambarTransfer(p) : ''}
        ${bisaUnggah ? gambarUnggah(p) : ''}
      </div>
    </article>`;
  }

  function gambarBib(p) {
    return `
      <div style="display:flex;flex-wrap:wrap;gap:var(--s-4);align-items:center;margin-bottom:var(--s-5)">
        <span class="bib"><span>Nomor BIB</span><b>${aman(p.bib_number)}</b></span>
        <a class="tbl tbl--laut" href="/kartu/${encodeURIComponent(p.reg_number)}">Buka kartu peserta</a>
      </div>`;
  }

  function gambarTransfer(p) {
    const b = p.payment;
    return `
      <div style="margin-bottom:var(--s-5)">
        <p class="bidang__label">Transfer ke</p>
        <div class="nominal">
          <b>${aman(b.amountLabel)}</b>
          <small>${aman(b.bank.name)} · ${aman(b.bank.account)} · a.n. ${aman(b.bank.holder)}</small>
        </div>
        <button class="tbl tbl--kuning tbl--kecil salin" type="button" data-salin="${aman(b.bank.account)}">
          Salin nomor rekening
        </button>
      </div>`;
  }

  function gambarUnggah(p) {
    return `
      <div class="unggah">
        <p class="bidang__label">${p.has_proof ? 'Ganti bukti pembayaran' : 'Unggah bukti pembayaran'}</p>
        <form class="form-unggah" data-reg="${aman(p.reg_number)}" novalidate>
          <label class="jatuh" data-jatuh>
            <svg class="jatuh__ikon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.99 5.99 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/></svg>
            <span class="jatuh__judul">Pilih berkas</span>
            <span class="jatuh__ket">JPG, PNG, atau PDF · maksimal ${aman(batasUnggah.maxLabel)}</span>
            <input type="file" name="proof" accept="${aman(batasUnggah.accept)}" required>
          </label>

          <div class="pratinjau sembunyi" data-pratinjau></div>

          <label class="bidang" data-bidang="phone_last4" style="margin:var(--s-4) 0">
            <span class="bidang__label">4 angka terakhir nomor WhatsApp-mu</span>
            <input class="isian" type="text" name="phone_last4" inputmode="numeric" maxlength="4"
                   pattern="[0-9]{4}" required placeholder="Contoh: 7890" style="max-width:10rem">
            <p class="bidang__bantuan">Pengganti kata sandi, supaya orang lain tidak bisa mengunggah bukti atas nomor registrasimu.</p>
            <p class="bidang__galat"></p>
          </label>

          <div class="pesan sembunyi" data-pesan role="alert"></div>

          <button class="tbl tbl--utama" type="submit">Kirim bukti pembayaran</button>
        </form>
      </div>`;
  }

  // ----------------------------------------------------------------- aksi
  function pasangAksi() {
    qsa('.salin', wadah).forEach((tombolSalin) => {
      tombolSalin.addEventListener('click', async () => {
        if (!(await salin(tombolSalin.dataset.salin))) return;
        tombolSalin.dataset.tersalin = 'true';
        setTimeout(() => { delete tombolSalin.dataset.tersalin; }, 1600);
      });
    });

    qsa('.form-unggah', wadah).forEach(siapkanUnggah);
  }

  function siapkanUnggah(formUnggah) {
    const jatuh = qs('[data-jatuh]', formUnggah);
    const berkasInput = qs('input[type="file"]', formUnggah);
    const pratinjau = qs('[data-pratinjau]', formUnggah);
    const pesan = qs('[data-pesan]', formUnggah);
    const kirim = qs('button[type="submit"]', formUnggah);

    ['dragenter', 'dragover'].forEach((nama) =>
      jatuh.addEventListener(nama, (e) => { e.preventDefault(); jatuh.dataset.seret = 'true'; })
    );
    ['dragleave', 'drop'].forEach((nama) =>
      jatuh.addEventListener(nama, (e) => { e.preventDefault(); delete jatuh.dataset.seret; })
    );
    jatuh.addEventListener('drop', (e) => {
      if (e.dataTransfer.files.length) {
        berkasInput.files = e.dataTransfer.files;
        tampilkanPratinjau();
      }
    });

    berkasInput.addEventListener('change', tampilkanPratinjau);

    function tampilkanPratinjau() {
      const berkas = berkasInput.files[0];
      if (!berkas) {
        pratinjau.classList.add('sembunyi');
        return;
      }

      if (berkas.size > batasUnggah.maxBytes) {
        tampilkanPesan(pesan, 'galat', `Berkas ${(berkas.size / 1048576).toFixed(1)} MB, melebihi batas ${batasUnggah.maxLabel}. Perkecil dulu fotonya.`);
        pesan.classList.remove('sembunyi');
        berkasInput.value = '';
        pratinjau.classList.add('sembunyi');
        return;
      }

      tampilkanPesan(pesan, 'info', null);
      const gambar = berkas.type.startsWith('image/')
        ? `<img src="${URL.createObjectURL(berkas)}" alt="Pratinjau bukti pembayaran">`
        : `<span class="bib" style="padding:var(--s-3)"><b style="font-size:1rem">PDF</b></span>`;

      pratinjau.innerHTML =
        gambar +
        `<div class="pratinjau__berkas">
           <p class="pratinjau__nama">${aman(berkas.name)}</p>
           <p class="pratinjau__ukuran">${(berkas.size / 1024).toFixed(0)} KB</p>
         </div>
         <button class="tbl tbl--hantu tbl--kecil" type="button" data-hapus>Ganti</button>`;
      pratinjau.classList.remove('sembunyi');

      qs('[data-hapus]', pratinjau).addEventListener('click', () => {
        berkasInput.value = '';
        pratinjau.classList.add('sembunyi');
      });
    }

    formUnggah.addEventListener('submit', async (event) => {
      event.preventDefault();

      if (!berkasInput.files.length) {
        tampilkanPesan(pesan, 'galat', 'Pilih berkas bukti pembayaran dulu.');
        pesan.classList.remove('sembunyi');
        return;
      }

      const data = new FormData();
      data.append('proof', berkasInput.files[0]);
      data.append('phone_last4', qs('input[name="phone_last4"]', formUnggah).value);

      sibuk(kirim, true, 'Mengunggah…');
      const hasil = await api.form(
        `/api/registrations/${encodeURIComponent(formUnggah.dataset.reg)}/proof`,
        data
      );
      sibuk(kirim, false);

      if (!hasil.ok) {
        window.FR.pasangGalat(formUnggah, hasil.errors);
        const umum = (hasil.errors || []).filter((e) => e.field === '_' || e.field === 'proof');
        if (umum.length) {
          tampilkanPesan(pesan, 'galat', umum.map((e) => e.message));
          pesan.classList.remove('sembunyi');
        }
        return;
      }

      tampilkanPesan(pesan, 'sukses', hasil.message);
      pesan.classList.remove('sembunyi');
      setTimeout(() => cari(isian.value.trim(), { diamDiam: true }), 1200);
    });
  }

  // ---------------------------------------------------------------- awal
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const q = isian.value.trim();
    if (!q) {
      tampilkanPesan(kotakPesan, 'galat', 'Isi nomor registrasi atau nomor WhatsApp dulu.');
      kotakPesan.classList.remove('sembunyi');
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set('q', q);
    window.history.replaceState({}, '', url);
    cari(q);
  });

  const awal = new URLSearchParams(window.location.search).get('q');
  if (awal) {
    isian.value = awal;
    cari(awal);
  }
})();
