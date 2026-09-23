import { getRoute, options } from '../../../lib/api';
import { demoExamples } from '../../../lib/demo/examples';
export const GET=getRoute(async()=>demoExamples(),true);
export const OPTIONS=options;
