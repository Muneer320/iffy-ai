import { getRoute, options } from '../../../../lib/api';
import { loadSimulation } from '../../../../lib/storage';
import { AppError } from '../../../../lib/utils/errors';
import { z } from 'zod';
export const GET=getRoute(async request=>{const id=request.nextUrl.pathname.split('/').pop();if(!z.string().uuid().safeParse(id).success) throw new AppError('bad_request','Invalid notebook ID.',400);const saved=await loadSimulation(id!);if(!saved)throw new AppError('not_found','Notebook not found.',404);return saved;});
export const OPTIONS=options;
