const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return v !== undefined && v !== '' && Number.isFinite(n) ? n : d;
};

export const config = {
  port: num(process.env.PORT, 3000),
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  temporalAddress: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233',
  temporalNamespace: process.env.TEMPORAL_NAMESPACE ?? 'default',
  taskQueue: process.env.TASK_QUEUE ?? 'hotel-offers',
  supplierBaseUrl: (process.env.SUPPLIER_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
  supplierTimeoutMs: num(process.env.SUPPLIER_TIMEOUT_MS, 3000),
  cacheTtlSeconds: num(process.env.CACHE_TTL_SECONDS, 300),
  supplierADown: process.env.SUPPLIER_A_DOWN === 'true',
  supplierBDown: process.env.SUPPLIER_B_DOWN === 'true',
};
