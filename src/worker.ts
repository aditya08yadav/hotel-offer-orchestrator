import { NativeConnection, Worker } from '@temporalio/worker';
import * as activities from './activities';
import { config } from './config';
import { logger } from './logger';
import { retry } from './retry';

async function run() {
  const connection = await retry(
    () => NativeConnection.connect({ address: config.temporalAddress }),
    { attempts: 30, delayMs: 2000, label: 'temporal-connect' },
  );

  const worker = await Worker.create({
    connection,
    namespace: config.temporalNamespace,
    taskQueue: config.taskQueue,
    workflowsPath: require.resolve('./workflows'),
    activities,
  });

  logger.info('Temporal worker started', {
    taskQueue: config.taskQueue,
    address: config.temporalAddress,
  });
  await worker.run();
}

run().catch((err) => {
  logger.error('Worker crashed', { error: String(err) });
  process.exit(1);
});
