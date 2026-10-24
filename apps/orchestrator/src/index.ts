import { config } from 'dotenv';
import { Database } from './database.js';
import { providers } from './config.js';
import { Workflow } from './workflow.js';
import { createApp } from './server.js';

config({ path: new URL('../.env', import.meta.url), quiet: true });
const db = new Database(process.env.SPACETIMEDB_URI ?? 'http://127.0.0.1:3000', process.env.SPACETIMEDB_DB_NAME ?? 'crowdtwin', process.env.SPACETIMEDB_TOKEN);
const workflow = new Workflow(db, providers());
const server = createApp(workflow).listen(Number(process.env.PORT ?? 4000), '127.0.0.1', () => console.log('CrowdTwin API listening on http://localhost:4000'));
process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
