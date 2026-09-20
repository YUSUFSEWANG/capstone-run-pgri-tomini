/* ==========================================================================
   Daftar peserta + laci verifikasi pembayaran.
   ========================================================================== */
(function () {
  'use strict';

  const { qs, qsa, api, aman, waktu, rupiah, tanggal } = window.FR;
  const { muatAku, roti, rotiGalat } = window.ADM;

  const isiTabel = qs('#isiTabel');
  const formSaring = qs('#formSaring');
  const laci = qs('#laci');
  const laciTirai = qs('#laciTirai');

  const keadaan = { search: '', status: '', package: '', sort: 'created_desc', page: 1 };
  let admin = null;
  let pesertaTerbuka = null;
  let pemicuLaci = null;

  // ------------------------------------------------------------- pemuatan
  async function muatDaftar() {
    const kueri = new URLSearchParams({
      search: keadaan.search,
      status: keadaan.status,
      package: keadaan.package,
      sort: keadaan.sort,
      page: String(keadaan.page),
      per_page: '25',
    });

    const hasil = await api.get(`/api/admin/participants?${kueri}`);
    if (!hasil.ok) {
      rotiGalat(hasil, 'Daftar peserta gagal dimuat.');
      return;
    }

    gambarTabel(hasil);
  }

  function gambarTabel(hasil) {
    const { rows, total, page, totalPages, perPage } = hasil;

    qs('#ringkasJumlah').textContent = total
      ? `${total} pendaftaran cocok dengan penyaring yang aktif.`
      : 'Tidak ada pendaftaran yang cocok.';

    if (!rows.length) {
      isiTabel.innerHTML =
        '<tr><td colspan="7" style="text-align:center;padding:var(--s-7)">' +
        '<b>Tidak ada data.</b><br><span class="bidang__bantuan">Longgarkan penyaring atau kosongkan kolom pencarian.</span>' +
        '</td></tr>';
    } else {
      isiTabel.innerHTML = rows
        .map(
          (p) => `
        <tr tabindex="0" data-id="${p.id}">
          <td>
            <div class="tabel__nama">${aman(p.full_name)}</div>
            <div class="tabel__sub">${aman(p.reg_number)} · ${aman(p.phone_pretty)}${
              p.institution ? ` · ${aman(p.institution)}` : ''
            }</div>
          </td>
          <td>${aman(p.package_label)}</td>
          <td class="tabel__angka">${p.jersey_size ? aman(p.jersey_size) : '—'}</td>
          <td class="tabel__angka">${aman(p.amount_label)}</td>
          <td><span class="tanda" data-status="${aman(p.payment_status)}">${aman(p.status_label)}</span>${
            p.has_proof && p.payment_status === 'review' ? ' <span class="tabel__sub">bukti ada</span>' : ''
          }</td>
          <td class="tabel__angka">${p.bib_number ? `<b>${aman(p.bib_number)}</b>` : '—'}</td>
          <td class="tabel__sub">${aman(tanggal(p.created_at))}</td>
        </tr>`
        )
        .join('');
    }

    const mulai = total ? (page - 1) * perPage + 1 : 0;
    const akhir = Math.min(page * perPage, total);
    qs('#infoHalaman').textContent = total
      ? `Menampilkan ${mulai}–${akhir} dari ${total} · halaman ${page}/${totalPages}`
      : '';

    qs('#halamanSebelum').disabled = page <= 1;
    qs('#halamanSesudah').disabled = page >= totalPages;
  }

  // Satu baris = satu peserta; klik atau Enter membuka rinciannya.
  isiTabel.addEventListener('click', (event) => {
    const baris = event.target.closest('tr[data-id]');
    if (baris) bukaLaci(baris.dataset.id, baris);
  });

  isiTabel.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const baris = event.target.closest('tr[data-id]');
    if (!baris) return;
    event.preventDefault();
    bukaLaci(baris.dataset.id, baris);
  });

  // ---------------------------------------------------------------- laci
  async function bukaLaci(id, pemicu) {
    pemicuLaci = pemicu || null;
    laci.hidden = false;
    laci.dataset.buka = 'true';
    laciTirai.dataset.buka = 'true';
    qs('#laciBadan').innerHTML = '<p style="text-align:center;padding:var(--s-7)"><span class="memuat"></span></p>';
    qs('#laciKaki').innerHTML = '';

    const hasil = await api.get(`/api/admin/participants/${id}`);
    if (!hasil.ok) {
      rotiGalat(hasil, 'Rincian peserta gagal dimuat.');
      tutupLaci();
      return;
    }

    pesertaTerbuka = hasil.participant;
    gambarLaci(pesertaTerbuka);
    qs('#laciTutup').focus();
  }

  function tutupLaci() {
    laci.dataset.buka = 'false';
    laciTirai.dataset.buka = 'false';
    pesertaTerbuka = null;
    setTimeout(() => { laci.hidden = true; }, 240);
    if (pemicuLaci) pemicuLaci.focus();
  }

  qs('#laciTutup').addEventListener('click', tutupLaci);
  laciTirai.addEventListener('click', tutupLaci);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && laci.dataset.buka === 'true') tutupLaci();
  });

  function gambarLaci(p) {
    qs('#laciReg').textContent = p.reg_number;

    const bukti = p.has_proof
      ? `<div class="bukti">
           ${
             p.proof_is_pdf
               ? `<iframe src="/api/admin/participants/${p.id}/proof" title="Bukti pembayaran ${aman(p.reg_number)}"></iframe>`
               : `<img src="/api/admin/participants/${p.id}/proof" alt="Bukti pembayaran ${aman(p.reg_number)}">`
           }
           <div class="bukti__kaki">
             <span>Diunggah ${aman(waktu(p.proof_uploaded_at))}</span>
             <a href="/api/admin/participants/${p.id}/proof" target="_blank" rel="noopener">Buka ukuran penuh</a>
           </div>
         </div>`
      : `<div class="pesan pesan--ingat" style="margin-bottom:var(--s-5)">
           <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2 1 21h22L12 2zm1 14h-2v2h2v-2zm0-7h-2v5h2V9z"/></svg>
           <div><p class="pesan__judul">Belum ada bukti pembayaran</p><p>Peserta belum mengunggah apa pun. Kirim pengingat lewat WhatsApp sebelum menolak.</p></div>
         </div>`;

    const catatan = p.admin_note
      ? `<div class="laci-rinci--penuh"><dt>Catatan panitia</dt><dd>${aman(p.admin_note)}</dd></div>`
      : '';

    qs('#laciBadan').innerHTML = `
      <div style="display:flex;flex-wrap:wrap;gap:var(--s-3);align-items:center;margin-bottom:var(--s-4)">
        <span class="tanda" data-status="${aman(p.payment_status)}">${aman(p.status_label)}</span>
        ${p.bib_number ? `<span class="tanda" style="background:var(--mentari)">BIB ${aman(p.bib_number)}</span>` : ''}
        <span class="tanda">${aman(p.package_label)}</span>
      </div>

      <h2 style="font-family:var(--teriak);font-size:var(--t-2);font-weight:900;text-transform:uppercase;line-height:1;margin-bottom:var(--s-4)">
        ${aman(p.full_name)}
      </h2>

      ${bukti}

      <dl class="laci-rinci">
        <div><dt>Nominal transfer</dt><dd>${aman(p.amount_label)}${p.unique_code ? ` <small>(kode ${p.unique_code})</small>` : ''}</dd></div>
        <div><dt>Ukuran jersey</dt><dd>${p.jersey_size ? aman(p.jersey_size) : 'Tanpa jersey'}</dd></div>
        <div><dt>No. WhatsApp</dt><dd>${aman(p.phone_pretty)}</dd></div>
        <div><dt>Jenis kelamin</dt><dd>${p.gender === 'L' ? 'Laki-laki' : 'Perempuan'}</dd></div>
        <div><dt>Tanggal lahir</dt><dd>${aman(tanggal(p.birth_date, true))}</dd></div>
        <div><dt>Gol. darah</dt><dd>${p.blood_type ? aman(p.blood_type) : '—'}</dd></div>
        <div class="laci-rinci--penuh"><dt>Instansi / ranting</dt><dd>${p.institution ? aman(p.institution) : '—'}</dd></div>
        <div class="laci-rinci--penuh"><dt>Alamat</dt><dd>${p.address ? aman(p.address) : '—'}</dd></div>
        <div class="laci-rinci--penuh"><dt>Email</dt><dd>${p.email ? aman(p.email) : '—'}</dd></div>
        <div class="laci-rinci--penuh"><dt>Kontak darurat</dt><dd>${aman(p.emergency_name || '—')} · ${aman(p.emergency_phone_pretty || '')}</dd></div>
        <div class="laci-rinci--penuh"><dt>Catatan kesehatan</dt><dd>${p.health_note ? aman(p.health_note) : 'Tidak ada'}</dd></div>
        <div><dt>Waktu daftar</dt><dd>${aman(waktu(p.created_at))}</dd></div>
        <div><dt>Diverifikasi</dt><dd>${p.verified_at ? `${aman(waktu(p.verified_at))}<br><small>oleh ${aman(p.verifier_name || '—')}</small>` : '—'}</dd></div>
        ${catatan}
      </dl>
    `;

    const bisaVerifikasi = p.payment_status !== 'verified' && p.has_proof;
    const bisaTolak = p.payment_status === 'review' || p.payment_status === 'verified';

    qs('#laciKaki').innerHTML = `
      ${bisaVerifikasi ? '<button class="tbl tbl--kecil tbl--kuning" type="button" data-aksi="verifikasi">Sahkan pembayaran</button>' : ''}
      ${bisaTolak ? '<button class="tbl tbl--kecil" type="button" data-aksi="tolak">Tolak bukti</button>' : ''}
      ${p.wa_link ? `<a class="tbl tbl--kecil" href="${p.wa_link}" target="_blank" rel="noopener">Kirim WhatsApp</a>` : ''}
      ${admin && admin.role === 'ketua' ? '<button class="tbl tbl--kecil tbl--hantu" type="button" data-aksi="hapus">Hapus</button>' : ''}
    `;

    qsa('[data-aksi]', qs('#laciKaki')).forEach((tombol) => {
      tombol.addEventListener('click', () => jalankanAksi(tombol.dataset.aksi, p));
    });
  }

  // --------------------------------------------------------------- aksi
  async function jalankanAksi(aksi, p) {
    if (aksi === 'verifikasi') {
      if (!window.confirm(`Sahkan pembayaran ${p.full_name} sebesar ${p.amount_label}?\n\nNomor BIB akan otomatis terbit dan peserta bisa mengunduh kartunya.`)) return;
      const hasil = await api.post(`/api/admin/participants/${p.id}/verify`, {});
      if (!hasil.ok) return rotiGalat(hasil, 'Verifikasi gagal.');
      roti(hasil.message, 'sukses');
      gambarLaci(hasil.participant);
      muatDaftar();
      return;
    }

    if (aksi === 'tolak') {
      if (
        p.bib_number &&
        !window.confirm(
          `${p.full_name} sudah disahkan dan memegang BIB ${p.bib_number}.\n\nMenolak bukti sekarang melepas nomor itu dan membatalkan kartu pesertanya. Lanjutkan?`
        )
      ) {
        return;
      }

      const alasan = window.prompt(
        'Kenapa bukti ini ditolak? Alasannya ditampilkan ke peserta.\n\nContoh: "Nominal transfer tidak sesuai" atau "Foto buram, angka tidak terbaca".'
      );
      if (alasan === null) return;
      const hasil = await api.post(`/api/admin/participants/${p.id}/reject`, { note: alasan });
      if (!hasil.ok) return rotiGalat(hasil, 'Penolakan gagal disimpan.');
      roti(hasil.message, 'sukses');
      gambarLaci(hasil.participant);
      muatDaftar();
      return;
    }

    if (aksi === 'hapus') {
      if (!window.confirm(`Hapus pendaftaran ${p.reg_number} atas nama ${p.full_name}?\n\nData dan bukti pembayarannya hilang permanen, jatah jerseynya dikembalikan ke stok. Tindakan ini tidak bisa dibatalkan.`)) return;
      const hasil = await api.del(`/api/admin/participants/${p.id}`);
      if (!hasil.ok) return rotiGalat(hasil, 'Penghapusan gagal.');
      roti(hasil.message, 'sukses');
      tutupLaci();
      muatDaftar();
    }
  }

  // ----------------------------------------------------------- penyaring
  let tundaCari = null;

  formSaring.addEventListener('input', (event) => {
    if (event.target.name === 'search') {
      clearTimeout(tundaCari);
      tundaCari = setTimeout(() => {
        keadaan.search = event.target.value.trim();
        keadaan.page = 1;
        simpanAlamat();
        muatDaftar();
      }, 320);
    }
  });

  formSaring.addEventListener('change', (event) => {
    if (event.target.name === 'search') return;
    keadaan[event.target.name] = event.target.value;
    keadaan.page = 1;
    simpanAlamat();
    muatDaftar();
  });

  qs('#resetSaring').addEventListener('click', () => {
    formSaring.reset();
    Object.assign(keadaan, { search: '', status: '', package: '', sort: 'created_desc', page: 1 });
    simpanAlamat();
    muatDaftar();
  });

  qs('#halamanSebelum').addEventListener('click', () => {
    keadaan.page = Math.max(keadaan.page - 1, 1);
    muatDaftar();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  qs('#halamanSesudah').addEventListener('click', () => {
    keadaan.page += 1;
    muatDaftar();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  /** Simpan penyaring di alamat supaya halaman bisa dibagikan/ditandai. */
  function simpanAlamat() {
    const url = new URL(window.location.href);
    ['search', 'status', 'package', 'sort'].forEach((kunci) => {
      if (keadaan[kunci]) url.searchParams.set(kunci, keadaan[kunci]);
      else url.searchParams.delete(kunci);
    });
    window.history.replaceState({}, '', url);
  }

  function bacaAlamat() {
    const params = new URLSearchParams(window.location.search);
    ['search', 'status', 'package', 'sort'].forEach((kunci) => {
      const nilai = params.get(kunci);
      if (!nilai) return;
      keadaan[kunci] = nilai;
      const isian = qs(`[name="${kunci}"]`, formSaring);
      if (isian) isian.value = nilai;
    });
  }

  (async () => {
    admin = await muatAku();
    if (!admin) return;
    bacaAlamat();
    muatDaftar();
  })();
})();
