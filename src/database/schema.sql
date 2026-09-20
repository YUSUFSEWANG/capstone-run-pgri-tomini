-- Skema basis data Fun Run PGRI Tomini 2026
-- Dijalankan lewat `npm run db:migrate` (idempoten, aman diulang).

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- peserta
CREATE TABLE IF NOT EXISTS participants (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  reg_number        TEXT    NOT NULL UNIQUE,

  full_name         TEXT    NOT NULL,
  gender            TEXT    NOT NULL CHECK (gender IN ('L', 'P')),
  birth_date        TEXT    NOT NULL,
  phone             TEXT    NOT NULL,
  email             TEXT,
  address           TEXT,
  institution       TEXT,

  package           TEXT    NOT NULL CHECK (package IN ('lengkap', 'hemat')),
  jersey_size       TEXT    CHECK (jersey_size IN ('S', 'M', 'L', 'XL', 'XXL')),
  amount            INTEGER NOT NULL,
  unique_code       INTEGER NOT NULL DEFAULT 0,

  emergency_name    TEXT,
  emergency_phone   TEXT,
  blood_type        TEXT,
  health_note       TEXT,

  payment_status    TEXT    NOT NULL DEFAULT 'pending'
                            CHECK (payment_status IN ('pending', 'review', 'verified', 'rejected')),
  payment_proof     TEXT,
  proof_uploaded_at TEXT,
  verified_at       TEXT,
  verified_by       INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  bib_number        TEXT    UNIQUE,
  admin_note        TEXT,

  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_participants_status  ON participants (payment_status);
CREATE INDEX IF NOT EXISTS idx_participants_phone   ON participants (phone);
CREATE INDEX IF NOT EXISTS idx_participants_package ON participants (package);
CREATE INDEX IF NOT EXISTS idx_participants_created ON participants (created_at);

-- Nomor WhatsApp sengaja TIDAK unik: satu nomor sering dipakai mendaftarkan
-- beberapa anggota keluarga. Halaman "Cek Pendaftaran" menampilkan semuanya.

-- ------------------------------------------------------------------ admin
CREATE TABLE IF NOT EXISTS admins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  name          TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'panitia' CHECK (role IN ('ketua', 'panitia')),
  last_login_at TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------- stok jersey
CREATE TABLE IF NOT EXISTS jersey_stock (
  size  TEXT    PRIMARY KEY CHECK (size IN ('S', 'M', 'L', 'XL', 'XXL')),
  quota INTEGER NOT NULL DEFAULT 0,
  used  INTEGER NOT NULL DEFAULT 0
);

-- -------------------------------------------------------------- setelan
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------- jejak aksi
CREATE TABLE IF NOT EXISTS activity_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id    INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  admin_name  TEXT,
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  detail      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_log_created ON activity_log (created_at DESC);

-- --------------------------------------------------------------- pemicu
CREATE TRIGGER IF NOT EXISTS trg_participants_touch
AFTER UPDATE ON participants
FOR EACH ROW
BEGIN
  UPDATE participants SET updated_at = datetime('now') WHERE id = OLD.id;
END;
