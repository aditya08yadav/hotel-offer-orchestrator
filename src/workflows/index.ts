import { ApplicationFailure, log, proxyActivities } from '@temporalio/workflow';
import type * as activities from '../activities';
import type { HotelOffer, WorkflowInput, WorkflowResult } from '../types';
import { dedupeBestOffers } from './dedupe';

const acts = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 seconds',
  retry: {
    initialInterval: '500 milliseconds',
    backoffCoefficient: 2,
    maximumInterval: '5 seconds',
    maximumAttempts: 3,
  },
});

export async function hotelOfferWorkflow(input: WorkflowInput): Promise<WorkflowResult> {
  const { city, minPrice, maxPrice } = input;
  log.info('Workflow started', { city, minPrice, maxPrice });

  // 1. Call both suppliers in parallel. allSettled => one supplier failing
  //    (after activity retries) doesn't take the whole request down.
  const [a, b] = await Promise.allSettled([
    acts.fetchSupplierHotels('A', city),
    acts.fetchSupplierHotels('B', city),
  ]);

  const offers: HotelOffer[] = [];
  const degradedSuppliers: string[] = [];

  if (a.status === 'fulfilled') offers.push(...a.value);
  else {
    degradedSuppliers.push('Supplier A');
    log.warn('Supplier A failed after retries', { error: String(a.reason?.cause?.message ?? a.reason) });
  }

  if (b.status === 'fulfilled') offers.push(...b.value);
  else {
    degradedSuppliers.push('Supplier B');
    log.warn('Supplier B failed after retries', { error: String(b.reason?.cause?.message ?? b.reason) });
  }

  if (degradedSuppliers.length === 2) {
    throw ApplicationFailure.nonRetryable('Both suppliers are unavailable', 'AllSuppliersUnavailable');
  }

  // 2. Dedupe by hotel name, keeping the cheapest offer.
  const deduped = dedupeBestOffers(offers);
  log.info('Deduplicated offers', { before: offers.length, after: deduped.length });

  // 3. Persist the deduplicated list in Redis.
  await acts.saveHotelsToRedis(city, deduped);

  // 4. Price filtering happens inside Redis (sorted-set range query).
  const hotels = await acts.queryHotelsFromRedis(city, minPrice, maxPrice);

  return { hotels, degradedSuppliers };
}
