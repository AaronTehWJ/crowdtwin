import { AuditReportSchema, ScenarioSummarySchema, type AuditReport, type WorldSpec } from '@crowdtwin/contracts';
import { CostConfirmationSchema, type CostConfirmation } from '@crowdtwin/contracts/validation';
import { z } from 'zod';

export const ScenarioSetSchema = z.array(ScenarioSummarySchema).length(3).superRefine((rows, ctx) => {
  if (new Set(rows.map(s => s.scenarioName)).size !== 3 ||
      rows.some(s => s.seedsRun !== 15 || s.profitableRuns < 0 || s.profitableRuns > s.seedsRun ||
        s.downsideP10ProfitCents > s.medianProfitCents))
    ctx.addIssue({ code: 'custom', message: 'Expected the three actual 15-seed scenario summaries' });
});
export type ScenarioSummary = z.infer<typeof ScenarioSummarySchema>;
export const unknownCosts: CostConfirmation = { unitCogsCents: false, boothFeeCents: false, staffAndEquipmentCents: false, organizerCutPct: false };

export function riskPolicy(runId: string, world: WorldSpec, input: unknown, costs: CostConfirmation): AuditReport {
  const scenarios = ScenarioSetSchema.parse(input);
  CostConfirmationSchema.parse(costs);
  const base = scenarios.find(s => s.scenarioName === 'BASE')!;
  const low = scenarios.find(s => s.scenarioName === 'LOW')!;
  const b = world.vendorBooth;
  const upfront = b.inventoryUnits * b.unitCogsCents + b.boothFeeCents + b.staffAndEquipmentCents;
  const verdict = Object.values(costs).some(known => !known) ? 'NEEDS_INPUT'
    : base.profitableRuns / base.seedsRun < 0.5 || b.organizerCutPct > 25 ? 'REJECT'
    : low.downsideP10ProfitCents < -0.3 * upfront ? 'REFER' : 'APPROVE';
  const cap = Math.min(450_000, b.inventoryUnits * b.unitCogsCents);
  const diagnosis = base.medianBalkedQueue >= base.medianBalkedPrice ? 'Queue capacity' : 'Price affordability';
  return AuditReportSchema.parse({
    runId, configHash: world.configHash, provenance: world.evidence.provenance, scenarios,
    policyVerdict: verdict, recommendedCapCents: cap,
    bottleneckDiagnosis: `${diagnosis} is the larger recorded rejection category; fixed costs and organizer share also affect profit.`,
    droidDiffText: `- Inventory preparation: ${b.inventoryUnits * b.unitCogsCents} cents\n+ Proposed inventory preparation cap: ${cap} cents\n  Booth fee unchanged: ${b.boothFeeCents} cents\n  Staff/equipment unchanged: ${b.staffAndEquipmentCents} cents\n  Current total upfront capital: ${upfront} cents\n  Policy: ${verdict}. Recommendation only, no approval or money transfer.`,
    narrativeMarkdown: `Deterministic fallback narrative. BASE breaks even in ${base.profitableRuns}/${base.seedsRun} runs; LOW P10 profit is ${low.downsideP10ProfitCents} cents. This simulation is not a demand forecast or a funding authorization.`,
  });
}
