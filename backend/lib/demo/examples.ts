import { randomUUID } from 'node:crypto';
import { SimulationResponse, SimulationResponseSchema } from '../schemas/simulation.schema';
import { AppError } from '../utils/errors';

// Authored teaching examples. Scores and personas illustrate assumptions; no
// model, research study or measured forecast is represented by these fixtures.
const cases = [
  {
    id:'workweek', category:'Work & society', title:'The four-day question',
    scenario:'What if a four-day workweek became the standard?',
    summary:'A shorter week changes more than the calendar. Follow the tension between recovery, business coverage and the people whose work cannot simply fit into fewer days.',
    assumption:'Weekly pay stays the same. Hours fall rather than being compressed. Adoption starts with office-based employers.',
    branch:'Public services receive funding to hire extra staff',
    branchSummary:'Extra public-service staffing improves coverage and access, while shifting the trade-off toward public budgets and recruitment capacity.',
    nodes:[
      ['Work & recovery','More time to recover','Less time at work can create room for sleep, caring and life outside a job. Work intensification could erase that gain.',38,55,48],
      ['Business','Output per hour','Teams reconsider meetings and handovers. Output depends on the work and on whether tasks can actually be removed.',12,32,25],
      ['Public services','Coverage gaps','Hospitals, transport and other continuous services still need staffing across the week. A shorter week does not remove that need.',-35,-25,-12],
      ['Households','Uneven access','Office staff may gain flexibility before shift workers, carers and people with several jobs. Benefits could widen existing gaps.',-18,-28,-22],
      ['Local economy','A different Friday','An extra free day may move spending toward local leisure, while commuter businesses lose some demand.',5,18,22],
      ['Public services','Hiring pressure','Maintaining coverage with fewer hours may require more people. Recruitment and training take time.',-32,-18,8],
    ],
    voices:[['Maya','Shift nurse','conflicted','Recovery matters, but somebody still has to cover Friday. A shorter week without more staff could make each shift harder.'],['Dev','Small-business owner','opposed','I need reliable coverage for customers. A trial with measurable service targets would tell me more than a universal promise.'],['Sam','Labour researcher','supportive','The design matters: protect pay, track workload and include workers whose jobs cannot move to a laptop.']],
  },
  {
    id:'city', category:'Cities & climate', title:'A city beyond the car',
    scenario:'What if the city centre became car-free?',
    summary:'Reclaiming streets can change air, trade and everyday movement. The same policy can make a neighbourhood easier to visit for one person and harder for another.',
    assumption:'Emergency vehicles and essential deliveries are exempt. The initial zone covers the central business district.',
    branch:'Frequent accessible buses launch before the car-free zone',
    branchSummary:'An accessible bus service improves access before restrictions begin. Its operating costs and the quality of connections become central to the outcome.',
    nodes:[
      ['Environment','Quieter, cleaner streets','Less through traffic could reduce local noise and exhaust. Traffic may move to streets beyond the boundary.',35,52,60],
      ['Local business','Changing footfall','More space for walking may help some shops. Businesses serving car-dependent customers face a transition.',-12,18,32],
      ['Accessibility','Who can get here?','People with limited mobility, night workers and residents beyond good transit need usable alternatives and exemptions.',-40,-25,-10],
      ['Transport','Pressure on transit','Buses and trains must absorb journeys that cannot shift to walking or cycling. Reliability shapes acceptance.',-30,-15,20],
      ['Public space','Space for people','Road space can become crossings, seating or shade if the city funds and maintains it.',18,40,55],
      ['Transport','Deliveries adapt','Loading windows and small delivery hubs may help, but add coordination and transition costs.',-22,-8,18],
    ],
    voices:[['Ari','Shopkeeper','conflicted','A pleasant street is good for trade, but I need a credible delivery plan and a way for existing customers to reach us.'],['Noor','Access advocate','opposed','A car-free boundary is not automatically accessible. Step-free transit and practical exemptions need to come first.'],['Leo','Transport planner','supportive','Measure the surrounding streets too. Moving congestion outside the zone would not make the whole city better.']],
  },
  {
    id:'education', category:'Education & opportunity', title:'When tuition disappears',
    scenario:'What if public university tuition became free?',
    summary:'Removing fees changes who can consider university. Capacity, living costs and funding decide whether a wider invitation becomes a wider opportunity.',
    assumption:'The policy covers tuition at public institutions. Housing, transport and living costs are initially unchanged.',
    branch:'Living-cost grants are added for lower-income students',
    branchSummary:'Targeted living-cost grants remove a second barrier to attendance, while increasing funding needs and the importance of fair eligibility rules.',
    nodes:[
      ['Access','More applications','Lower fees can encourage applicants who previously ruled university out. Places and preparation still matter.',40,55,48],
      ['Universities','Capacity under strain','More applications do not automatically create teaching staff, laboratories or places to live.',-30,-38,-15],
      ['Households','Living costs remain','Rent, transport and lost earnings can still prevent attendance, even when the tuition bill is gone.',-32,-26,-20],
      ['Public finance','A new funding commitment','Public funding replaces tuition revenue. Its reliability and what it displaces shape long-term outcomes.',-35,-28,-18],
      ['Employment','Different study choices','Less tuition debt may let students choose courses with lower immediate earnings. Job outcomes remain uncertain.',12,25,42],
      ['Universities','Teaching quality','Per-student resources can fall if enrolment grows faster than funding. Expansion needs a staffing plan.',-18,-30,5],
    ],
    voices:[['Ira','Prospective student','supportive','Removing tuition would help, but I would still need a way to pay rent without working full-time.'],['Alex','University lecturer','conflicted','More access is welcome. Larger classes without staff or facilities would undermine the experience students were promised.'],['Rae','Public-budget analyst','opposed','A universal subsidy needs a durable funding source. Compare it with targeted support and publish who actually benefits.']],
  },
] as const;

export function demoExamples() {
  return cases.map(c=>({id:c.id,category:c.category,title:c.title,scenario:c.scenario,assumption:c.assumption,branches:[c.branch]}));
}
export function createDemo(scenario:string, focus='all'):SimulationResponse {
  const c=cases.find(c=>c.scenario.toLowerCase()===scenario.trim().toLowerCase());
  if(!c) throw new AppError('bad_request','The authored demo covers three examples. Choose one from the library; use configured live mode for your own question.',422);
  const systems=[...new Set(c.nodes.map(n=>n[0]))];
  const nodes=c.nodes.map((n,i)=>({id:`n${i+1}`,label:n[1],description:n[2],impact_score:n[4],impact_direction:n[4]>0?'positive':'negative',confidence:0.6,duration:{immediate:n[3],short_term:n[4],long_term:n[5]},tags:[n[0]]}));
  const pairs=[[0,1],[1,2],[2,3],[3,4],[4,5],[0,3],[1,5]];
  return SimulationResponseSchema.parse({
    simulation_id:randomUUID(),title:c.title,summary:c.summary,systems,nodes,
    edges:pairs.map(([a,b],i)=>({id:`e${i+1}`,source:nodes[a].id,target:nodes[b].id,relationship:'transform',strength:0.6,explanation:`Changes in ${nodes[a].label.toLowerCase()} can affect ${nodes[b].label.toLowerCase()}; the outcome depends on the policy's design and resources.`})),
    timeline:Object.fromEntries(['immediate','short_term','long_term'].map((key,i)=>[key,[{title:['The adjustment','The adaptation','The open question'][i],description:[`Start with the assumption: ${c.assumption}`,'Watch how institutions, households and businesses adapt; early benefits and costs may be distributed unevenly.','Revisit the original assumptions. Lasting effects depend on funding, access and the response of the wider system.'][i],impact_level:35+i*15,affected_systems:systems}]])),
    sector_impacts:systems.slice(0,4).map(sector=>{const related=nodes.filter(n=>n.tags.includes(sector));return {sector,overview:related.map(n=>n.description).join(' '),positive_effects:['An opportunity to redesign services around the people who use them.'],negative_effects:['Transition costs and uneven access need explicit attention.'],metrics:[{name:'Illustrative change',direction:'increase',magnitude:35,confidence:0.6}],ripple_effects:['Resources moved here may change what is available elsewhere.'],confidence_score:0.6};}),
    debate_participants:c.voices.map((v,i)=>({id:`p${i+1}`,name:v[0],role:v[1],stance:v[2],biases:['Views the policy through their own role'],personality:'Constructive and specific',concerns:['Who bears the transition cost?'],goals:['A workable and fair outcome']})),
    metadata:{scenario:c.scenario,duration_focus:focus,generated_at:new Date().toISOString(),model:'authored-demo-v1',mode:'demo',example_id:c.id,assumption:c.assumption},
  });
}
export function branchDemo(original:SimulationResponse,prompt:string):SimulationResponse {
  const c=cases.find(c=>c.id===original.metadata.example_id);
  if(!c || prompt!==c.branch || original.metadata.parent_id) throw new AppError('bad_request','Choose the authored branch for an original demo example. Arbitrary or nested branches require live mode.',422);
  const changed=structuredClone(original);
  changed.simulation_id=randomUUID(); changed.title=`${c.title} · alternative`; changed.summary=c.branchSummary;
  changed.metadata={...original.metadata,parent_id:original.simulation_id,mutation_prompt:prompt,generated_at:new Date().toISOString()};
  for(const i of [2,3]) {
    changed.nodes[i].duration={immediate:12,short_term:28,long_term:35};
    changed.nodes[i].impact_score=28; changed.nodes[i].impact_direction='positive';
    changed.nodes[i].description=`${prompt}. This authored alternative assumes that support reaches the people described here; implementation and sustained funding still matter.`;
  }
  changed.timeline.short_term=[{title:'Support changes the trade-off',description:c.branchSummary,impact_level:55,affected_systems:changed.systems}];
  changed.sector_impacts=changed.sector_impacts.map(s=>({...s,overview:`${s.overview} Alternative assumption: ${c.branchSummary}`}));
  return SimulationResponseSchema.parse(changed);
}
export function demoDebate(simulation:SimulationResponse, continuation?:string) {
  const c=cases.find(c=>c.id===simulation.metadata.example_id)!;
  return {debate_id:randomUUID(),participants:simulation.debate_participants,messages:c.voices.map((v,i)=>({speaker_id:`p${i+1}`,message:continuation?`On the follow-up: ${v[3]} This is an authored perspective; it does not evaluate a new question.`:v[3],emotion:'skeptical' as const,stance_strength:0.65}))};
}
