/* ==========================================================================
   Dasbor panitia — angka yang menentukan keputusan, bukan sekadar hiasan.
   ========================================================================== */
(function () {
  'use strict';

  const { qs, api, rupiah, aman, waktu } = window.FR;
  const { muatAku, roti } = window.ADM;

  function kartuAngka(s, reg) {
    const perluTindakan = s.review;

    return [
      {
        label: 'Total pendaftar',
        nilai: s.total,
        ket: reg.quota > 0 ? `Kuota ${reg.quota} · sisa ${reg.remaining}` : 'Tanpa batas kuota',
        kelas: '',
      },
      {
        label: 'Menunggu diperiksa',
        nilai: perluTindakan,
        ket: perluTindakan ? 'Bukti sudah masuk, butuh keputusanmu' : 'Tidak ada antrean',
        kelas: perluTindakan ? 'stat--perlu' : '',
      },
      {
        label: 'Terverifikasi',
        nilai: s.verified,
        ket: `${s.byPackage.lengkap} lengkap · ${s.byPackage.hemat} hemat`,
        kelas: 'stat--sah',
      },
      {
        label: 'Belum bayar',
        nilai: s.pending,
        ket: s.rejected ? `${s.rejected} bukti ditolak` : 'Belum ada yang ditolak',
        kelas: '',
      },
      {
        label: 'Dana masuk (sah)',
        nilai: rupiah(s.revenue),
        ket: `Potensi ${rupiah(s.pendingValue)} belum masuk`,
        kelas: 'stat--uang',
      },
    ]
      .map(
        (k) =>
          `<article class="stat ${k.kelas}">
             <span class="stat__label">${aman(k.label)}</span>
             <b class="stat__nilai">${aman(k.nilai)}</b>
             <p class="stat__ket">${aman(k.ket)}</p>
           </article>`
      )
      .join('');
  }

  function batang(baris, warna) {
    const puncak = Math.max(...baris.map((b) => b.nilai), 1);
    return baris
      .map(
        (b) =>
          `<div class="batang__baris">
             <span class="batang__label" title="${aman(b.label)}">${aman(b.label)}</span>
             <span class="batang__jalur"><span class="batang__isi" data-warna="${warna || ''}" style="width:${(b.nilai / puncak) * 100}%"></span></span>
             <span class="batang__nilai">${aman(b.tampil !== undefined ? b.tampil : b.nilai)}</span>
           </div>`
      )
      .join('');
  }

  function grafikHarian(daily) {
    const wadah = qs('#grafikHarian');
    const kaki = qs('#grafikHarianKaki');

    if (!daily.length) {
      wadah.innerHTML = '';
      kaki.innerHTML = '<span>Belum ada pendaftaran masuk.</span>';
      return;
    }

    const puncak = Math.max(...daily.map((d) => d.n), 1);
    wadah.innerHTML = daily
      .map(
        (d) =>
          `<span class="harian__hari" style="height:${Math.max((d.n / puncak) * 100, 4)}%" title="${aman(d.day)}: ${d.n} pendaftar"></span>`
      )
      .join('');

    kaki.innerHTML =
      `<span>${aman(window.FR.tanggal(daily[0].day))}</span>` +
      `<span>puncak ${puncak}/hari</span>` +
      `<span>${aman(window.FR.tanggal(daily[daily.length - 1].day))}</span>`;

    qs('#totalHarian').textContent = `${daily.reduce((n, d) => n + d.n, 0)} total`;
  }

  async function muat() {
    const admin = await muatAku();
    if (!admin) return;

    const hasil = await api.get('/api/admin/stats');
    if (!hasil.ok) {
      roti('Data dasbor gagal dimuat.', 'galat');
      return;
    }

    const { stats: s, registration: reg, activity, event } = hasil;

    qs('#ringkasAcara').textContent =
      `${event.name} · ${event.raceDateLabel} · ${event.location}`;

    qs('#kartuAngka').innerHTML = kartuAngka(s, reg);

    // Keadaan pendaftaran ditaruh di atas supaya panitia langsung sadar
    // kalau formulir sedang tertutup tanpa disengaja.
    const kotak = qs('#kotakStatus');
    if (!reg.open) {
      kotak.className = 'pesan pesan--ingat';
      kotak.innerHTML =
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2 1 21h22L12 2zm1 14h-2v2h2v-2zm0-7h-2v5h2V9z"/></svg>' +
        `<div><p class="pesan__judul">Pendaftaran sedang tertutup</p><p>${aman(reg.reason)} Peserta tidak bisa mengisi formulir. Ubah di <a href="/admin/pengaturan">Pengaturan</a>.</p></div>`;
      kotak.classList.remove('sembunyi');
    }

    grafikHarian(s.daily);

    qs('#batangJersey').innerHTML = batang(
      s.jersey.map((j) => ({
        label: j.size,
        nilai: j.quota ? (j.used / j.quota) * 100 : 0,
        tampil: `${j.used}/${j.quota}`,
      })),
      'kuning'
    );

    qs('#batangInstansi').innerHTML = s.topInstitutions.length
      ? batang(s.topInstitutions.map((i) => ({ label: i.institution, nilai: i.n })), 'pirus')
      : '<p class="bidang__bantuan">Belum ada data instansi.</p>';

    qs('#batangKomposisi').innerHTML = batang(
      [
        { label: 'Laki-laki', nilai: s.byGender.L },
        { label: 'Perempuan', nilai: s.byGender.P },
        { label: 'Lengkap', nilai: s.byPackage.lengkap },
        { label: 'Hemat', nilai: s.byPackage.hemat },
      ],
      'merah'
    );

    qs('#daftarJejak').innerHTML = activity.length
      ? activity
          .map(
            (a) =>
              `<li>
                 <span class="jejak__titik"></span>
                 <span>
                   <b>${aman(a.admin_name || 'sistem')}</b> ${aman(a.action)}
                   ${a.target_id ? `<code>${aman(a.target_id)}</code>` : ''}
                   ${a.detail ? `— ${aman(a.detail)}` : ''}
                   <span class="jejak__waktu">${aman(waktu(a.created_at))}</span>
                 </span>
               </li>`
          )
          .join('')
      : '<li><span class="jejak__titik"></span><span>Belum ada aktivitas tercatat.</span></li>';
  }

  muat();
})();
