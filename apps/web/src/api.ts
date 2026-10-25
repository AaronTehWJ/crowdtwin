import type { EventEvidence, WorldSpec } from '@crowdtwin/contracts';

export type Stage = 'CREATED' | 'COLLECTING' | 'EVIDENCE_READY' | 'MAP_READY' | 'PERSONAS_READY' | 'AWAITING_APPROVAL' | 'INITIALIZING' | 'APPROVED' | 'COLLECTION_TIMEOUT' | 'ERROR';
export type Milestone = { id: number; stage: Stage; message: string };
export type Job = {
  id: string; stage: Stage; milestones: Milestone[]; world?: WorldSpec; runId?: string;
  sources: Record<string, string>; error?: { code: string; message: string };
};
export type Health = {
  ok: boolean; offline: boolean; spacetime: string; mutationIdentity: string;
  apify: string; claude: string; factory: string; coordinator?: string;
  database?: { uri: string; name: string };
};
export type Intake = { mode: 'CAPTURED'; fixture: 'atl' | 'demo' | 'bay' } | { mode: 'LIVE'; url: string };
export const evidenceLabel = (e?: EventEvidence) => !e ? 'NO EVIDENCE' :
  e.provenance === 'CAPTURED' ? `CAPTURED · ${e.actorRunId ? 'APIFY SNAPSHOT' : 'MODELED DEMO'}` : e.provenance;

export const apiUrl = (path: string) => `${(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')}/api${path}`;

export async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(apiUrl(path), {
    credentials: 'include',
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: signal ?? AbortSignal.timeout(150_000),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.message ?? 'API unavailable. Check the API and database.');
  return value as T;
}

export const isTerminal = (stage: Stage) => ['APPROVED', 'ERROR', 'COLLECTION_TIMEOUT'].includes(stage);
export const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(cents / 100);
export const elapsed = (seconds: number) => `${Math.floor(seconds / 3600)}h ${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}m`;
export const sourceLabel = (source?: string) => source === 'CLAUDE' ? 'Claude' : source === 'FACTORY_DROID' ? 'Factory Droid' : 'Deterministic fallback';
