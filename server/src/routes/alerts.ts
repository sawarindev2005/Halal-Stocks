import { Router } from 'express';
import type { AlertResponse, AlertsResponse, AlertStatusResponse } from '@shared/types';
import type { AlertChecker } from '../alerts/alertChecker.js';
import type { AlertRepository } from '../alerts/alertRepository.js';
import { buildTestMessage, NotifierError, type Notifier } from '../alerts/discordNotifier.js';
import type { AlertSchedule } from '../alerts/scheduler.js';
import { HttpError } from '../lib/errors.js';
import {
  alertIdParamsSchema,
  alertsQuerySchema,
  createAlertSchema,
  MAX_ALERTS,
  updateAlertSchema,
} from '../schemas.js';
import type { ShariahRepository } from '../services/shariahService.js';

export interface AlertsDeps {
  repo: AlertRepository;
  checker: AlertChecker;
  notifier: Notifier | null;
  shariah: ShariahRepository;
  /** Absent when the background schedule is not running (e.g. in tests) */
  schedule?: Pick<AlertSchedule, 'expression' | 'nextRun'>;
}

function webhookNotConfigured() {
  return new HttpError(
    409,
    'WEBHOOK_NOT_CONFIGURED',
    'DISCORD_WEBHOOK_URL is not set in .env — add it and restart the server',
  );
}

function alertNotFound(id: number) {
  return new HttpError(404, 'ALERT_NOT_FOUND', `Alert ${id} not found`);
}

export function alertsRouter({ repo, checker, notifier, shariah, schedule }: AlertsDeps): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const { symbol } = alertsQuerySchema.parse(req.query);
    const body: AlertsResponse = { alerts: await repo.list({ symbol }) };
    res.json(body);
  });

  router.post('/', async (req, res) => {
    const input = createAlertSchema.parse(req.body);
    if (!(await shariah.get(input.symbol))) {
      throw new HttpError(
        400,
        'UNKNOWN_SYMBOL',
        `${input.symbol} is not in the Shariah stock list`,
      );
    }
    if ((await repo.count()) >= MAX_ALERTS) {
      throw new HttpError(409, 'ALERT_LIMIT_REACHED', `At most ${MAX_ALERTS} alerts are allowed`);
    }
    const body: AlertResponse = { alert: await repo.create(input) };
    res.status(201).json(body);
  });

  router.get('/status', (_req, res) => {
    const body: AlertStatusResponse = {
      webhookConfigured: notifier !== null,
      schedule: schedule?.expression ?? '',
      nextCheckAt: schedule?.nextRun()?.toISOString() ?? null,
      lastCheck: checker.lastCheck(),
    };
    res.json(body);
  });

  /** Sends a test message so the user can confirm the webhook works. */
  router.post('/test', async (_req, res) => {
    if (!notifier) throw webhookNotConfigured();
    try {
      await notifier.send(buildTestMessage());
    } catch (err) {
      const message = err instanceof NotifierError ? err.message : 'Could not send to Discord';
      throw new HttpError(502, 'DISCORD_ERROR', message);
    }
    res.json({ ok: true });
  });

  /** Runs the checker immediately instead of waiting for the next scheduled pass. */
  router.post('/check', async (_req, res) => {
    if (!notifier) throw webhookNotConfigured();
    res.json(await checker.runOnce());
  });

  router.patch('/:id', async (req, res) => {
    const { id } = alertIdParamsSchema.parse(req.params);
    const patch = updateAlertSchema.parse(req.body);
    const current = await repo.get(id);
    if (!current) throw alertNotFound(id);

    const condition = patch.condition ?? current.condition;
    const threshold = patch.threshold ?? current.threshold;
    if (condition === 'change_down' && threshold > 100) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid request parameters', [
        { path: 'threshold', message: 'A daily drop cannot exceed 100%' },
      ]);
    }

    const body: AlertResponse = { alert: (await repo.update(id, patch))! };
    res.json(body);
  });

  router.delete('/:id', async (req, res) => {
    const { id } = alertIdParamsSchema.parse(req.params);
    if (!(await repo.delete(id))) throw alertNotFound(id);
    res.status(204).end();
  });

  return router;
}
