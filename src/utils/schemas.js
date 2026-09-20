'use strict';

const { z } = require('zod');
const {
  PACKAGES,
  JERSEY_SIZES,
  GENDERS,
  BLOOD_TYPES,
  EVENT,
} = require('../config/constants');
const { normalizePhone, titleCase, ageOn } = require('./format');

const MIN_AGE = 10;
const MAX_AGE = 90;

const trimmed = (max) =>
  z.string().trim().max(max, `Maksimal ${max} karakter.`);

const optionalText = (max) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v == null ? '' : String(v).trim()))
    .refine((v) => v.length <= max, `Maksimal ${max} karakter.`)
    .transform((v) => v || null);

const phoneField = z
  .string({ required_error: 'Nomor WhatsApp wajib diisi.' })
  .transform((v) => normalizePhone(v))
  .refine((v) => v !== null, 'Nomor WhatsApp tidak valid. Contoh: 0812 3456 7890.');

const registrationSchema = z
  .object({
    full_name: trimmed(80)
      .min(3, 'Nama lengkap minimal 3 karakter.')
      .transform(titleCase),

    gender: z.enum(GENDERS, {
      errorMap: () => ({ message: 'Pilih jenis kelamin.' }),
    }),

    birth_date: z
      .string({ required_error: 'Tanggal lahir wajib diisi.' })
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal lahir tidak valid.')
      .refine((v) => !Number.isNaN(new Date(v + 'T00:00:00').getTime()), 'Tanggal lahir tidak valid.')
      .refine((v) => {
        const age = ageOn(v, EVENT.raceDate);
        return age !== null && age >= MIN_AGE && age <= MAX_AGE;
      }, `Usia peserta pada hari acara harus antara ${MIN_AGE} dan ${MAX_AGE} tahun.`),

    phone: phoneField,

    email: z
      .union([z.string(), z.null(), z.undefined()])
      .transform((v) => (v == null ? '' : String(v).trim().toLowerCase()))
      .refine((v) => v === '' || z.string().email().safeParse(v).success, 'Format email tidak valid.')
      .transform((v) => v || null),

    address: optionalText(200),
    institution: optionalText(120),

    package: z.enum(Object.keys(PACKAGES), {
      errorMap: () => ({ message: 'Pilih salah satu paket.' }),
    }),

    jersey_size: z
      .union([z.enum(JERSEY_SIZES), z.literal(''), z.null(), z.undefined()])
      .transform((v) => (v ? v : null)),

    emergency_name: trimmed(80)
      .min(3, 'Nama kontak darurat minimal 3 karakter.')
      .transform(titleCase),

    emergency_phone: phoneField,

    blood_type: z
      .union([z.enum(BLOOD_TYPES), z.literal(''), z.null(), z.undefined()])
      .transform((v) => (v ? v : null)),

    health_note: optionalText(300),

    agreement: z
      .union([z.boolean(), z.string()])
      .transform((v) => v === true || v === 'true' || v === 'on' || v === '1')
      .refine((v) => v === true, 'Kamu harus menyetujui pernyataan kesehatan dan ketentuan acara.'),
  })
  .superRefine((data, ctx) => {
    if (PACKAGES[data.package]?.withJersey && !data.jersey_size) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['jersey_size'],
        message: 'Paket Lengkap dapat jersey. Pilih ukurannya dulu.',
      });
    }
  });

const checkSchema = z.object({
  q: z
    .string({ required_error: 'Isi nomor registrasi atau nomor WhatsApp.' })
    .trim()
    .min(3, 'Isi nomor registrasi atau nomor WhatsApp.')
    .max(40, 'Terlalu panjang.'),
});

const loginSchema = z.object({
  username: z.string().trim().min(3, 'Username minimal 3 karakter.').max(40),
  password: z.string().min(6, 'Password minimal 6 karakter.').max(200),
});

const ADMIN_ROLES = ['ketua', 'panitia'];

const adminAccountSchema = z.object({
  username: z
    .string({ required_error: 'Username wajib diisi.' })
    .trim()
    .transform((v) => v.toLowerCase())
    .superRefine((v, ctx) => {
      const salah = (message) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
      if (v.length < 3 || v.length > 24) return salah('Username harus 3 sampai 24 karakter.');
      if (!/^[a-z0-9._-]+$/.test(v)) {
        return salah('Username hanya boleh huruf, angka, titik, garis bawah, dan strip. Tanpa spasi.');
      }
      return undefined;
    }),

  name: trimmed(60).min(3, 'Nama panitia minimal 3 karakter.').transform(titleCase),

  role: z.enum(ADMIN_ROLES, {
    errorMap: () => ({ message: 'Peran harus ketua atau panitia.' }),
  }),
});

const verifySchema = z.object({
  note: optionalText(300),
});

const rejectSchema = z.object({
  note: trimmed(300).min(5, 'Tulis alasan penolakan supaya peserta tahu harus memperbaiki apa.'),
});

/** Ubah ZodError jadi bentuk { field, message } yang dipakai frontend. */
function toFieldErrors(error) {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || '_',
    message: issue.message,
  }));
}

module.exports = {
  registrationSchema,
  checkSchema,
  loginSchema,
  adminAccountSchema,
  verifySchema,
  rejectSchema,
  toFieldErrors,
  ADMIN_ROLES,
  MIN_AGE,
  MAX_AGE,
};
