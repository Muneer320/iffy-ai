import { SectorRequestSchema } from '../../../lib/requests';
import { runSectorAnalysis } from '../../../lib/services/sector.service';
import { postRoute, options } from '../../../lib/api';
export const POST=postRoute(SectorRequestSchema,runSectorAnalysis);
export const OPTIONS=options;
