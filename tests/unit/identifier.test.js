'use strict';

const { buildRegNumber, parseRegNumber } = require('../../src/utils/identifier');

describe('buildRegNumber', () => {
  test.each([
    [1, 'FRPT-2026-0001'],
    [48, 'FRPT-2026-0048'],
    [1234, 'FRPT-2026-1234'],
    [12345, 'FRPT-2026-12345'],
  ])('id %i menjadi %s', (id, harapan) => {
    expect(buildRegNumber(id)).toBe(harapan);
  });
});

describe('parseRegNumber', () => {
  test.each([
    ['FRPT-2026-0001', 'FRPT-2026-0001'],
    ['frpt-2026-0001', 'FRPT-2026-0001'],
    ['frpt 2026 0001', 'FRPT-2026-0001'],
    ['FRPT20260001', 'FRPT-2026-0001'],
    ['0001', 'FRPT-2026-0001'],
    ['1', 'FRPT-2026-0001'],
  ])('menerima penulisan %p', (masukan, harapan) => {
    expect(parseRegNumber(masukan)).toBe(harapan);
  });

  test.each([[''], [null], ['bukan-nomor'], ['FRPT-2025-0001']])('menolak %p', (masukan) => {
    expect(parseRegNumber(masukan)).toBeNull();
  });
});
