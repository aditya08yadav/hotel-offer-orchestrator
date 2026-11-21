import { Context } from '@temporalio/activity';
import { ApplicationFailure } from '@temporalio/common';
import { config } from '../config';
import { queryOffersByPrice, saveOffers } from '../redis';
import type { HotelOffer, SupplierHotel, SupplierId } from '../types';

function isSupplierHotel(x: any): x is SupplierHotel {
  return (
    x &&
    typeof x.name === 'string' &&
    typeof x.price === 'number' &&
    Number.isFinite(x.price) &&
    typeof x.commissionPct === 'number'
  );
}

export async function fetchSupplierHotels(supplier: SupplierId, city: string): Promise<HotelOffer[]> {
  const ctx = Context.current();
  const log = ctx.log;
  const label = `Supplier ${supplier}`;
  const url = `${config.supplierBaseUrl}/supplier${supplier}/hotels?city=${encodeURIComponent(city)}`;
  const started = Date.now();

  log.info('Calling supplier', { supplier: label, url, attempt: ctx.info.attempt });

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(config.supplierTimeoutMs) });
  } catch (err) {
    log.warn('Supplier request failed (network/timeout)', { supplier: label, error: String(err) });
    throw err; // retryable
  }

  if (!res.ok) {
    const msg = `${label} responded with HTTP ${res.status}`;
    log.warn(msg, { supplier: label });
    // 4xx = our request is wrong, retrying won't help. 5xx = retry.
    if (res.status >= 400 && res.status < 500) {
      throw ApplicationFailure.nonRetryable(msg, 'SupplierClientError');
    }
    throw new Error(msg);
  }

  const body: unknown = await res.json();
  if (!Array.isArray(body)) {
    throw ApplicationFailure.nonRetryable(`${label} returned a non-array payload`, 'SupplierBadPayload');
  }

  const offers = body
    .filter(isSupplierHotel)
    .filter((h) => !h.city || h.city.toLowerCase() === city.toLowerCase())
    .map<HotelOffer>((h) => ({
      name: h.name,
      price: h.price,
      supplier: label,
      commissionPct: h.commissionPct,
    }));

  log.info('Supplier responded', {
    supplier: label,
    received: body.length,
    valid: offers.length,
    ms: Date.now() - started,
  });
  return offers;
}

export async function saveHotelsToRedis(city: string, offers: HotelOffer[]): Promise<void> {
  const log = Context.current().log;
  try {
    await saveOffers(city, offers);
    log.info('Saved deduplicated hotels to Redis', { city, count: offers.length });
  } catch (err) {
    log.error('Failed to save hotels to Redis', { city, error: String(err) });
    throw err;
  }
}

export async function queryHotelsFromRedis(
  city: string,
  minPrice?: number,
  maxPrice?: number,
): Promise<HotelOffer[]> {
  const log = Context.current().log;
  try {
    const hotels = await queryOffersByPrice(city, minPrice, maxPrice);
    log.info('Queried hotels from Redis', { city, minPrice, maxPrice, count: hotels.length });
    return hotels;
  } catch (err) {
    log.error('Failed to query hotels from Redis', { city, error: String(err) });
    throw err;
  }
}
