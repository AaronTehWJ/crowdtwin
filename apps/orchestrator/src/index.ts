import { config } from 'dotenv';
import { Database } from './database.js';
import { providers } from './config.js';
import { Workflow } from './workflow.js';
import { createApp } from './server.js';
import { coordinateIntake, coordinateAudit, closeCoordinators } from './droidCoordinator.js';

config({ path: new URL('../.env', import.meta.url), quiet: true });
const db = new Database(process.env.SPACETIMEDB_URI ?? 'http://127.0.0.1:3000', process.env.SPACETIMEDB_DB_NAME ?? 'crowdtwin', process.env.SPACETIMEDB_TOKEN);
const workflow = new Workflow(db, providers());
const server = createApp(workflow, job => coordinateIntake(workflow, job), id => coordinateAudit(workflow, id)).listen(Number(process.env.PORT ?? 4000), '127.0.0.1', () => console.log('CrowdTwin API listening on http://localhost:4000'));
const shutdown = () => { server.close(); server.closeAllConnections(); void closeCoordinators(); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
