import { getRoute, options } from '../../../lib/api';
import { listSimulations } from '../../../lib/storage';
export const GET=getRoute(async()=>listSimulations());
export const OPTIONS=options;
