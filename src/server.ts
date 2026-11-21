import { randomUUID } from 'node:crypto';
import express, { NextFunction, Request, Response } from 'express';
import { Client, Connection, WorkflowFailedError } from '@temporalio/client';
import { ApplicationFailure } from '@temporalio/common';
import { config } from './config';
import { logger } from './logger';
import { pingRedis } from './redis';
import { retry } from './retry';
import { supplierRouter } from './suppliers/router';
import type { WorkflowInput, WorkflowResult } from './types';
import type { hotelOfferWorkflow } from './workflows';

class BadRequestError extends Error {}

function parsePrice(raw: unknown, name: string): number | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'string' || raw.trim() === '' || !Number.isFinite(Number(raw)) || Number(raw) < 0) {
    throw new BadRequestError(`${name} must be a non-negative number`);
  }
  return Number(raw);
}

async function main() {
  const connection = await retry(() => Connection.connect({ address: config.temporalAddress }), {
    attempts: 30,
    delayMs: 2000,
    label: 'temporal-connect',
  });
  const temporal = new Client({ connection, namespace: config.temporalNamespace });

  const app = express();

  // request logging
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () =>
      logger.info('http', { method: req.method, path: req.originalUrl, status: res.statusCode, ms: Date.now() - start }),
    );
    next();
  });

  // Mock supplier endpoints (/supplierA/hotels, /supplierB/hotels)
  app.use(supplierRouter);

  // ---- Main endpoint ----
  app.get('/api/hotels', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const city = typeof req.query.city === 'string' ? req.query.city.trim().toLowerCase() : '';
      if (!city) throw new BadRequestError('city query parameter is required');

      const minPrice = parsePrice(req.query.minPrice, 'minPrice');
      const maxPrice = parsePrice(req.query.maxPrice, 'maxPrice');
      if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
        throw new BadRequestError('minPrice cannot be greater than maxPrice');
      }

      const input: WorkflowInput = { city, minPrice, maxPrice };
      const workflowId = `hotel-offers-${city}-${randomUUID()}`;
      logger.info('Starting workflow', { workflowId, ...input });

      const result: WorkflowResult = await temporal.workflow.execute<typeof hotelOfferWorkflow>(
        'hotelOfferWorkflow',
        {
          taskQueue: config.taskQueue,
          workflowId,
          args: [input],
          workflowExecutionTimeout: '30 seconds',
        },
      );

      if (result.degradedSuppliers.length > 0) {
        res.setHeader('X-Degraded-Suppliers', result.degradedSuppliers.join(', '));
      }
      res.json(result.hotels);
    } catch (err) {
      next(err);
    }
  });

  // ---- Health (bonus): reports on Redis, Temporal and both suppliers ----
  app.get('/health', async (_req, res) => {
    const probe = async (fn: () => Promise<unknown>) => {
      const t = Date.now();
      try {
        await fn();
        return { status: 'up', latencyMs: Date.now() - t };
      } catch (err) {
        return { status: 'down', latencyMs: Date.now() - t, error: String((err as Error).message ?? err) };
      }
    };
    const supplierProbe = (id: 'A' | 'B') =>
      probe(async () => {
        const r = await fetch(`${config.supplierBaseUrl}/supplier${id}/hotels`, {
          signal: AbortSignal.timeout(2000),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
      });

    const [redis, temporalHealth, supplierA, supplierB] = await Promise.all([
      probe(pingRedis),
      probe(() => connection.workflowService.getSystemInfo({})),
      supplierProbe('A'),
      supplierProbe('B'),
    ]);

    const checks = { redis, temporal: temporalHealth, supplierA, supplierB };
    const allUp = Object.values(checks).every((c) => c.status === 'up');
    const suppliersUp = supplierA.status === 'up' && supplierB.status === 'up';
    const infraUp = redis.status === 'up' && temporalHealth.status === 'up';
    // ok = everything up; degraded = infra ok but a supplier is down (still serving); down = infra broken
    const status = allUp ? 'ok' : infraUp && (supplierA.status === 'up' || supplierB.status === 'up') ? 'degraded' : 'down';
    res.status(status === 'down' ? 503 : 200).json({ status, suppliersUp, checks });
  });

  // ---- Error handling ----
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof BadRequestError) {
      return res.status(400).json({ error: err.message });
    }
    if (err instanceof WorkflowFailedError && err.cause instanceof ApplicationFailure) {
      if (err.cause.type === 'AllSuppliersUnavailable') {
        logger.error('All suppliers unavailable');
        return res.status(502).json({ error: 'All hotel suppliers are currently unavailable' });
      }
    }
    logger.error('Unhandled error', { error: String((err as Error)?.message ?? err) });
    res.status(500).json({ error: 'Internal server error' });
  });

  const server = app.listen(config.port, () => logger.info('API listening', { port: config.port }));

  const shutdown = () => {
    logger.info('Shutting down');
    server.close(() => process.exit(0));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  logger.error('API failed to start', { error: String(err) });
  process.exit(1);
});
