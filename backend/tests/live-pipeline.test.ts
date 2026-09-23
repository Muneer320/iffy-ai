import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDemo, demoExamples } from '../lib/demo/examples';
import { runSimulation } from '../lib/services/simulation.service';
import { runMutation } from '../lib/services/mutation.service';
import { runDebate } from '../lib/services/debate.service';
import { consumeGenerationBudget } from '../lib/api';
import { simulationCache } from '../lib/utils/cache';

process.env.IFFY_MODE='live';
process.env.GROQ_API_KEY='synthetic-test-key';
process.env.NEXT_PUBLIC_SUPABASE_URL='https://synthetic.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-service-key';
const fixture=createDemo(demoExamples()[0].scenario);
let responses:unknown[]=[];
let calls=0,budgets=0,allow=true,persistenceError=false;
let budgetReplies:boolean[]=[];
const stored=new Map<string,typeof fixture>();
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
// Exercise the real SDKs and services, replacing only network transport.
globalThis.fetch=async(input,init)=>{
  const url=String(input instanceof Request?input.url:input);
  if(url.startsWith('https://synthetic.supabase.co/rest/v1/rpc/iffy_consume_generation_budget')) {budgets++;return reply(budgetReplies.length?budgetReplies.shift():allow);}
  if(url.startsWith('https://synthetic.supabase.co/rest/v1/simulations')) {
    if(init?.method==='POST') {if(persistenceError)return reply({message:'synthetic write failure',code:'failure'},500);const s=JSON.parse(String(init.body));stored.set(s.id,s.simulation_json);return new Response(null,{status:201});}
    const id=new URL(url).searchParams.get('id')?.replace('eq.','');return reply(id&&stored.has(id)?{simulation_json:stored.get(id)}:null);
  }
  if(url.startsWith('https://synthetic.supabase.co/rest/v1/debates')) return new Response(null,{status:201});
  if(url==='https://api.groq.com/openai/v1/chat/completions') {calls++;assert.ok(responses.length,'Unexpected provider attempt');return reply({choices:[{message:{content:JSON.stringify(responses.shift())}}],usage:{total_tokens:1}});}
  throw new Error(`Unexpected network request refused: ${new URL(url).origin}`);
};

test('live pipeline repairs an invalid graph, restores trusted metadata and persists the result',async()=>{
  const invalid=structuredClone(fixture);invalid.edges[0].target='missing';
  responses=[invalid,fixture];
  const result=await runSimulation({scenario:'Synthetic repair pipeline test question'});
  assert.equal(calls,2);assert.equal(budgets,2);
  assert.equal(result.metadata.mode,'live');
  assert.equal(result.metadata.scenario,'Synthetic repair pipeline test question');
  assert.notEqual(result.simulation_id,fixture.simulation_id);
  assert.ok(stored.has(result.simulation_id));
  assert.equal(result.nodes.length,6);
});
test('shared generation exhaustion stops before a provider request',async()=>{
  const before=calls;allow=false;
  try{await assert.rejects(()=>consumeGenerationBudget(),/exhausted/);assert.equal(calls,before);}finally{allow=true;}
});
test('a failed persistence response is not presented as a saved simulation',async()=>{
  responses=[fixture];persistenceError=true;
  try{await assert.rejects(()=>runSimulation({scenario:'Synthetic persistence failure question'}),/could not be saved/);}finally{persistenceError=false;}
});
test('budget exhaustion during a repair remains 429 and makes no further provider attempt',async()=>{
  const invalid=structuredClone(fixture);invalid.edges[0].target='missing';
  responses=[invalid];budgetReplies=[true,false];const before=calls;
  await assert.rejects(()=>runSimulation({scenario:'Synthetic exhausted repair quota question'}),(error:unknown)=>(error as {statusCode?:number}).statusCode===429);
  assert.equal(calls,before+1);assert.equal(responses.length,0);assert.equal(budgetReplies.length,0);
});
test('live branches merge deltas, persist independent graphs and keep their parent unchanged',async()=>{
  const original=[...stored.values()][0];
  const changed={...original.nodes[0],impact_score:42};
  responses=[{divergence_nodes:[changed.id],new_nodes:[],modified_node_ids:[changed.id],modified_nodes:[{id:changed.id,impact_score:42}],updated_edges:original.edges,updated_timeline:original.timeline,updated_sector_impacts:original.sector_impacts,mutation_summary:'A synthetic alternative with a different assumption.'}];
  const result=await runMutation({simulation_id:original.simulation_id,existing_state:{},mutation_prompt:'Add a targeted support programme'});
  assert.equal(result.updated_nodes[0].impact_score,42);
  assert.equal(result.simulation.metadata.parent_id,original.simulation_id);
  assert.equal(stored.get(original.simulation_id)?.nodes[0].impact_score,original.nodes[0].impact_score);
  assert.ok(stored.has(result.mutation_id));
});
test('live debate checks real personas and rejects unknown message authors',async()=>{
  const original=[...stored.values()][0];
  responses=[{messages:[{speaker_id:'unknown',message:'A synthetic response.',emotion:'neutral',stance_strength:0.5}]}];
  await assert.rejects(()=>runDebate({simulation_id:original.simulation_id,participants:original.debate_participants,existing_messages:[{speaker_id:'p1',message:'A starting comment.',emotion:'neutral',stance_strength:0.5}]}),/unknown speaker/);
});
test('prompt cache distinguishes case-sensitive subjects',()=>{assert.notEqual(simulationCache.key('What if US policy changed?'),simulationCache.key('What if us policy changed?'));});
