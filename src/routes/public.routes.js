'use strict';

const express = require('express');
const path = require('path');
const env = require('../config/env');
const constants = require('../config/constants');
const settingsService = require('../services/settings.service');
const registrationService = require('../services/registration.service');
const { readLimiter } = require('../middleware/rateLimit');

const router = express.Router();
const page = (name) => (_req, res) => res.sendFile(path.join(env.paths.public, name));

// ------------------------------------------------------------------ laman
router.get('/', page('index.html'));
router.get('/pendaftaran', page('pendaftaran.html'));
router.get('/cek', page('cek.html'));
router.get('/kartu', page('kartu.html'));
router.get('/kartu/:reg', page('kartu.html'));

// ------------------------------------------------------- data untuk laman
/**
 * Satu endpoint yang memberi halaman publik semua yang dibutuhkannya:
 * fakta acara, harga berjalan, sisa kuota, dan ketersediaan jersey.
 */
router.get('/api/info', readLimiter, (_req, res) => {
  const state = settingsService.registrationState();
  const { settings } = state;

  const packages = Object.values(constants.PACKAGES).map((pkg) => ({
    code: pkg.code,
    label: pkg.label,
    price: pkg.code === 'lengkap' ? settings.price_lengkap : settings.price_hemat,
    withJersey: pkg.withJersey,
    perks: pkg.perks,
  }));

  res.json({
    ok: true,
    event: constants.EVENT,
    bank: constants.BANK,
    contacts: constants.CONTACTS,
    packages,
    jerseySizes: constants.JERSEY_SIZES,
    jerseyChart: constants.JERSEY_CHART,
    jersey: registrationService.jerseyAvailability(),
    bloodTypes: constants.BLOOD_TYPES,
    upload: {
      maxBytes: constants.UPLOAD.maxBytes,
      maxLabel: `${constants.UPLOAD.maxBytes / 1024 / 1024} MB`,
      accept: constants.UPLOAD.allowedExt.join(','),
    },
    registration: {
      open: state.open,
      reason: state.reason,
      start: settings.registration_start,
      end: settings.registration_end,
      quota: state.quota,
      taken: state.taken,
      remaining: state.remaining,
      uniqueCode: settings.unique_code_enabled,
    },
    announcement: settings.announcement || null,
  });
});

module.exports = router;
