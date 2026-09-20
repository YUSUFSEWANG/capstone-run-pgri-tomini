'use strict';

const fs = require('fs');
const path = require('path');
const env = require('../config/env');

const fresh = process.argv.includes('--fresh');

if (fresh) {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    const file = env.paths.database + suffix;
    if (fs.existsSync(file)) fs.rmSync(file);
  }
  console.log('Basis data lama dihapus.');
}

const db = require('./db');
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

db.exec(schema);

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  .all()
  .map((row) => row.name);

console.log(`Skema siap di ${env.paths.database}`);
console.log(`Tabel: ${tables.join(', ')}`);
