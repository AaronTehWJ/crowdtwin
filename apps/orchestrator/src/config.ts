import { fileURLToPath } from 'node:url';

export const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
export const fixtureDir = fileURLToPath(new URL('../../../fixtures/', import.meta.url));
export type ProviderConfig = {
  offline: boolean;
  apifyToken?: string;
  anthropicKey?: string;
  factoryKey?: string;
  anthropicModel: string;
};
export function providers(env = process.env): ProviderConfig {
  return {
    offline: env.OFFLINE_MODE !== 'false',
    apifyToken: env.APIFY_API_TOKEN || undefined,
    anthropicKey: env.ANTHROPIC_API_KEY || undefined,
    factoryKey: env.FACTORY_API_KEY || undefined,
    anthropicModel: env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
  };
}
