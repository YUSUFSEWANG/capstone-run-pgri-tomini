'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const env = require('../config/env');

fs.mkdirSync(path.dirname(env.paths.database), { recursive: true });

const db = new Database(env.paths.database);

// WAL menjaga tulis-baca tetap lancar saat panitia membuka dashboard
// bersamaan dengan peserta yang sedang mendaftar.
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

module.exports = db;
