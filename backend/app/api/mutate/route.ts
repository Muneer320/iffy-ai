import { MutateRequestSchema } from '../../../lib/requests';
import { runMutation } from '../../../lib/services/mutation.service';
import { postRoute, options } from '../../../lib/api';
export const POST=postRoute(MutateRequestSchema,(req) => runMutation({...req,existing_state:req.existing_state ? {...req.existing_state} : {}}));
export const OPTIONS=options;
