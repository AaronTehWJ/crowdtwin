import { z } from 'zod';
import { EventEvidenceSchema, WorldSpecSchema, type WorldSpec } from './index.js';

// Operational limits keep both JavaScript arithmetic and Rust batch work bounded.
export const MoneySchema = z.number().int().min(0).max(100_000_000);
export const CostConfirmationSchema = z.object({
  unitCogsCents: z.boolean(),
  boothFeeCents: z.boolean(),
  staffAndEquipmentCents: z.boolean(),
  organizerCutPct: z.boolean(),
}).strict();
export type CostConfirmation = z.infer<typeof CostConfirmationSchema>;

export const ValidatedEvidenceSchema = EventEvidenceSchema.superRefine((e, ctx) => {
  const issue = (path: string, message: string) =>
    ctx.addIssue({ code: 'custom', path: [path], message });
  for (const key of ['capturedAtIso', 'startIso', 'endIso'] as const) {
    if (!z.string().datetime({ offset: true }).safeParse(e[key]).success) issue(key, 'Expected ISO timestamp with timezone');
  }
  const duration = (Date.parse(e.endIso) - Date.parse(e.startIso)) / 3_600_000;
  if (!(duration > 0 && duration <= 72) || Math.abs(duration - e.durationHours) > 1 / 3600)
    issue('durationHours', 'Duration must match dates and be between 0 and 72 hours');
  if (e.lat !== null && (!Number.isFinite(e.lat) || Math.abs(e.lat) > 90)) issue('lat', 'Invalid latitude');
  if (e.lng !== null && (!Number.isFinite(e.lng) || Math.abs(e.lng) > 180)) issue('lng', 'Invalid longitude');
  for (const key of ['ticketPriceCents', 'platformRsvpCount', 'organizerClaimedAttendance'] as const)
    if (e[key] !== null && !MoneySchema.safeParse(e[key]).success) issue(key, 'Expected bounded nonnegative integer');
  if (!e.eventId.trim() || !e.title.trim()) issue('title', 'Event ID and title are required');
  if (e.provenance === 'LIVE' && !e.actorRunId?.trim()) issue('actorRunId', 'Live evidence requires a real actor run ID');
});

export const ValidatedWorldSchema = WorldSpecSchema.superRefine((w, ctx) => {
  const issue = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: 'custom', path, message });
  const evidence = ValidatedEvidenceSchema.safeParse(w.evidence);
  if (!evidence.success) for (const e of evidence.error.issues) ctx.addIssue({ ...e, path: ['evidence', ...e.path] });
  const b = w.vendorBooth;
  for (const key of ['itemPriceCents', 'unitCogsCents', 'boothFeeCents', 'staffAndEquipmentCents'] as const)
    if (!MoneySchema.safeParse(b[key]).success) issue(['vendorBooth', key], 'Expected bounded nonnegative cents');
  if (b.prepTimeSec < 1 || b.prepTimeSec > 3600) issue(['vendorBooth', 'prepTimeSec'], 'Prep time must be 1..3600 seconds');
  if (b.parallelServers > 50 || b.inventoryUnits > 100_000) issue(['vendorBooth'], 'Servers or inventory exceed operational limits');
  const capital = b.inventoryUnits * b.unitCogsCents + b.boothFeeCents + b.staffAndEquipmentCents;
  if (!Number.isSafeInteger(capital)) issue(['vendorBooth'], 'Upfront capital must be safe integer cents');
  if (w.anchors.length < 2 || w.anchors.length > 32) issue(['anchors'], 'Expected 2..32 anchors');
  for (const kind of ['ENTRANCE', 'STAGE', 'EXIT'])
    if (!w.anchors.some(a => a.nodeType === kind)) issue(['anchors'], `Missing ${kind} anchor`);
  w.anchors.forEach((a, i) => {
    if (a.competitorPriceCents !== null && !MoneySchema.safeParse(a.competitorPriceCents).success)
      issue(['anchors', i, 'competitorPriceCents'], 'Invalid price');
  });
  if (w.personas.length !== 3 || Math.abs(w.personas.reduce((n, p) => n + p.weight, 0) - 1) > 1e-6)
    issue(['personas'], 'Exactly three archetypes with weights summing to one are required');
  w.personas.forEach((p, i) => {
    if (!MoneySchema.safeParse(p.walletMinCents).success || !MoneySchema.safeParse(p.walletMaxCents).success || p.walletMinCents > p.walletMaxCents)
      issue(['personas', i], 'Invalid wallet range');
    if (p.maxWaitSec < 1 || p.maxWaitSec > 3600) issue(['personas', i, 'maxWaitSec'], 'Patience must be 1..3600 seconds');
    if (!p.name.trim()) issue(['personas', i, 'name'], 'Name required');
  });
  const ids = [...w.anchors.map(a => a.id), ...w.personas.map(p => p.id), b.boothId];
  if (ids.some(id => !/^[a-zA-Z0-9_-]{1,80}$/.test(id)) || new Set(ids).size !== ids.length)
    issue([], 'IDs must be unique, nonempty safe identifiers');
  if (w.mapMode === 'INDOOR_IMAGE' && !w.floorplanImageUrl) issue(['floorplanImageUrl'], 'Indoor review requires an image');
  if (w.floorplanImageUrl && !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(w.floorplanImageUrl))
    issue(['floorplanImageUrl'], 'Use a local PNG, JPEG or WebP image, not a remote URL');
});

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map(k => `${JSON.stringify(k)}:${canonicalJson(object[k])}`).join(',')}}`;
}

export async function hashWorld(input: WorldSpec): Promise<string> {
  const { configHash: _, ...world } = ValidatedWorldSchema.parse(input);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(world)));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
