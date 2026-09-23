import { AppError } from './utils/errors';

export function runtimeMode(): 'demo' | 'live' {
  const mode = process.env.IFFY_MODE ?? 'demo';
  if (mode !== 'demo' && mode !== 'live') throw new AppError('configuration_error', 'IFFY_MODE must be demo or live.', 503);
  return mode;
}
