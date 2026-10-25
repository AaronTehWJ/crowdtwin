import { hosting, demoAuth, type Hosting } from './hosting.js';
import path from 'node:path';
import { repoRoot } from './config.js';
import express from 'express';
import cors from 'cors';
import { z, ZodError } from 'zod';
import { Workflow, type Job, type Milestone } from './workflow.js';
import { AppError, boundInput } from './errors.js';

export function createApp(workflow: Workflow, coordinator: (job: Job) => Promise<void> = job => workflow.intake(job), audit: (id: string) => Promise<unknown> = id => workflow.audit(id), deployment: Hosting = hosting()) {
  const app = express();
  app.disable('x-powered-by');
  const allowedOrigins = new Set(deployment.origins);
  app.use(cors({ origin: [...allowedOrigins], credentials: true }));
  app.use(demoAuth(deployment.password));
  app.use((req, _res, next) => {
    if (req.headers.origin && !allowedOrigins.has(req.headers.origin))
      return next(new AppError(403, 'ORIGIN_NOT_ALLOWED', 'This studio origin is not configured on the API'));
    if (req.method === 'POST' && !req.is('application/json')) return next(new AppError(415, 'JSON_REQUIRED', 'Use application/json'));
    next();
  });
  app.use(express.json({ limit: '2mb' }));
  app.use((req, _res, next) => { try { boundInput(req.body); next(); } catch (e) { next(e); } });
  app.get('/api/health', async (_req, res) => {
    let connected = false;
    try { await workflow.db.rows('run_state'); connected = true; } catch { /* Report degraded, never fabricate availability. */ }
    const config = workflow.config;
    const state = (key?: string) => config.offline ? 'OFFLINE_DISABLED' : key ? 'CONFIGURED_UNVERIFIED' : 'MISSING_KEY';
    res.status(connected && workflow.db.mutationConfigured ? 200 : 503).json({
      ok: connected && workflow.db.mutationConfigured, offline: config.offline,
      spacetime: connected ? 'CONNECTED' : 'UNAVAILABLE', mutationIdentity: workflow.db.mutationConfigured ? 'CONFIGURED' : 'MISSING',
      apify: config.offline ? 'OFFLINE_DISABLED' : workflow.apifyStatus ?? state(config.apifyToken), claude: workflow.claude.status ?? state(config.anthropicKey), factory: config.offline ? 'OFFLINE_DISABLED' : config.coordinator === 'deterministic' ? 'NOT_SELECTED' : workflow.droidStatus ?? state(config.factoryKey),
      coordinator: config.coordinator ?? 'droid',
      database: { uri: workflow.db.uri, name: workflow.db.name },
      restartBehavior: workflow.persistent ? 'Approved runs and review drafts persist. Interrupted provider calls require a new intake.' : 'Jobs and approvals are in memory. Set DATA_DIR for restart recovery.',
    });
  });
  app.post('/api/jobs', (req, res) => {
    const job = workflow.create(req.body);
    res.status(202).json(job);
    void coordinator(job).catch(e => workflow.fail(job, e));
  });
  app.get('/api/jobs/:id', (req, res) => res.json(workflow.job(req.params.id)));
  app.get('/api/jobs/:id/events', (req, res) => {
    const job = workflow.job(req.params.id);
    if (workflow.events.listenerCount(job.id) >= 10) throw new AppError(429, 'SSE_LIMIT', 'Too many progress subscribers');
    const after = z.coerce.number().int().min(0).parse(req.headers['last-event-id'] ?? req.query.after ?? 0);
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    const write = (event: Milestone) => res.write(`id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`);
    job.milestones.filter(e => e.id > after).forEach(write);
    workflow.events.on(job.id, write);
    const heartbeat = setInterval(() => res.write(': keepalive\n\n'), 15_000);
    req.on('close', () => { clearInterval(heartbeat); workflow.events.off(job.id, write); });
  });
  app.post('/api/jobs/:id/approve', async (req, res) => res.json(await workflow.approve(req.params.id, req.body)));
  app.get('/api/runs/:id', async (req, res) => { const run = workflow.run(req.params.id); res.json({ ...await workflow.db.snapshot(req.params.id), world: run.world }); });
  app.post('/api/runs/:id/step', async (req, res) => {
    const { steps } = z.object({ steps: z.number().int().min(1).max(8640) }).strict().parse(req.body);
    res.json(await workflow.step(req.params.id, steps));
  });
  app.post('/api/runs/:id/variants', async (req, res) => res.json(await workflow.variant(req.params.id, req.body)));
  app.post('/api/runs/:id/explain', async (req, res) => {
    const { eventId } = z.object({ eventId: z.string().min(1).max(180) }).strict().parse(req.body);
    res.json(await workflow.explain(req.params.id, eventId));
  });
  app.get('/api/runs/:id/audit', async (req, res) => res.json(await audit(req.params.id)));
  app.use(express.static(path.join(repoRoot, 'apps/web/dist')));
  app.get('/{*path}', (req, res, next) => req.path.startsWith('/api/') ? next() : res.sendFile(path.join(repoRoot, 'apps/web/dist/index.html')));
  app.use((_req, res) => res.status(404).json({ code: 'NOT_FOUND', message: 'Unknown API endpoint' }));
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof ZodError) return res.status(400).json({ code: 'INVALID_INPUT', message: 'Input validation failed', issues: error.issues.map(e => ({ path: e.path, message: e.message })) });
    if (error instanceof AppError) return res.status(error.status).json({ code: error.code, message: error.message, details: error.details });
    const bodyError = error as { type?: string };
    if (bodyError?.type === 'entity.too.large') return res.status(413).json({ code: 'INPUT_LIMIT', message: 'Request exceeds 2 MB' });
    if (bodyError?.type === 'entity.parse.failed') return res.status(400).json({ code: 'INVALID_JSON', message: 'Malformed JSON body' });
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Request failed. See health status and retry with a new job.' });
  });
  return app;
}
