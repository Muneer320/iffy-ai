import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { NextRequest } from 'next/server';
import { createDemo, demoExamples } from '../lib/demo/examples';
import { SimulationResponseSchema } from '../lib/schemas/simulation.schema';
import { DebateSchema } from '../lib/schemas/debate.schema';
import { runSimulation } from '../lib/services/simulation.service';
import { runMutation } from '../lib/services/mutation.service';
import { runDebate } from '../lib/services/debate.service';
import { runSectorAnalysis } from '../lib/services/sector.service';
import { loadSimulation, listSimulations } from '../lib/storage';
import { POST } from '../app/api/simulate/route';
import { options, requireAccess, consumeGenerationBudget } from '../lib/api';
import { getGroqClient } from '../lib/ai/groq';
import { getSupabaseAdmin } from '../lib/supabase/client';
import { runtimeMode } from '../lib/runtime';

const directory=await mkdtemp(join(tmpdir(),'iffy-test-'));
process.env.IFFY_DATA_DIR=directory;
process.env.IFFY_MODE='demo';
// A demo must ignore inherited real provider configuration, even if present.
process.env.GROQ_API_KEY='not-a-real-key';
process.env.SUPABASE_SERVICE_ROLE_KEY='not-a-real-key';
after(async()=>{await rm(directory,{recursive:true,force:true});});
const first=demoExamples()[0];
const request=(body:string,headers:Record<string,string>={})=>new NextRequest('http://localhost/api/simulate',{method:'POST',headers:{'content-type':'application/json',...headers},body});

test('every authored example satisfies the complete graph contract',()=>{
  for(const example of demoExamples()) {
    const simulation=createDemo(example.scenario);
    assert.equal(simulation.metadata.mode,'demo');
    assert.equal(simulation.nodes.length,6);
    assert.ok(SimulationResponseSchema.safeParse(simulation).success);
  }
});
test('model graph contracts reject duplicate nodes, dangling edges and missing sectors/personas',()=>{
  const original=createDemo(first.scenario);
  for(const mutate of [
    (s:typeof original)=>{s.nodes[1].id=s.nodes[0].id;},
    (s:typeof original)=>{s.edges[0].target='missing';},
    (s:typeof original)=>{s.edges[1].id=s.edges[0].id;},
    (s:typeof original)=>{s.sector_impacts=[];},
    (s:typeof original)=>{s.debate_participants=[];},
  ]) {const s=structuredClone(original);mutate(s);assert.equal(SimulationResponseSchema.safeParse(s).success,false);}
});
test('demo mode cannot instantiate external provider or database clients',()=>{
  assert.throws(()=>getGroqClient(),/disabled/);
  assert.throws(()=>getSupabaseAdmin(),/disabled/);
});
test('persisted parent, independent branch, debate and sector all use actual services',async()=>{
  const original=await runSimulation({scenario:first.scenario});
  assert.equal((await loadSimulation(original.simulation_id))?.title,original.title);
  const branch=await runMutation({simulation_id:original.simulation_id,mutation_prompt:first.branches[0],existing_state:{}});
  assert.equal(branch.simulation.metadata.parent_id,original.simulation_id);
  assert.notDeepEqual(branch.updated_nodes,original.nodes);
  assert.deepEqual((await loadSimulation(original.simulation_id))?.nodes,original.nodes);
  assert.deepEqual((await loadSimulation(branch.mutation_id))?.nodes,branch.updated_nodes);
  const debate=await runDebate({simulation_id:original.simulation_id,participants:[],existing_messages:[]});
  assert.ok(DebateSchema.safeParse(debate).success);
  const sector=await runSectorAnalysis({simulation_id:original.simulation_id,sector:original.sector_impacts[0].sector});
  assert.ok(sector.sub_sectors?.length);
  assert.equal((await listSimulations()).length,2);
  assert.ok((await readFile(join(directory,'notebooks.json'),'utf8')).includes(branch.mutation_id));
});
test('unsupported freeform demo questions and nested branches are refused honestly',async()=>{
  await assert.rejects(()=>runSimulation({scenario:'What if an unrelated thing happened?'}),/authored demo/);
  const original=await runSimulation({scenario:first.scenario});
  await assert.rejects(()=>runMutation({simulation_id:original.simulation_id,mutation_prompt:'anything else',existing_state:{}}),/authored branch/);
});
test('debate contract rejects unknown speakers',()=>{
  const s=createDemo(first.scenario);
  assert.equal(DebateSchema.safeParse({participants:s.debate_participants,messages:Array(3).fill({speaker_id:'unknown',message:'Hello',emotion:'neutral',stance_strength:0.5})}).success,false);
});
test('HTTP wrapper returns consistent validation errors before service work',async()=>{
  for(const body of ['null','[]','{}','{"scenario":5}','{"scenario":"hi"}','{"scenario":"valid question","duration_focus":"invalid"}','not json']) {
    const response=await POST(request(body));
    assert.equal(response.status,400,body);
    assert.equal((await response.json()).success,false);
  }
  assert.equal((await POST(request('x'.repeat(129*1024)))).status,413);
  assert.equal((await POST(request('{}',{'content-type':'text/plain'}))).status,415);
});
test('actual POST creates a notebook, adds bounded CORS and never reflects a foreign origin',async()=>{
  const response=await POST(request(JSON.stringify({scenario:first.scenario}),{origin:'http://localhost:5175'}));
  assert.equal(response.status,200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'),'http://localhost:5175');
  assert.equal(response.headers.get('cache-control'),'no-store');
  const foreign=await POST(request(JSON.stringify({scenario:first.scenario}),{origin:'https://untrusted.invalid'}));
  assert.equal(foreign.status,403);
  assert.equal(foreign.headers.get('Access-Control-Allow-Origin'),null);
  assert.equal((await options(new NextRequest('http://localhost/api/simulate',{method:'OPTIONS',headers:{origin:'http://localhost:5175'}}))).status,204);
});
test('live mode refuses missing/incorrect access keys and fails closed without the shared budget',async()=>{
  process.env.IFFY_MODE='live';
  try {
    delete process.env.IFFY_API_TOKEN;
    assert.throws(()=>requireAccess(request('{}')),/requires a private/);
    process.env.IFFY_API_TOKEN='synthetic-operator-passkey-32-characters';
    assert.throws(()=>requireAccess(request('{}')),/Enter the workspace/);
    requireAccess(request('{}',{authorization:`Bearer ${process.env.IFFY_API_TOKEN}`}));
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    await assert.rejects(()=>consumeGenerationBudget());
  } finally {process.env.IFFY_MODE='demo';delete process.env.IFFY_API_TOKEN;}
});
test('unknown runtime modes fail closed',()=>{
  process.env.IFFY_MODE='typo';
  try {assert.throws(runtimeMode,/must be demo or live/);}finally {process.env.IFFY_MODE='demo';}
});
test('disabling schema repairs returns a generation error without a provider call',()=>{
  const result=spawnSync(process.execPath,['--import','tsx','--input-type=module','--eval',`import {repairOutput} from './lib/ai/pipeline/repair.ts';import {z} from 'zod';try{await repairOutput({schema:z.object({ok:z.boolean()}),systemPrompt:'test',userPrompt:'test',endpoint:'test',badData:{},issues:['missing ok']});process.exit(2);}catch(error){if(error.statusCode!==502)process.exit(3);}`],{env:{...process.env,AI_MAX_RETRIES:'0'},encoding:'utf8',timeout:10_000});
  assert.equal(result.status,0,result.stderr);
});
