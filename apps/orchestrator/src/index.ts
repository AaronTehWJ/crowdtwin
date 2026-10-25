import { hosting } from './hosting.js';
import { config } from 'dotenv';
import { Database } from './database.js';
import { providers } from './config.js';
import { Workflow } from './workflow.js';
import { createApp } from './server.js';
import { coordinateIntake, coordinateAudit, closeCoordinators } from './droidCoordinator.js';

config({ path: new URL('../.env', import.meta.url), quiet: true });
const db = new Database(process.env.SPACETIMEDB_URI ?? 'http://127.0.0.1:3000', process.env.SPACETIMEDB_DB_NAME ?? 'crowdtwin', process.env.SPACETIMEDB_TOKEN);
const workflow = new Workflow(db, providers(), process.env.DATA_DIR);
const deployment = hosting();
const server = createApp(workflow, job => coordinateIntake(workflow, job), id => coordinateAudit(workflow, id), deployment).listen(deployment.port, deployment.host, () => console.log(`CrowdTwin listening on ${deployment.host}:${deployment.port}; providers ${workflow.config.offline ? 'offline' : 'live'}`));
const shutdown = () => { server.close(); server.closeAllConnections(); void closeCoordinators(); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
