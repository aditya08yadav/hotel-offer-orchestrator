import { logger } from './logger';

export async function retry<T>(
  fn: () => Promise<T>,
  opts: { attempts: number; delayMs: number; label: string },
): Promise<T> {
  let lastErr: unknown;
  for (let i = 1; i <= opts.attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      logger.warn(`${opts.label} failed, retrying`, { attempt: i, of: opts.attempts, error: String(err) });
      await new Promise((r) => setTimeout(r, opts.delayMs));
    }
  }
  throw lastErr;
}
