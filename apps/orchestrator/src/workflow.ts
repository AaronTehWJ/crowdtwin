import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { z } from 'zod';
import { DecisionEventSchema, type DecisionEvent, type WorldSpec } from '@crowdtwin/contracts';
import { ValidatedWorldSchema, CostConfirmationSchema, canonicalJson, hashWorld, type CostConfirmation } from '@crowdtwin/contracts/validation';
import { collectLive, defaultWorld, loadFixture, validateEventUrl } from './apifyAdapter.js';
import { ClaudeService } from './claudeService.js';
import type { ProviderConfig } from './config.js';
import { Database } from './database.js';
import { AppError, boundInput } from './errors.js';
import { riskPolicy, unknownCosts, type ScenarioSummary } from './policy.js';

export const IntakeSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('CAPTURED'), fixture: z.enum(['atl', 'bay']) }).strict(),
  z.object({ mode: z.literal('LIVE'), url: z.string().max(2048) }).strict(),
]);
export type Intake = z.infer<typeof IntakeSchema>;
export type Stage = 'CREATED' | 'COLLECTING' | 'EVIDENCE_READY' | 'MAP_READY' | 'PERSONAS_READY' | 'AWAITING_APPROVAL' | 'INITIALIZING' | 'APPROVED' | 'COLLECTION_TIMEOUT' | 'ERROR';
export type Milestone = { id: number; stage: Stage; message: string };
export type Job = {
  id: string; intake: Intake; stage: Stage; milestones: Milestone[]; world?: WorldSpec;
  sources: Record<string, string>; error?: { code: string; message: string; details?: unknown };
  runId?: string;
};
type ApprovedRun = { world: WorldSpec; seed: number; costs: CostConfirmation; jobId: string };

export class Workflow {
  jobs = new Map<string, Job>();
  runs = new Map<string, ApprovedRun>();
  events = new EventEmitter();
  private locks = new Map<string, Promise<unknown>>();
  claude: ClaudeService;
  constructor(public db: Database, public config: ProviderConfig) { this.claude = new ClaudeService(config); }
  job(id: string): Job {
    const job = this.jobs.get(id);
    if (!job) throw new AppError(404, 'JOB_NOT_FOUND', 'Unknown job, or the orchestrator restarted');
    return job;
  }
  run(id: string): ApprovedRun {
    const run = this.runs.get(id);
    if (!run) throw new AppError(409, 'APPROVAL_REQUIRED', 'Run has no human approval in this process');
    return run;
  }
  stage(job: Job, expected: Stage) {
    if (job.stage !== expected) throw new AppError(409, 'INVALID_STAGE', `Expected ${expected}, found ${job.stage}`);
  }
  emit(job: Job, stage: Stage, message: string) {
    job.stage = stage;
    const event = { id: job.milestones.length + 1, stage, message };
    job.milestones.push(event);
    this.events.emit(job.id, event);
  }
  async serial<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prior = this.locks.get(key) ?? Promise.resolve();
    const next = prior.catch(() => undefined).then(fn);
    this.locks.set(key, next);
    try { return await next; }
    finally { if (this.locks.get(key) === next) this.locks.delete(key); }
  }
  create(input: unknown): Job {
    boundInput(input);
    const intake = IntakeSchema.parse(input);
    if (intake.mode === 'LIVE') validateEventUrl(intake.url);
    if (this.jobs.size >= 100) throw new AppError(429, 'LOCAL_CAPACITY', 'Restart the orchestrator to clear old job metadata');
    const job: Job = { id: randomUUID(), intake, stage: 'CREATED', milestones: [], sources: {} };
    this.jobs.set(job.id, job);
    this.emit(job, 'CREATED', 'Intake requested');
    return job;
  }
  fail(job: Job, error: unknown) {
    const e = error instanceof AppError ? error : new AppError(500, 'WORKFLOW_ERROR', 'Workflow failed; retry with a new job');
    job.error = { code: e.code, message: e.message, details: e.details };
    this.emit(job, e.code === 'COLLECTION_TIMEOUT' ? 'COLLECTION_TIMEOUT' : 'ERROR', e.message);
  }
  async collect(job: Job) {
    this.stage(job, 'CREATED');
    this.emit(job, 'COLLECTING', job.intake.mode === 'CAPTURED' ? 'Loading explicitly selected modeled fixture' : 'Collecting public event evidence');
    const evidence = job.intake.mode === 'CAPTURED' ? await loadFixture(job.intake.fixture) : await collectLive(job.intake.url, this.config);
    job.world = await defaultWorld(evidence);
    this.emit(job, 'EVIDENCE_READY', 'Evidence ready, vendor costs remain unconfirmed assumptions');
  }
  async draftMap(job: Job) {
    this.stage(job, 'EVIDENCE_READY');
    const result = await this.claude.draftMap(job.world!);
    job.world!.anchors = result.value; job.sources.map = result.source;
    this.emit(job, 'MAP_READY', `Map assumptions drafted (${result.source})`);
  }
  async draftPersonas(job: Job) {
    this.stage(job, 'MAP_READY');
    const result = await this.claude.draftPersonas(job.world!);
    job.world!.personas = result.value; job.sources.personas = result.source;
    this.emit(job, 'PERSONAS_READY', `Three archetypes drafted (${result.source})`);
  }
  async submit(job: Job) {
    this.stage(job, 'PERSONAS_READY');
    job.world = ValidatedWorldSchema.parse(job.world);
    job.world.configHash = await hashWorld(job.world);
    this.emit(job, 'AWAITING_APPROVAL', 'Human review required. No simulation has been initialized.');
  }
  async intake(job: Job) {
    try { await this.collect(job); await this.draftMap(job); await this.draftPersonas(job); await this.submit(job); }
    catch (e) { this.fail(job, e); }
  }
  async approve(id: string, input: unknown) {
    return this.serial(`job:${id}`, async () => {
      const job = this.job(id);
      this.stage(job, 'AWAITING_APPROVAL');
      boundInput(input);
      const request = z.object({ world: ValidatedWorldSchema, costs: CostConfirmationSchema.default(unknownCosts) }).strict().parse(input);
      if (canonicalJson(request.world.evidence) !== canonicalJson(job.world!.evidence))
        throw new AppError(400, 'EVIDENCE_IMMUTABLE', 'Evidence and provenance cannot be changed during assumption review');
      const world = request.world;
      world.configHash = await hashWorld(world);
      const runId = randomUUID();
      this.emit(job, 'INITIALIZING', 'Human approved setup; Rust is initializing and running 45 scenarios');
      try {
        await this.db.init(runId, world, 42);
        await this.db.batch(runId, world);
        this.runs.set(runId, { world, seed: 42, costs: request.costs, jobId: job.id });
        job.world = world; job.runId = runId;
        this.emit(job, 'APPROVED', 'Rust world and scenario summaries ready');
        return { runId, world, ...(await this.db.snapshot(runId)) };
      } catch (e) { this.fail(job, e); throw e; }
    });
  }
  async step(id: string, steps: number) {
    return this.serial(id, async () => { this.run(id); await this.db.step(id, steps); return this.db.snapshot(id); });
  }
  async variant(id: string, input: unknown) {
    return this.serial(id, async () => {
      const baseline = this.run(id);
      const changes = z.object({ relocate: z.boolean(), addServer: z.boolean(), capInventory: z.boolean() }).strict().parse(input);
      const before = await this.db.snapshot(id);
      if (before.run.status !== 'COMPLETED') throw new AppError(409, 'BASELINE_INCOMPLETE', 'Complete the baseline before comparing a paired intervention');
      const world = structuredClone(baseline.world);
      const b = world.vendorBooth;
      if (changes.relocate) { const stage = world.anchors.find(a => a.nodeType === 'STAGE')!; b.x = stage.x; b.y = Math.min(1000, stage.y + 100); }
      if (changes.addServer) { b.parallelServers++; b.staffAndEquipmentCents += 30_000; }
      if (changes.capInventory && b.unitCogsCents > 0) {
        if (b.unitCogsCents > 450_000) throw new AppError(400, 'CAP_TOO_LOW', 'One unit exceeds the inventory cap');
        b.inventoryUnits = Math.min(b.inventoryUnits, Math.floor(450_000 / b.unitCogsCents));
      }
      ValidatedWorldSchema.parse(world);
      world.configHash = await hashWorld(world);
      const runId = randomUUID();
      await this.db.init(runId, world, baseline.seed);
      await this.db.step(runId, Math.ceil(before.run.simTimeSec / 30));
      await this.db.batch(runId, world);
      this.runs.set(runId, { ...baseline, world });
      return { runId, baselineId: id, seed: baseline.seed, horizonSec: before.run.simTimeSec, world, baseline: before, variant: await this.db.snapshot(runId) };
    });
  }
  async explain(id: string, eventId: string) {
    this.run(id);
    const events = await this.db.rows<DecisionEvent>('decision_event', id);
    const event = events.find(e => e.eventId === eventId);
    if (!event) throw new AppError(404, 'DECISION_NOT_FOUND', 'No recorded decision with that ID belongs to this run');
    DecisionEventSchema.parse(event);
    const explanation = await this.claude.explain(event);
    return { event, explanation: explanation.value, source: explanation.source };
  }
  async audit(id: string) {
    const run = this.run(id);
    const report = riskPolicy(id, run.world, await this.db.rows<ScenarioSummary>('scenario_result', id), run.costs);
    const narrative = await this.claude.audit(report);
    return { ...report, narrativeMarkdown: `${report.narrativeMarkdown}\n\n${narrative.value}`, narrativeSource: narrative.source, coordinatorSource: this.job(run.jobId).sources.coordinator ?? 'DETERMINISTIC_FALLBACK' };
  }
}
