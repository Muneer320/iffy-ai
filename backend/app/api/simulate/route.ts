import { SimulateRequestSchema } from '../../../lib/requests';
import { runSimulation } from '../../../lib/services/simulation.service';
import { postRoute, options } from '../../../lib/api';
export const POST=postRoute(SimulateRequestSchema,runSimulation);
export const OPTIONS=options;
