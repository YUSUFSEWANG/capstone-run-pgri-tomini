'use strict';

/** Halaman dashboard: belum masuk -> lempar ke layar masuk. */
function requireAdminPage(req, res, next) {
  if (req.session && req.session.admin) return next();
  const target = encodeURIComponent(req.originalUrl);
  return res.redirect(`/admin/login?next=${target}`);
}

/** Endpoint JSON: belum masuk -> 401 supaya frontend bisa menanganinya. */
function requireAdminApi(req, res, next) {
  if (req.session && req.session.admin) return next();
  return res.status(401).json({
    ok: false,
    errors: [{ field: '_', message: 'Sesi berakhir. Masuk lagi untuk melanjutkan.' }],
  });
}

/** Beberapa aksi hanya untuk ketua panitia (mis. menghapus pendaftaran). */
function requireRole(...roles) {
  return (req, res, next) => {
    if (req.session?.admin && roles.includes(req.session.admin.role)) return next();
    return res.status(403).json({
      ok: false,
      errors: [{ field: '_', message: 'Akun kamu tidak punya akses untuk tindakan ini.' }],
    });
  };
}

module.exports = { requireAdminPage, requireAdminApi, requireRole };
