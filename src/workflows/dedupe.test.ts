import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dedupeBestOffers } from './dedupe';
import type { HotelOffer } from '../types';

const o = (name: string, price: number, supplier: string, commissionPct = 10): HotelOffer => ({
  name, price, supplier, commissionPct,
});

test('picks cheaper offer when hotel is in both suppliers', () => {
  const out = dedupeBestOffers([o('Holtin', 6000, 'Supplier A'), o('Holtin', 5340, 'Supplier B', 20)]);
  assert.deepEqual(out, [o('Holtin', 5340, 'Supplier B', 20)]);
});

test('keeps hotels that only one supplier returns', () => {
  const out = dedupeBestOffers([o('Lemon Tree', 5100, 'Supplier A'), o('Oberoi', 16000, 'Supplier B')]);
  assert.equal(out.length, 2);
});

test('name matching ignores case and extra whitespace', () => {
  const out = dedupeBestOffers([o('Taj  Palace', 14000, 'Supplier A'), o(' taj palace', 13200, 'Supplier B')]);
  assert.equal(out.length, 1);
  assert.equal(out[0].supplier, 'Supplier B');
});

test('price tie is broken deterministically by higher commission', () => {
  const out = dedupeBestOffers([o('X', 100, 'Supplier A', 10), o('X', 100, 'Supplier B', 15)]);
  assert.equal(out[0].supplier, 'Supplier B');
});

test('empty input gives empty output', () => {
  assert.deepEqual(dedupeBestOffers([]), []);
});
