import { getRoute, options } from '../../../../lib/api';
import { AppError } from '../../../../lib/utils/errors';
export const GET=getRoute(async()=>{throw new AppError('not_found','Community and marketplace are historical prototypes, not active features.',501);});
export const POST=GET;
export const OPTIONS=options;
