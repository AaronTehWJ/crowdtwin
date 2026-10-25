import { fileURLToPath } from 'node:url';

export const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
export const fixtureDir = fileURLToPath(new URL('../../../fixtures/', import.meta.url));
export type ProviderConfig = {
  offline: boolean;
  coordinator?: 'droid' | 'deterministic';
  droidExecPath?: string;
  droidModel?: string;
  apifyToken?: string;
  anthropicKey?: string;
  factoryKey?: string;
  anthropicModel: string;
};
export function providers(env = process.env): ProviderConfig {
  if (env.COORDINATOR_MODE && !['droid', 'deterministic'].includes(env.COORDINATOR_MODE)) throw new Error('Invalid COORDINATOR_MODE');
  return {
    coordinator: env.COORDINATOR_MODE === 'deterministic' ? 'deterministic' : 'droid',
    droidExecPath: env.DROID_EXEC_PATH || undefined,
    droidModel: env.DROID_MODEL || 'claude-sonnet-4-6',
    offline: env.OFFLINE_MODE !== 'false',
    apifyToken: env.APIFY_API_TOKEN || undefined,
    anthropicKey: env.ANTHROPIC_API_KEY || undefined,
    factoryKey: env.FACTORY_API_KEY || undefined,
    anthropicModel: env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
  };
}
