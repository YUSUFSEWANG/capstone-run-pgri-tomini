/* ==========================================================================
   Halaman utama — rel kilometer, hitung mundur, dan data langsung dari server.
   ========================================================================== */
(function () {
  'use strict';

  const { qs, qsa, api, rupiah, tanggal, salin } = window.FR;

  const JARAK_KM = 7;
  // Jam start resmi: 06.00 WITA (UTC+8).
  const GARIS_START = new Date('2026-11-24T06:00:00+08:00');

  // ------------------------------------------------------------ navigasi
  const togel = qs('#navTogel');
  const tautan = qs('#navTautan');

  if (togel && tautan) {
    togel.addEventListener('click', () => {
      const terbuka = tautan.dataset.buka === 'true';
      tautan.dataset.buka = String(!terbuka);
      togel.setAttribute('aria-expanded', String(!terbuka));
      qs('.hanya-baca-layar', togel).textContent = terbuka ? 'Buka menu' : 'Tutup menu';
    });

    tautan.addEventListener('click', (event) => {
      if (event.target.closest('a')) {
        tautan.dataset.buka = 'false';
        togel.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // -------------------------------------------------------- hitung mundur
  const mundur = {
    hari: qs('#mundurHari'),
    jam: qs('#mundurJam'),
    menit: qs('#mundurMenit'),
    detik: qs('#mundurDetik'),
  };

  function perbaruiMundur() {
    if (!mundur.hari) return;
    const sisa = GARIS_START - Date.now();

    if (sisa <= 0) {
      const wadah = qs('#mundur');
      if (wadah) {
        wadah.innerHTML =
          '<p class="mundur__judul">Hari ini</p>' +
          '<p style="grid-column:1/-1;text-align:center;font-family:var(--teriak);' +
          'font-size:2rem;font-weight:900;color:var(--mentari);margin:0;text-transform:uppercase">' +
          'Selamat berlari!</p>';
      }
      return;
    }

    const detikTotal = Math.floor(sisa / 1000);
    const pad = (n) => String(n).padStart(2, '0');

    mundur.hari.textContent = pad(Math.floor(detikTotal / 86400));
    mundur.jam.textContent = pad(Math.floor(detikTotal / 3600) % 24);
    mundur.menit.textContent = pad(Math.floor(detikTotal / 60) % 60);
    mundur.detik.textContent = pad(detikTotal % 60);
  }

  perbaruiMundur();
  setInterval(perbaruiMundur, 1000);

  // --------------------------------------------------- rel kilometer
  /**
   * Menggulir halaman diperlakukan sebagai menempuh rute. Setiap seksi
   * bertanda data-km menjadi penanda kilometer di rel kiri; di layar kecil
   * rel diganti pita kemajuan di bawah navigasi.
   */
  const rel = qs('#rel');
  const relIsi = qs('#relIsi');
  const relPelari = qs('#relPelari');
  const relAngka = qs('#relAngka');
  const progresPita = qs('#progresPita');
  const progresKm = qs('#progresKm');

  const seksiKm = qsa('[data-km]').filter((el) => /^\d+$/.test(el.dataset.km));
  let tikRel = [];

  function bangunTik() {
    if (!rel || tikRel.length) return;
    const jalur = qs('.rel__jalur', rel);
    if (!jalur) return;

    seksiKm.forEach((seksi) => {
      const tik = document.createElement('span');
      tik.className = 'rel__tik';
      tik.textContent = seksi.dataset.km;
      rel.appendChild(tik);
      tikRel.push({ tik, seksi });
    });

    letakkanTik();
  }

  function letakkanTik() {
    if (!tikRel.length || !rel) return;
    const jalur = qs('.rel__jalur', rel);
    const kotakRel = rel.getBoundingClientRect();
    const kotakJalur = jalur.getBoundingClientRect();
    const atas = kotakJalur.top - kotakRel.top;
    const tinggi = kotakJalur.height;
    const total = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);

    tikRel.forEach(({ tik, seksi }) => {
      const bagian = Math.min(Math.max(seksi.offsetTop / total, 0), 1);
      tik.style.top = `${atas + bagian * tinggi}px`;
    });
  }

  let tugasGulir = null;

  function perbaruiKemajuan() {
    const total = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
    const bagian = Math.min(Math.max(window.scrollY / total, 0), 1);
    const km = (bagian * JARAK_KM).toFixed(1);

    if (progresPita) progresPita.style.width = `${bagian * 100}%`;
    if (progresKm) progresKm.textContent = `${km} KM`;
    if (relAngka) relAngka.textContent = km;

    if (rel && relIsi && relPelari) {
      const jalur = qs('.rel__jalur', rel);
      const kotakRel = rel.getBoundingClientRect();
      const kotakJalur = jalur.getBoundingClientRect();
      const atas = kotakJalur.top - kotakRel.top;
      const tinggi = kotakJalur.height;

      relIsi.style.top = `${atas}px`;
      relIsi.style.height = `${bagian * tinggi}px`;
      relPelari.style.top = `${atas + bagian * tinggi}px`;
    }

    // Tandai kilometer yang sedang dilewati.
    const tengah = window.scrollY + window.innerHeight / 2;
    let aktif = null;
    seksiKm.forEach((seksi) => {
      if (seksi.offsetTop <= tengah) aktif = seksi;
    });
    tikRel.forEach(({ tik, seksi }) => {
      tik.setAttribute('aria-current', String(seksi === aktif));
    });

    tugasGulir = null;
  }

  function jadwalkan() {
    if (tugasGulir === null) tugasGulir = requestAnimationFrame(perbaruiKemajuan);
  }

  window.addEventListener('scroll', jadwalkan, { passive: true });
  window.addEventListener('resize', () => {
    letakkanTik();
    jadwalkan();
  });

  bangunTik();
  perbaruiKemajuan();

  // ---------------------------------------------------- muncul saat digulir
  const naik = qsa('.naik');
  if ('IntersectionObserver' in window && naik.length) {
    const pengamat = new IntersectionObserver(
      (entri) => {
        entri.forEach((satu) => {
          if (!satu.isIntersecting) return;
          satu.target.dataset.tampil = 'true';
          pengamat.unobserve(satu.target);
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
    );
    naik.forEach((el) => pengamat.observe(el));
  } else {
    naik.forEach((el) => { el.dataset.tampil = 'true'; });
  }

  // ------------------------------------------------- salin nomor rekening
  const tombolSalin = qs('#salinRekening');
  if (tombolSalin) {
    tombolSalin.addEventListener('click', async () => {
      const berhasil = await salin(tombolSalin.dataset.salin);
      if (!berhasil) return;
      tombolSalin.dataset.tersalin = 'true';
      setTimeout(() => { delete tombolSalin.dataset.tersalin; }, 1600);
    });
  }

  // ------------------------------------------------- data hidup dari server
  async function muatInfo() {
    const info = await api.get('/api/info');
    if (!info.ok) return;

    // Harga mengikuti setelan panitia, bukan angka yang dipatri di HTML.
    info.packages.forEach((paket) => {
      const el = qs(`[data-harga="${paket.code}"]`);
      if (el) el.textContent = rupiah(paket.price);
    });

    // Ketersediaan jersey per ukuran.
    const wadahUkuran = qs('#ukuranTersedia');
    if (wadahUkuran) {
      const adaStok = info.jersey.some((u) => u.available);
      wadahUkuran.innerHTML = adaStok
        ? info.jersey
            .map(
              (u) =>
                `<span class="ukuran__cip" data-habis="${!u.available}">` +
                `${u.size}${u.available ? ` <small style="opacity:.55">${u.remaining}</small>` : ''}` +
                `</span>`
            )
            .join('')
        : '<span class="ukuran__cip" data-habis="true">Semua ukuran habis</span>';
    }

    // Masa pendaftaran.
    const faktaPendaftaran = qs('#faktaPendaftaran');
    if (faktaPendaftaran && info.registration.start && info.registration.end) {
      faktaPendaftaran.innerHTML =
        `${tanggal(info.registration.start)}<br>s.d. ${tanggal(info.registration.end)}`;
    }

    const faktaKuota = qs('#faktaKuota');
    if (faktaKuota) {
      if (!info.registration.open) {
        faktaKuota.textContent = info.registration.reason;
      } else if (info.registration.remaining !== null) {
        faktaKuota.textContent = `Sisa ${info.registration.remaining} tempat dari ${info.registration.quota} kuota.`;
      }
    }

    // Tombol daftar mengikuti keadaan sebenarnya.
    if (!info.registration.open) {
      qsa('[data-tombol-daftar]').forEach((tombol) => {
        tombol.setAttribute('aria-disabled', 'true');
        tombol.setAttribute('href', '#pembayaran');
        tombol.textContent = 'Pendaftaran ditutup';
      });
    }

    // Pengumuman panitia, kalau ada.
    if (info.announcement) {
      const kotak = qs('#pengumuman');
      const teks = qs('#pengumumanTeks');
      if (kotak && teks) {
        teks.textContent = info.announcement;
        kotak.classList.remove('sembunyi');
      }
    }
  }

  muatInfo();
})();
