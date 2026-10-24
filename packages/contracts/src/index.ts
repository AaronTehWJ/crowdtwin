import { z } from 'zod';

export const ProvenanceModeSchema = z.enum(['LIVE', 'CAPTURED', 'MANUAL']);
export type ProvenanceMode = z.infer<typeof ProvenanceModeSchema>;

export const EventEvidenceSchema = z.object({
  eventId: z.string(),
  sourceUrl: z.string().url(),
  provenance: ProvenanceModeSchema,
  capturedAtIso: z.string(),
  actorRunId: z.string().nullable(),
  title: z.string(),
  description: z.string(),
  startIso: z.string(),
  endIso: z.string(),
  durationHours: z.number(),
  venueName: z.string(),
  venueAddress: z.string(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  ticketPriceCents: z.number().int().nullable(),
  platformRsvpCount: z.number().int().nullable(),
  organizerClaimedAttendance: z.number().int().nullable(),
  nearbyCompetitorPriceBands: z.array(z.string()),
});
export type EventEvidence = z.infer<typeof EventEvidenceSchema>;

export const AnchorNodeSpecSchema = z.object({
  id: z.string(),
  nodeType: z.enum(['ENTRANCE', 'STAGE', 'EXIT', 'COMPETITOR']),
  label: z.string(),
  x: z.number().min(0).max(1000),
  y: z.number().min(0).max(1000),
  gravityWeight: z.number().min(0).max(10),
  competitorPriceCents: z.number().int().nullable(),
});

export const PersonaArchetypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  weight: z.number().min(0).max(1),
  walletMinCents: z.number().int(),
  walletMaxCents: z.number().int(),
  maxWaitSec: z.number().int(),
  categoryAffinity: z.number().min(0).max(1),
});

export const VendorBoothSpecSchema = z.object({
  boothId: z.string(),
  name: z.string(),
  x: z.number().min(0).max(1000),
  y: z.number().min(0).max(1000),
  itemPriceCents: z.number().int(),
  unitCogsCents: z.number().int(),
  prepTimeSec: z.number().int(),
  parallelServers: z.number().int().min(1),
  inventoryUnits: z.number().int().min(1),
  boothFeeCents: z.number().int(),
  staffAndEquipmentCents: z.number().int(),
  organizerCutPct: z.number().min(0).max(100),
});

export const WorldSpecSchema = z.object({
  schemaVersion: z.literal('v1'),
  configHash: z.string(),
  evidence: EventEvidenceSchema,
  mapMode: z.enum(['OUTDOOR_MAP', 'INDOOR_IMAGE']),
  floorplanImageUrl: z.string().nullable(),
  totalSimulatedAttendees: z.number().int().min(50).max(1000),
  anchors: z.array(AnchorNodeSpecSchema),
  vendorBooth: VendorBoothSpecSchema,
  personas: z.array(PersonaArchetypeSchema),
});
export type WorldSpec = z.infer<typeof WorldSpecSchema>;

export const DecisionReasonSchema = z.enum([
  'PURCHASED',
  'BALKED_QUEUE_WAIT',
  'ABANDONED_QUEUE',
  'BALKED_PRICE_EXCEEDS_WALLET',
  'BALKED_LOW_AFFINITY',
  'STOCKOUT',
]);

export const DecisionEventSchema = z.object({
  eventId: z.string(),
  runId: z.string(),
  simTimeSec: z.number().int(),
  agentId: z.number().int(),
  archetypeName: z.string(),
  boothId: z.string(),
  reason: DecisionReasonSchema,
  agentWalletCents: z.number().int(),
  agentHunger: z.number().int(),
  agentPatienceSec: z.number().int(),
  observedPriceCents: z.number().int(),
  estimatedWaitSec: z.number().int(),
  remainingStock: z.number().int(),
});
export type DecisionEvent = z.infer<typeof DecisionEventSchema>;

export const ScenarioSummarySchema = z.object({
  scenarioName: z.enum(['LOW', 'BASE', 'HIGH']),
  turnoutCount: z.number().int(),
  seedsRun: z.number().int(),
  profitableRuns: z.number().int(),
  medianRevenueCents: z.number().int(),
  medianProfitCents: z.number().int(),
  downsideP10ProfitCents: z.number().int(),
  medianBalkedQueue: z.number().int(),
  medianBalkedPrice: z.number().int(),
});

export const AuditReportSchema = z.object({
  runId: z.string(),
  configHash: z.string(),
  provenance: ProvenanceModeSchema,
  scenarios: z.array(ScenarioSummarySchema),
  policyVerdict: z.enum(['APPROVE', 'REFER', 'REJECT', 'NEEDS_INPUT']),
  recommendedCapCents: z.number().int(),
  bottleneckDiagnosis: z.string(),
  droidDiffText: z.string(),
  narrativeMarkdown: z.string(),
});
export type AuditReport = z.infer<typeof AuditReportSchema>;
