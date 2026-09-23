import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { SimulationResponse, SimulationResponseSchema } from './schemas/simulation.schema';
import { getSupabaseAdmin } from './supabase/client';
import { runtimeMode } from './runtime';
import { AppError } from './utils/errors';

type Store = { simulations: Record<string, SimulationResponse>; debates: Record<string, unknown> };
const shared = globalThis as typeof globalThis & { iffyStore?: { serial: Promise<unknown> } };
const state = shared.iffyStore ??= { serial: Promise.resolve() };
const directory = () => resolve(/*turbopackIgnore: true*/ process.env.IFFY_DATA_DIR ?? '.local-data');
async function readStore(): Promise<Store> {
  try { return JSON.parse(await readFile(join(directory(), 'notebooks.json'), 'utf8')); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { simulations: {}, debates: {} };
    throw new AppError('storage_error', 'The local notebook could not be read. Preserve the data file and inspect the server logs.', 503);
  }
}
async function updateStore(change: (data: Store) => void) {
  const job = state.serial.then(async () => {
    const data = await readStore();
    change(data);
    await mkdir(directory(), { recursive: true });
    const destination = join(directory(), 'notebooks.json');
    await writeFile(destination + '.tmp', JSON.stringify(data), { mode: 0o600 });
    await rename(destination + '.tmp', destination);
  });
  state.serial = job.catch(() => {});
  await job;
}
export async function saveSimulation(simulation: SimulationResponse) {
  const parsed = SimulationResponseSchema.parse(simulation);
  if (runtimeMode() === 'demo') {
    await updateStore(data => {
      if (Object.keys(data.simulations).length >= 250) throw new AppError('storage_error', 'This demo notebook is full. Export your work before resetting its data volume.', 507);
      data.simulations[parsed.simulation_id] = parsed;
    });
    return;
  }
  const { error } = await getSupabaseAdmin().from('simulations').upsert({ id: parsed.simulation_id, title: parsed.title, scenario: parsed.metadata.scenario, simulation_json: parsed });
  if (error) throw new AppError('storage_error', 'The simulation could not be saved.', 503);
}
export async function loadSimulation(id: string): Promise<SimulationResponse | null> {
  if (runtimeMode() === 'demo') { await state.serial; return (await readStore()).simulations[id] ?? null; }
  const { data, error } = await getSupabaseAdmin().from('simulations').select('simulation_json').eq('id', id).maybeSingle();
  if (error) throw new AppError('storage_error', 'The simulation could not be loaded.', 503);
  return data ? SimulationResponseSchema.parse(data.simulation_json) : null;
}
export async function listSimulations() {
  let simulations: SimulationResponse[];
  if (runtimeMode() === 'demo') { await state.serial; simulations = Object.values((await readStore()).simulations); }
  else {
    const { data, error } = await getSupabaseAdmin().from('simulations').select('simulation_json').order('created_at', { ascending: false }).limit(250);
    if (error) throw new AppError('storage_error', 'The notebook could not be loaded.', 503);
    simulations = (data ?? []).map(row => SimulationResponseSchema.parse(row.simulation_json));
  }
  return simulations.sort((a,b) => b.metadata.generated_at.localeCompare(a.metadata.generated_at)).map(s => ({ simulation_id:s.simulation_id, title:s.title, metadata:s.metadata }));
}
export async function saveDebate(id: string, simulationId: string, debate: unknown) {
  if (runtimeMode() === 'demo') { await updateStore(data => { data.debates[simulationId] = debate; }); return; }
  const { error } = await getSupabaseAdmin().from('debates').insert({ id, simulation_id:simulationId, messages:(debate as {messages:unknown}).messages });
  if (error) throw new AppError('storage_error', 'The debate could not be saved.', 503);
}
