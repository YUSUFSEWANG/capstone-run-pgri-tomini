/* ==========================================================================
   Formulir pendaftaran.
   ========================================================================== */
(function () {
  'use strict';

  const { qs, qsa, api, rupiah, aman, pasangGalat, bersihkanGalat, tampilkanPesan, sibuk, salin, kartuGrup } = window.FR;

  const form = qs('#formDaftar');
  const panelForm = qs('#panelForm');
  const panelHasil = qs('#panelHasil');
  const panelTutup = qs('#panelTutup');
  const kotakPesan = qs('#kotakPesan');
  const tombolKirim = qs('#tombolKirim');
  const bidangUkuran = qs('#bidangUkuran');
  const pilihUkuran = qs('#pilihUkuran');

  let info = null;

  // ------------------------------------------------------- muat setelan
  async function muat() {
    info = await api.get('/api/info');
    if (!info.ok) {
      tampilkanPesan(kotakPesan, 'galat', 'Data acara gagal dimuat. Muat ulang halaman ini.');
      kotakPesan.classList.remove('sembunyi');
      return;
    }

    if (!info.registration.open) {
      panelForm.classList.add('sembunyi');
      panelTutup.classList.remove('sembunyi');
      qs('#alasanTutup').textContent =
        `${info.registration.reason} Pendaftaran dijadwalkan ${window.FR.tanggal(info.registration.start, true)} sampai ${window.FR.tanggal(info.registration.end, true)}.`;
      return;
    }

    // Harga aktual dari setelan panitia.
    info.packages.forEach((paket) => {
      qsa(`[data-harga="${paket.code}"]`).forEach((el) => { el.textContent = rupiah(paket.price); });
    });

    gambarUkuran();
    isiGolonganDarah();
    isiPanduanUkuran();
    perbaruiRingkasan();
  }

  function gambarUkuran() {
    pilihUkuran.innerHTML = info.jersey
      .map((u) => {
        const habis = !u.available;
        return (
          `<label class="pilihan__item">` +
          `<input type="radio" name="jersey_size" value="${u.size}"${habis ? ' disabled' : ''}>` +
          `<span class="pilihan__isi">${u.size}` +
          (habis ? '' : ` <small style="opacity:.5;font-weight:400">${u.remaining}</small>`) +
          `</span></label>`
        );
      })
      .join('');
  }

  function isiGolonganDarah() {
    const select = qs('select[name="blood_type"]');
    info.bloodTypes.forEach((gol) => {
      const opsi = document.createElement('option');
      opsi.value = gol;
      opsi.textContent = gol;
      select.appendChild(opsi);
    });
  }

  function isiPanduanUkuran() {
    qs('#tabelUkuran').innerHTML = info.jerseyChart
      .map((baris) => `<tr><th scope="row">${baris.size}</th><td>${baris.chest}</td><td>${baris.length}</td></tr>`)
      .join('');
  }

  // ------------------------------------------------------- ringkasan hidup
  const paketTerpilih = () => qs('input[name="package"]:checked');
  const ukuranTerpilih = () => qs('input[name="jersey_size"]:checked');

  function perbaruiRingkasan() {
    if (!info) return;

    const dipilih = paketTerpilih();
    const paket = dipilih ? info.packages.find((p) => p.code === dipilih.value) : null;
    const ukuran = ukuranTerpilih();

    qs('#ringkasPaket').textContent = paket ? paket.label : 'Belum dipilih';
    qs('#ringkasJersey').textContent = paket && paket.withJersey ? (ukuran ? ukuran.value : 'Pilih ukuran') : '—';
    qs('#ringkasTotal').textContent = paket ? rupiah(paket.price) : 'Rp0';

    qs('#ringkasCatatan').textContent = !paket
      ? 'Pilih paket untuk melihat nominal yang harus ditransfer.'
      : info.registration.uniqueCode
        ? 'Nominal akhir ditambah kode unik 3 angka setelah data terkirim, supaya panitia bisa mencocokkan mutasi rekening.'
        : 'Transfer nominal ini persis setelah data terkirim.';

    // Bidang ukuran hanya relevan untuk paket berjersey.
    if (paket && paket.withJersey) {
      bidangUkuran.classList.remove('sembunyi');
    } else {
      bidangUkuran.classList.add('sembunyi');
      if (ukuran) ukuran.checked = false;
    }
  }

  form.addEventListener('change', (event) => {
    if (event.target.name === 'package' || event.target.name === 'jersey_size') perbaruiRingkasan();
    const bidang = event.target.closest('[data-galat]');
    if (bidang) {
      bidang.removeAttribute('data-galat');
      const pesan = qs('.bidang__galat', bidang);
      if (pesan) pesan.textContent = '';
    }
  });

  // --------------------------------------------------------------- kirim
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    bersihkanGalat(form);
    tampilkanPesan(kotakPesan, 'info', null);

    const data = Object.fromEntries(new FormData(form).entries());
    data.agreement = qs('input[name="agreement"]').checked;

    sibuk(tombolKirim, true, 'Mengirim…');
    const hasil = await api.post('/api/registrations', data);
    sibuk(tombolKirim, false);

    if (!hasil.ok) {
      const umum = pasangGalat(form, hasil.errors);
      if (umum.length) {
        tampilkanPesan(kotakPesan, 'galat', umum);
        kotakPesan.classList.remove('sembunyi');
      } else {
        tampilkanPesan(kotakPesan, 'galat', 'Ada isian yang perlu diperbaiki. Lihat tanda merah di bawah.');
        kotakPesan.classList.remove('sembunyi');
      }
      // Stok bisa berubah saat form terbuka lama — ambil ulang.
      const segar = await api.get('/api/jersey');
      if (segar.ok) {
        info.jersey = segar.jersey;
        const sebelumnya = ukuranTerpilih()?.value;
        gambarUkuran();
        const lagi = qs(`input[name="jersey_size"][value="${sebelumnya}"]`);
        if (lagi && !lagi.disabled) lagi.checked = true;
        perbaruiRingkasan();
      }
      return;
    }

    tampilkanHasil(hasil.participant, hasil.payment, hasil.group);
  });

  // -------------------------------------------------------------- hasil
  function tampilkanHasil(peserta, bayar, grup) {
    panelForm.classList.add('sembunyi');
    panelHasil.classList.remove('sembunyi');

    const kodeUnik = bayar.uniqueCode
      ? `<div><span>Kode unik</span><span>+ ${bayar.uniqueCode}</span></div>`
      : '';

    panelHasil.innerHTML = `
      <div class="hasil">
        <div class="hasil__utama">
          <p class="hasil__mata">Pendaftaran tersimpan</p>
          <b class="hasil__nomor">${aman(peserta.reg_number)}</b>
          <p class="hasil__nama">${aman(peserta.full_name)} · ${aman(peserta.package_label)}${
            peserta.jersey_size ? ` · Jersey ${aman(peserta.jersey_size)}` : ''
          }</p>
          <button class="tbl tbl--laut tbl--kecil salin" type="button" id="salinReg"
                  data-salin="${aman(peserta.reg_number)}" style="margin-top:var(--s-4)">
            Salin nomor registrasi
          </button>
        </div>

        <div class="hasil__petunjuk">
          <h2 class="gugus__judul">Langkah berikutnya: transfer</h2>
          <p class="bidang__bantuan" style="margin:var(--s-2) 0 0">
            Tempatmu belum terkunci sampai pembayaran diverifikasi panitia.
          </p>

          <div class="nominal">
            <b>${aman(bayar.amountLabel)}</b>
            <small>${aman(bayar.note)}</small>
          </div>

          <div class="rincian">
            <div><span>${aman(peserta.package_label)}</span><span>${rupiah(bayar.basePrice)}</span></div>
            ${kodeUnik}
            <div><span><b>Total transfer</b></span><span><b>${aman(bayar.amountLabel)}</b></span></div>
          </div>

          <dl class="rinci">
            <div><dt>Bank</dt><dd>${aman(bayar.bank.name)}</dd></div>
            <div><dt>Atas nama</dt><dd>${aman(bayar.bank.holder)}</dd></div>
          </dl>

          <button class="tbl tbl--kuning tbl--penuh salin" type="button" id="salinRek"
                  data-salin="${aman(bayar.bank.account)}">
            Salin rekening ${aman(bayar.bank.account)}
          </button>

          <hr class="pembatas">

          <p>Setelah transfer, unggah bukti pembayaranmu. Tanpa bukti, panitia tidak bisa memverifikasi dan nomor BIB tidak terbit.</p>
          <p style="display:flex;gap:var(--s-3);flex-wrap:wrap">
            <a class="tbl tbl--utama" href="/cek?q=${encodeURIComponent(peserta.reg_number)}">Unggah bukti pembayaran</a>
            <a class="tbl tbl--hantu" href="/pendaftaran">Daftarkan orang lain</a>
          </p>
        </div>

        <div class="pesan pesan--ingat">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2 1 21h22L12 2zm1 14h-2v2h2v-2zm0-7h-2v5h2V9z"/></svg>
          <div>
            <p class="pesan__judul">Simpan nomor registrasimu</p>
            <p>Nomor ${aman(peserta.reg_number)} dipakai untuk mengunggah bukti, mengecek status, dan mengunduh kartu peserta. Tangkap layar halaman ini atau catat nomornya.</p>
          </div>
        </div>

        ${kartuGrup(grup)}
      </div>
    `;

    qsa('.salin', panelHasil).forEach((tombol) => {
      tombol.addEventListener('click', async () => {
        if (!(await salin(tombol.dataset.salin))) return;
        tombol.dataset.tersalin = 'true';
        setTimeout(() => { delete tombol.dataset.tersalin; }, 1600);
      });
    });

    // Tandai tahap yang sudah lewat di penunjuk atas.
    const tahap = qsa('.tahap__item');
    tahap[0].dataset.selesai = 'true';
    tahap[0].removeAttribute('aria-current');
    tahap[1].setAttribute('aria-current', 'step');

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  muat();
})();
