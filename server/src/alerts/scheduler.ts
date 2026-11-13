import cron, { type ScheduledTask } from 'node-cron';
import type { AlertChecker } from './alertChecker.js';

export const DEFAULT_ALERT_SCHEDULE = '*/5 * * * *';

export interface AlertSchedule {
  readonly expression: string;
  nextRun(): Date | null;
  stop(): Promise<void>;
}

/** Runs `checker` on a cron schedule and logs what each pass did. */
export function startAlertSchedule(
  checker: AlertChecker,
  expression: string = DEFAULT_ALERT_SCHEDULE,
): AlertSchedule {
  const task: ScheduledTask = cron.schedule(
    expression,
    async () => {
      const s = await checker.runOnce();
      if (s.skippedReason) return;
      if (s.triggered > 0 || s.errors.length > 0) {
        const errors = s.errors.map((e) => `${e.symbol}: ${e.message}`).join('; ');
        console.log(
          `[alerts] checked ${s.checked}, sent ${s.triggered}${errors ? `, errors: ${errors}` : ''}`,
        );
      }
    },
    { name: 'alert-check', noOverlap: true },
  );

  return {
    expression,
    nextRun: () => task.getNextRun(),
    stop: async () => {
      await task.destroy();
    },
  };
}
