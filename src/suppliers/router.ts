import { Router } from 'express';
import { config } from '../config';
import { logger } from '../logger';
import { SUPPLIER_A, SUPPLIER_B } from './mockData';
import type { SupplierId } from '../types';

// In-memory "down" switches so failure handling can be demoed (e.g. from Postman).
export const supplierDown: Record<SupplierId, boolean> = {
  A: config.supplierADown,
  B: config.supplierBDown,
};

const DATA = { A: SUPPLIER_A, B: SUPPLIER_B };

export const supplierRouter = Router();

for (const id of ['A', 'B'] as SupplierId[]) {
  supplierRouter.get(`/supplier${id}/hotels`, (req, res) => {
    if (supplierDown[id]) {
      logger.warn('Mock supplier simulating outage', { supplier: id });
      return res.status(503).json({ error: `Supplier ${id} is unavailable` });
    }
    const city = typeof req.query.city === 'string' ? req.query.city.toLowerCase() : undefined;
    res.json(city ? DATA[id].filter((h) => h.city === city) : DATA[id]);
  });
}

// Demo helper: POST /admin/suppliers/A/down  |  POST /admin/suppliers/A/up
supplierRouter.post('/admin/suppliers/:id/:state', (req, res) => {
  const id = req.params.id.toUpperCase() as SupplierId;
  const { state } = req.params;
  if (!(id in supplierDown) || !['up', 'down'].includes(state)) {
    return res.status(400).json({ error: 'Use /admin/suppliers/<A|B>/<up|down>' });
  }
  supplierDown[id] = state === 'down';
  logger.info('Mock supplier state changed', { supplier: id, down: supplierDown[id] });
  res.json({ supplier: `Supplier ${id}`, down: supplierDown[id] });
});
