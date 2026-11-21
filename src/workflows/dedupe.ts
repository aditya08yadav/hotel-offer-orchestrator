// Pure logic only (no Node/IO imports) so it is safe inside the Temporal workflow sandbox.
import type { HotelOffer } from '../types';

export const normalizeName = (name: string): string =>
  name.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Dedupes offers by hotel name (case/whitespace-insensitive) keeping the cheapest.
 * Tie on price -> higher commissionPct wins; still deterministic.
 * Result is sorted by price ascending, then name.
 */
export function dedupeBestOffers(offers: HotelOffer[]): HotelOffer[] {
  const best = new Map<string, HotelOffer>();
  for (const offer of offers) {
    const key = normalizeName(offer.name);
    const current = best.get(key);
    if (
      !current ||
      offer.price < current.price ||
      (offer.price === current.price && offer.commissionPct > current.commissionPct)
    ) {
      best.set(key, offer);
    }
  }
  return [...best.values()].sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));
}
