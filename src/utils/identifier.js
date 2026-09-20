'use strict';

const { REG_PREFIX } = require('../config/constants');

/** id 1 -> "FRPT-2026-0001" */
function buildRegNumber(id) {
  return `${REG_PREFIX}-${String(id).padStart(4, '0')}`;
}

/** Terima input bebas ("frpt 2026 0001", "0001") jadi bentuk baku, atau null. */
function parseRegNumber(input) {
  if (!input) return null;
  const cleaned = String(input).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const match = cleaned.match(/^(?:FRPT2026)?(\d{1,6})$/);
  if (!match) return null;
  return buildRegNumber(Number(match[1]));
}

/** Nomor BIB dimulai dari 1001 supaya enak dicetak dan dibaca dari jauh. */
const BIB_START = 1000;

function buildBibNumber(sequence) {
  return String(sequence);
}

module.exports = { buildRegNumber, parseRegNumber, buildBibNumber, BIB_START };
