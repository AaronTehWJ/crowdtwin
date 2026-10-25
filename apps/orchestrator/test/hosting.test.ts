import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hosting } from '../src/hosting.js';
import { createApp } from '../src/server.js';
import { Workflow } from '../src/workflow.js';
import { providers } from '../src/config.js';
import { Database } from '../src/database.js';

test('hosted mode requires explicit origins and private demo credentials', () => {
  assert.throws(() => hosting({NODE_ENV:'production'}));
  assert.throws(() => hosting({ALLOWED_ORIGINS:'https://studio.example/path'}));
  const config=hosting({NODE_ENV:'production', ALLOWED_ORIGINS:'https://studio.example', DEMO_PASSWORD:'a-long-demo-password'});
  assert.equal(config.host,'0.0.0.0');
});
test('hosted API protects paid intake and rejects unconfigured origins', async () => {
  const w=new Workflow(new Database('https://maincloud.spacetimedb.com','crowdtwin'), providers({}));
  const deployment=hosting({NODE_ENV:'production', ALLOWED_ORIGINS:'https://studio.example', DEMO_PASSWORD:'a-long-demo-password'});
  const server=createApp(w, job=>w.intake(job), id=>w.audit(id),deployment).listen(0,'127.0.0.1');
  await new Promise<void>(r=>server.once('listening',r));
  const url=`http://127.0.0.1:${(server.address() as any).port}/api/jobs`;
  try {
    assert.equal((await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
    const headers={'Content-Type':'application/json',Authorization:`Basic ${Buffer.from('demo:a-long-demo-password').toString('base64')}`};
    assert.equal((await fetch(url,{method:'POST',headers:{...headers,Origin:'https://evil.example'},body:'{}'})).status,403);
    const response=await fetch(url,{method:'POST',headers:{...headers,Origin:'https://studio.example'},body:JSON.stringify({mode:'CAPTURED',fixture:'demo'})});
    assert.equal(response.status,202);
    assert.equal(response.headers.get('access-control-allow-origin'),'https://studio.example');
  } finally { server.closeAllConnections(); await new Promise<void>(r=>server.close(()=>r())); }
});
test('workflow persists review drafts and marks interrupted intake without retrying providers', async () => {
  const dir=mkdtempSync(path.join(os.tmpdir(),'crowdtwin-state-'));
  try {
    const db=new Database('https://maincloud.spacetimedb.com','crowdtwin');
    const w=new Workflow(db,providers({}),dir);
    const ready=w.create({mode:'CAPTURED',fixture:'demo'});
    await w.intake(ready);
    const interrupted=w.create({mode:'CAPTURED',fixture:'bay'});
    const restored=new Workflow(db,providers({}),dir);
    assert.equal(restored.job(ready.id).stage,'AWAITING_APPROVAL');
    assert.equal(restored.job(interrupted.id).error?.code,'INTERRUPTED');
    assert.throws(()=>new Workflow(new Database('https://maincloud.spacetimedb.com','other'),providers({}),dir),/different database/);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
