import Redis from 'ioredis';
import { config } from './config';
import type { HotelOffer } from './types';
import { normalizeName } from './workflows/dedupe';

let client: Redis | undefined;

export function getRedis(): Redis {
  if (!client) {
    client = new Redis(config.redisUrl, { maxRetriesPerRequest: 3 });
  }
  return client;
}

/**
 * Redis layout (per city):
 *   hotels:<city>:prices  ZSET  member = normalized hotel name, score = price
 *   hotels:<city>:data    HASH  field  = normalized hotel name, value = JSON offer
 *
 * The ZSET lets Redis itself do the price-range filtering (ZRANGEBYSCORE).
 */
const priceKey = (city: string) => `hotels:${city.toLowerCase()}:prices`;
const dataKey = (city: string) => `hotels:${city.toLowerCase()}:data`;

export async function saveOffers(city: string, offers: HotelOffer[]): Promise<void> {
  const redis = getRedis();
  const pk = priceKey(city);
  const dk = dataKey(city);

  const tx = redis.multi().del(pk, dk); // replace previous snapshot atomically
  for (const offer of offers) {
    const field = normalizeName(offer.name);
    tx.zadd(pk, offer.price, field);
    tx.hset(dk, field, JSON.stringify(offer));
  }
  if (offers.length > 0) {
    tx.expire(pk, config.cacheTtlSeconds);
    tx.expire(dk, config.cacheTtlSeconds);
  }
  const results = await tx.exec();
  const failed = results?.find(([err]) => err);
  if (failed) throw failed[0];
}

// Single round trip: range query on the sorted set + fetch the matching JSON docs.
const FILTER_LUA = `
local names = redis.call('ZRANGEBYSCORE', KEYS[1], ARGV[1], ARGV[2])
if #names == 0 then return {} end
return redis.call('HMGET', KEYS[2], unpack(names))
`;

export async function queryOffersByPrice(
  city: string,
  minPrice?: number,
  maxPrice?: number,
): Promise<HotelOffer[]> {
  const min = minPrice === undefined ? '-inf' : String(minPrice);
  const max = maxPrice === undefined ? '+inf' : String(maxPrice);
  const raw = (await getRedis().eval(
    FILTER_LUA,
    2,
    priceKey(city),
    dataKey(city),
    min,
    max,
  )) as Array<string | null>;

  return raw.filter((r): r is string => r !== null).map((r) => JSON.parse(r) as HotelOffer);
}

export async function pingRedis(): Promise<void> {
  const pong = await getRedis().ping();
  if (pong !== 'PONG') throw new Error(`Unexpected PING reply: ${pong}`);
}
