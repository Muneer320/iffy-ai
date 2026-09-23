import { getRoute, options } from '../../../lib/api';
import { runtimeMode } from '../../../lib/runtime';
export const GET=getRoute(async()=>({mode:runtimeMode(),storage:runtimeMode()==='demo'?'local-file':'supabase',version:'1'}),true);
export const OPTIONS=options;
