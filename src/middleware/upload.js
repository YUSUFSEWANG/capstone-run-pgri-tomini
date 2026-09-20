'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const env = require('../config/env');
const { UPLOAD } = require('../config/constants');

fs.mkdirSync(env.paths.uploads, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, env.paths.uploads),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = UPLOAD.allowedExt.includes(ext) ? ext : '.bin';
    // Nama asli dibuang total: mencegah path traversal dan kebocoran identitas.
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${safeExt}`);
  },
});

const uploadProof = multer({
  storage,
  limits: { fileSize: UPLOAD.maxBytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!UPLOAD.allowedMime.includes(file.mimetype) || !UPLOAD.allowedExt.includes(ext)) {
      const error = new Error('Format berkas harus JPG, PNG, atau PDF.');
      error.status = 400;
      error.field = 'proof';
      return cb(error);
    }
    return cb(null, true);
  },
}).single('proof');

/** Tanda tangan byte awal berkas — header MIME dari browser tidak bisa dipercaya. */
const SIGNATURES = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] },
];

function detectType(filePath) {
  const handle = fs.openSync(filePath, 'r');
  const head = Buffer.alloc(8);
  try {
    fs.readSync(handle, head, 0, 8, 0);
  } finally {
    fs.closeSync(handle);
  }
  return SIGNATURES.find((sig) => head.subarray(0, sig.bytes.length).equals(Buffer.from(sig.bytes)));
}

/** Buang berkas yang isinya tidak cocok dengan ekstensinya. */
function verifyFileContent(req, res, next) {
  if (!req.file) {
    return res.status(400).json({
      ok: false,
      errors: [{ field: 'proof', message: 'Pilih berkas bukti pembayaran dulu.' }],
    });
  }

  const match = detectType(req.file.path);
  if (!match || match.mime !== req.file.mimetype) {
    fs.rm(req.file.path, { force: true }, () => {});
    return res.status(400).json({
      ok: false,
      errors: [{ field: 'proof', message: 'Berkas rusak atau bukan gambar/PDF yang sah. Coba unggah ulang.' }],
    });
  }

  return next();
}

/** Terjemahkan galat multer jadi pesan yang bisa dibaca peserta. */
function handleUploadErrors(handler) {
  return (req, res, next) =>
    handler(req, res, (error) => {
      if (!error) return next();

      if (error instanceof multer.MulterError) {
        const message =
          error.code === 'LIMIT_FILE_SIZE'
            ? `Ukuran berkas melebihi ${UPLOAD.maxBytes / 1024 / 1024} MB. Perkecil dulu fotonya.`
            : 'Berkas tidak bisa diproses. Coba unggah satu berkas saja.';
        return res.status(400).json({ ok: false, errors: [{ field: 'proof', message }] });
      }

      return res.status(error.status || 400).json({
        ok: false,
        errors: [{ field: error.field || 'proof', message: error.message }],
      });
    });
}

module.exports = {
  uploadProof: handleUploadErrors(uploadProof),
  verifyFileContent,
  detectType,
};
