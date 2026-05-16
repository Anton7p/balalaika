import { runWatchdog } from './run-loop';

runWatchdog().catch((err: unknown) => {
  console.error('[watchdog] fatal', err);
  process.exit(1);
});
