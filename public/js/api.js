/* ==========================================================================
   Pembantu bersama — dipakai semua halaman.
   ========================================================================== */
(function (global) {
  'use strict';

  const qs = (selector, scope) => (scope || document).querySelector(selector);
  const qsa = (selector, scope) => Array.from((scope || document).querySelectorAll(selector));

  /** Pesan cadangan kalau jaringan putus di tengah jalan. */
  const GALAT_JARINGAN = 'Koneksi terputus. Periksa jaringan lalu coba lagi.';

  async function kirim(url, options) {
    let response;
    try {
      response = await fetch(url, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json', ...(options && options.headers) },
        ...options,
      });
    } catch (_error) {
      return { ok: false, status: 0, errors: [{ field: '_', message: GALAT_JARINGAN }] };
    }

    let data = {};
    try {
      data = await response.json();
    } catch (_error) {
      data = { ok: false, errors: [{ field: '_', message: 'Balasan server tidak bisa dibaca.' }] };
    }

    return { ...data, ok: response.ok && data.ok !== false, status: response.status };
  }

  const api = {
    get: (url) => kirim(url, { method: 'GET' }),

    json: (url, method, body) =>
      kirim(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
      }),

    post: (url, body) => api.json(url, 'POST', body),
    put: (url, body) => api.json(url, 'PUT', body),
    del: (url) => kirim(url, { method: 'DELETE' }),

    form: (url, formData) => kirim(url, { method: 'POST', body: formData }),
  };

  // ------------------------------------------------------------- format
  const rupiah = (angka) => 'Rp' + Number(angka || 0).toLocaleString('id-ID');

  const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const BULAN_PANJANG = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

  function tanggal(iso, panjang) {
    if (!iso) return '';
    const d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return String(iso);
    const nama = panjang ? BULAN_PANJANG : BULAN;
    return `${d.getDate()} ${nama[d.getMonth()]} ${d.getFullYear()}`;
  }

  /** Waktu dari SQLite (UTC) ditampilkan dalam zona WITA. */
  function waktu(sql) {
    if (!sql) return '—';
    const d = new Date(String(sql).replace(' ', 'T') + 'Z');
    if (Number.isNaN(d.getTime())) return String(sql);
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Makassar',
    }).format(d) + ' WITA';
  }

  const aman = (teks) =>
    String(teks == null ? '' : teks).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );

  // -------------------------------------------------------- galat form
  function bersihkanGalat(form) {
    qsa('[data-galat]', form).forEach((bidang) => {
      bidang.removeAttribute('data-galat');
      const pesan = qs('.bidang__galat', bidang);
      if (pesan) pesan.textContent = '';
      const isian = qs('.isian, input', bidang);
      if (isian) isian.removeAttribute('aria-invalid');
    });
  }

  /**
   * Tempelkan pesan galat ke bidang terkait. Yang tidak punya bidang
   * (field "_") dikembalikan supaya pemanggil bisa menampilkannya di atas form.
   */
  function pasangGalat(form, errors) {
    bersihkanGalat(form);
    const umum = [];
    let pertama = null;

    (errors || []).forEach((galat) => {
      const bidang = qs(`[data-bidang="${galat.field}"]`, form);
      if (!bidang) {
        umum.push(galat.message);
        return;
      }
      bidang.setAttribute('data-galat', 'true');
      const pesan = qs('.bidang__galat', bidang);
      if (pesan) pesan.textContent = galat.message;
      const isian = qs('.isian, input', bidang);
      if (isian) isian.setAttribute('aria-invalid', 'true');
      if (!pertama) pertama = isian || bidang;
    });

    if (pertama) {
      pertama.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (pertama.focus) pertama.focus({ preventScroll: true });
    }

    return umum;
  }

  /** Kotak pesan di atas form. Satu kotak, dipakai ulang. */
  function tampilkanPesan(kotak, jenis, isi) {
    if (!kotak) return;
    if (!isi || (Array.isArray(isi) && !isi.length)) {
      kotak.classList.add('sembunyi');
      kotak.innerHTML = '';
      return;
    }

    const daftar = Array.isArray(isi) ? isi : [isi];
    const ikon = {
      galat: '<path d="M12 2 1 21h22L12 2zm1 14h-2v2h2v-2zm0-7h-2v5h2V9z"/>',
      sukses: '<path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/>',
      info: '<path d="M11 7h2v2h-2V7zm0 4h2v6h-2v-6zm1-9a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/>',
    }[jenis] || '';

    kotak.className = `pesan pesan--${jenis}`;
    kotak.innerHTML =
      `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${ikon}</svg>` +
      `<div>${daftar.map((baris) => `<p>${aman(baris)}</p>`).join('')}</div>`;
    kotak.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /** Kunci tombol selama permintaan berjalan supaya tidak terkirim dua kali. */
  function sibuk(tombol, aktif, teksSibuk) {
    if (!tombol) return;
    if (aktif) {
      tombol.dataset.teksAsli = tombol.textContent;
      tombol.textContent = teksSibuk || 'Memproses…';
      tombol.disabled = true;
    } else {
      if (tombol.dataset.teksAsli) tombol.textContent = tombol.dataset.teksAsli;
      tombol.disabled = false;
    }
  }

  /** Salin teks ke papan klip, dengan cadangan untuk peramban lama. */
  async function salin(teks) {
    try {
      await navigator.clipboard.writeText(teks);
      return true;
    } catch (_error) {
      const sementara = document.createElement('textarea');
      sementara.value = teks;
      sementara.setAttribute('readonly', '');
      sementara.style.position = 'fixed';
      sementara.style.opacity = '0';
      document.body.appendChild(sementara);
      sementara.select();
      const berhasil = document.execCommand && document.execCommand('copy');
      document.body.removeChild(sementara);
      return Boolean(berhasil);
    }
  }

  /* ---------------------------------------------------- grup WhatsApp ---
     Panitia mengisi tautannya di menu Pengaturan. Bila kosong, server
     mengirim `null` dan seluruh ajakan ini tidak pernah digambar.
     ---------------------------------------------------------------------- */

  const IKON_WA =
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" width="26" height="26">' +
    '<path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm5.8 14.06c-.24.68-1.42 1.32-1.96 1.37-.5.05-.99.24-3.4-.71-2.86-1.13-4.68-4.05-4.82-4.24-.14-.19-1.15-1.53-1.15-2.92s.73-2.07.99-2.35c.26-.28.57-.35.76-.35l.54.01c.17 0 .41-.07.64.49.24.57.8 1.96.87 2.1.07.14.12.31.02.5-.09.19-.14.31-.28.47l-.42.49c-.14.14-.28.29-.12.57.16.28.71 1.17 1.53 1.9 1.05.94 1.94 1.23 2.22 1.37.28.14.44.12.6-.07.16-.19.69-.81.88-1.09.19-.28.37-.23.63-.14.26.09 1.65.78 1.93.92.28.14.47.21.54.33.07.12.07.68-.17 1.35z"/>' +
    '</svg>';

  /**
   * Kartu ajakan grup. Sengaja bukan penutup layar: di halaman selesai
   * daftar, peserta masih punya urusan transfer yang lebih mendesak.
   */
  function kartuGrup(grup) {
    if (!grup || !grup.url) return '';
    const butir = (grup.manfaat || []).map((baris) => `<li>${aman(baris)}</li>`).join('');
    return `
      <section class="grup">
        <span class="grup__ikon">${IKON_WA}</span>
        <div class="grup__isi">
          <p class="grup__mata">Satu langkah kecil lagi</p>
          <h2 class="grup__judul">Gabung ${aman(grup.label)}</h2>
          <p class="grup__ket">Semua kabar acara dibagikan di sana lebih dulu.</p>
          ${butir ? `<ul class="grup__daftar">${butir}</ul>` : ''}
          <a class="tbl tbl--wa" href="${aman(grup.url)}" target="_blank" rel="noopener noreferrer">
            Buka grup WhatsApp
          </a>
        </div>
      </section>`;
  }

  /**
   * Pop-up grup. Hanya dipanggil bagi peserta yang pembayarannya sudah sah,
   * dan hanya sekali per nomor registrasi — ditandai di localStorage supaya
   * orang yang bolak-balik mengecek statusnya tidak terus-menerus dihadang.
   */
  function popupGrup(grup, kunci) {
    if (!grup || !grup.url) return;

    const tanda = `fr-grup-${kunci}`;
    try {
      if (localStorage.getItem(tanda)) return;
      localStorage.setItem(tanda, '1');
    } catch (_error) {
      // Mode penyamaran memblokir localStorage. Tampilkan sekali saja lalu lanjut.
    }

    const tirai = document.createElement('div');
    tirai.className = 'tirai';
    tirai.innerHTML = `
      <div class="tirai__kotak" role="dialog" aria-modal="true" aria-labelledby="grupJudul">
        <button class="tirai__tutup" type="button" aria-label="Tutup">&times;</button>
        ${kartuGrup(grup).replace('class="grup"', 'class="grup grup--polos"').replace('grup__judul"', 'grup__judul" id="grupJudul"')}
        <button class="tbl tbl--hantu tbl--penuh tirai__nanti" type="button">Nanti saja</button>
      </div>`;

    const tutup = () => {
      tirai.remove();
      document.body.classList.remove('terkunci');
      if (fokusAsal && fokusAsal.focus) fokusAsal.focus();
    };
    const fokusAsal = document.activeElement;

    tirai.addEventListener('click', (event) => {
      if (event.target === tirai) tutup();
    });
    tirai.querySelector('.tirai__tutup').addEventListener('click', tutup);
    tirai.querySelector('.tirai__nanti').addEventListener('click', tutup);
    document.addEventListener('keydown', function esc(event) {
      if (event.key !== 'Escape') return;
      document.removeEventListener('keydown', esc);
      tutup();
    });

    document.body.appendChild(tirai);
    document.body.classList.add('terkunci');
    tirai.querySelector('.tbl--wa').focus();
  }

  global.FR = {
    qs, qsa, api, rupiah, tanggal, waktu, aman,
    bersihkanGalat, pasangGalat, tampilkanPesan, sibuk, salin,
    kartuGrup, popupGrup,
  };
})(window);
