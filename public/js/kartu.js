/* ==========================================================================
   Kartu peserta — terbit setelah pembayaran diverifikasi.
   ========================================================================== */
(function () {
  'use strict';

  const { qs, api, aman } = window.FR;
  const wadah = qs('#wadahKartu');

  /** Nomor registrasi diambil dari alamat: /kartu/FRPT-2026-0001 atau ?reg= */
  function ambilNomor() {
    const dariJalur = window.location.pathname.match(/\/kartu\/([^/?#]+)/);
    if (dariJalur) return decodeURIComponent(dariJalur[1]);
    return new URLSearchParams(window.location.search).get('reg') || '';
  }

  function kosong(judul, teks, tautan) {
    wadah.innerHTML = `
      <div class="kosong">
        <h2 class="kosong__judul">${aman(judul)}</h2>
        <p class="kosong__teks">${aman(teks)}</p>
        <p style="display:flex;gap:var(--s-4);flex-wrap:wrap;justify-content:center">
          ${tautan}
        </p>
      </div>`;
  }

  async function muat() {
    const reg = ambilNomor();

    if (!reg) {
      kosong(
        'Nomor registrasi belum ada',
        'Buka kartu pesertamu dari halaman Cek Pendaftaran supaya nomor registrasinya terbawa.',
        '<a class="tbl tbl--utama" href="/cek">Buka cek pendaftaran</a>'
      );
      return;
    }

    const hasil = await api.get(`/api/registrations/${encodeURIComponent(reg)}/card`);

    if (!hasil.ok) {
      const pesan = (hasil.errors && hasil.errors[0] && hasil.errors[0].message) || 'Kartu tidak bisa dibuka.';
      kosong(
        hasil.status === 404 ? 'Nomor registrasi tidak ditemukan' : 'Kartu belum terbit',
        pesan,
        `<a class="tbl tbl--utama" href="/cek?q=${encodeURIComponent(reg)}">Cek status pendaftaran</a>` +
        '<a class="tbl tbl--hantu" href="https://wa.me/6281243740109" target="_blank" rel="noopener">Tanya panitia</a>'
      );
      return;
    }

    gambar(hasil.card);
  }

  function gambar(k) {
    wadah.innerHTML = `
      <div class="tiket">
        <div class="tiket__kepala">
          <p class="tiket__acara">Fun Run<span>PGRI Tomini 2026</span></p>
          <p class="tiket__meta">${aman(k.event.date)} · ${aman(k.event.distance)}</p>
        </div>

        <div class="tiket__bib">
          <span>Nomor BIB</span>
          <b>${aman(k.bib_number)}</b>
        </div>

        <p class="tiket__nama">${aman(k.full_name)}</p>

        <div class="tiket__badan">
          <dl class="tiket__daftar">
            <div><dt>No. registrasi</dt><dd>${aman(k.reg_number)}</dd></div>
            <div><dt>Paket</dt><dd>${aman(k.package_label)}</dd></div>
            <div><dt>Jersey</dt><dd>${k.jersey_size ? aman(k.jersey_size) : 'Tanpa jersey'}</dd></div>
            <div><dt>Gol. darah</dt><dd>${k.blood_type ? aman(k.blood_type) : '—'}</dd></div>
            <div><dt>Instansi</dt><dd>${k.institution ? aman(k.institution) : '—'}</dd></div>
            <div><dt>Kontak darurat</dt><dd>${aman(k.emergency_name || '—')}<br>${aman(k.emergency_phone || '')}</dd></div>
          </dl>

          <div class="tiket__qr">
            <img src="${k.qr}" alt="Kode QR untuk verifikasi pendaftaran ${aman(k.reg_number)}" width="136" height="136">
            <small>Pindai saat daftar ulang</small>
          </div>
        </div>
      </div>

      <div class="cetak-sembunyi" style="display:flex;gap:var(--s-4);flex-wrap:wrap;justify-content:center;margin-top:var(--s-6)">
        <button class="tbl tbl--utama" type="button" id="tombolCetak">Cetak / simpan PDF</button>
        <a class="tbl tbl--hantu" href="/cek?q=${encodeURIComponent(k.reg_number)}">Kembali ke status</a>
      </div>

      <div class="pesan pesan--ingat cetak-sembunyi" style="margin-top:var(--s-5)">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2 1 21h22L12 2zm1 14h-2v2h2v-2zm0-7h-2v5h2V9z"/></svg>
        <div>
          <p class="pesan__judul">Bawa saat hari-H</p>
          <p>Daftar ulang dibuka sebelum start di ${aman(k.event.location)}. Tunjukkan kartu ini untuk mengambil nomor BIB${k.jersey_size ? ' dan jersey' : ''}.</p>
        </div>
      </div>`;

    qs('#tombolCetak').addEventListener('click', () => window.print());
    document.title = `Kartu Peserta ${k.bib_number} — ${k.full_name}`;
  }

  muat();
})();
