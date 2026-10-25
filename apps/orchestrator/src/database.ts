import type { WorldSpec } from '@crowdtwin/contracts';
import type { BoothData, RunState } from './module_bindings/index.js';
import type { Infer } from 'spacetimedb';
import { AppError } from './errors.js';

type JsonNumbers<T> = { [K in keyof T]: T[K] extends bigint ? number : T[K] };
export type BoothSnapshot = JsonNumbers<Infer<typeof BoothData>>;
export type RunSnapshot = JsonNumbers<Infer<typeof RunState>>;
export const publicTables = ['run_state', 'anchor_node', 'booth', 'customer_agent', 'decision_event', 'scenario_result'] as const;
export class Database {
  constructor(public uri: string, public name: string, private token?: string) {
    const url = new URL(uri);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
      throw new Error('SpacetimeDB must use an HTTP(S) server origin');
    this.uri = url.origin;
    if (!/^[a-z0-9-]+$/.test(name)) throw new Error('Invalid database name');
  }
  get mutationConfigured() { return Boolean(this.token); }
  private async request(path: string, body: unknown, sql = false): Promise<Response> {
    try {
      const r = await fetch(`${this.uri}/v1/database/${this.name}/${path}`, {
        method: 'POST', headers: { 'Content-Type': sql ? 'text/plain' : 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
        body: sql ? String(body) : JSON.stringify(body), signal: AbortSignal.timeout(120_000),
      });
      if (!r.ok) throw new AppError(503, 'DATABASE_ERROR', 'Database operation failed', { status: r.status });
      return r;
    } catch (e) {
      if (e instanceof AppError) throw e;
      throw new AppError(503, 'DATABASE_UNAVAILABLE', 'SpacetimeDB is unavailable');
    }
  }
  async rows<T>(table: typeof publicTables[number], runId?: string): Promise<T[]> {
    if (runId && !/^[a-zA-Z0-9_-]{1,80}$/.test(runId)) throw new AppError(400, 'INVALID_ID', 'Invalid run ID');
    const query = `SELECT * FROM ${table}${runId ? ` WHERE run_id = '${runId}'` : ''}`;
    const [result] = await (await this.request('sql', query, true)).json() as {
      schema: { elements: { name: { some: string } }[] }; rows: unknown[][];
    }[];
    if (!result) throw new AppError(503, 'DATABASE_ERROR', 'No SQL result');
    return result.rows.map(row => Object.fromEntries(result.schema.elements.map((e, i) => [
      e.name.some.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()), row[i],
    ])) as T);
  }
  private async mutate(reducer: string, args: unknown[]) {
    if (!this.token) throw new AppError(503, 'MUTATION_IDENTITY_MISSING', 'Configure the database publisher token');
    await this.request(`call/${reducer}`, args);
  }
  async init(runId: string, world: WorldSpec, seed: number) {
    await this.mutate('init_world', [runId, JSON.stringify(world), seed]);
  }
  async batch(runId: string, world: WorldSpec) { await this.mutate('run_batch_scenarios', [runId, JSON.stringify(world)]); }
  async step(runId: string, steps: number) { await this.mutate('step_simulation', [runId, steps]); }
  async snapshot(runId: string) {
    const [runs, booths] = await Promise.all([this.rows<RunSnapshot>('run_state', runId), this.rows<BoothSnapshot>('booth', runId)]);
    if (!runs[0] || !booths[0]) throw new AppError(404, 'RUN_NOT_FOUND', 'Simulation does not exist');
    return { run: runs[0], booth: booths[0] };
  }
}
