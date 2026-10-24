import type { Infer } from 'spacetimedb';
import type { AnchorNodeData, BoothData, CustomerAgentData, DecisionEventData, RunState } from './module_bindings';

export type JsonNumbers<T> = { [K in keyof T]: T[K] extends bigint ? number : T[K] };
export type Agent = JsonNumbers<Infer<typeof CustomerAgentData>>;
export type Booth = JsonNumbers<Infer<typeof BoothData>>;
export type Run = JsonNumbers<Infer<typeof RunState>>;
export type RecordedDecision = JsonNumbers<Infer<typeof DecisionEventData>>;
export type Anchor = JsonNumbers<Infer<typeof AnchorNodeData>>;
export type Snapshot = { run: Run; booth: Booth };
export type Scene = Snapshot & { agents: Agent[]; decisions: RecordedDecision[]; anchors: Anchor[] };

export function jsonNumbers<T extends object>(row: T): JsonNumbers<T> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => {
    if (typeof value !== 'bigint') return [key, value];
    const n = Number(value);
    if (!Number.isSafeInteger(n)) throw new Error('Database integer exceeds safe display precision');
    return [key, n];
  })) as JsonNumbers<T>;
}
export function latestDecision(events: RecordedDecision[], runId: string, agentId: number) {
  return events.filter(e => e.runId === runId && e.agentId === agentId)
    .sort((a, b) => b.simTimeSec - a.simTimeSec || b.eventId.localeCompare(a.eventId))[0];
}
export function interpolate(from: { x: number; y: number }, to: { x: number; y: number }, fraction: number) {
  const t = Math.max(0, Math.min(1, fraction));
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}
