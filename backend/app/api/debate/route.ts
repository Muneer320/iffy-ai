import { DebateRequestSchema } from '../../../lib/requests';
import { runDebate } from '../../../lib/services/debate.service';
import { postRoute, options } from '../../../lib/api';
export const POST=postRoute(DebateRequestSchema,runDebate);
export const OPTIONS=options;
