import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const projectConfig = new URL('../.local/spacetime-runtime/config/cli.toml', import.meta.url);
const config = await readFile(process.env.SPACETIME_CONFIG_PATH ?? projectConfig, 'utf8').catch(async error => {
  if (process.env.SPACETIME_CONFIG_PATH || error.code !== 'ENOENT') throw error;
  return readFile(path.join(os.homedir(), '.config/spacetime/cli.toml'), 'utf8');
});
const token = config.match(/^spacetimedb_token\s*=\s*"([^"]+)"/m)?.[1];
if (!token) throw new Error('Run spacetime login --server-issued-login http://127.0.0.1:3000 first');
const target = new URL('../apps/orchestrator/.env', import.meta.url);
await writeFile(target, [
  'OFFLINE_MODE=true', 'PORT=4000',
  'SPACETIMEDB_URI=http://127.0.0.1:3000', 'SPACETIMEDB_DB_NAME=crowdtwin',
  `SPACETIMEDB_TOKEN=${token}`, 'APIFY_API_TOKEN=', 'ANTHROPIC_API_KEY=', 'FACTORY_API_KEY=', '',
].join('\n'), { flag: 'wx', mode: 0o600 });
console.log('Created ignored local .env, offline mode enabled. No provider keys added.');
