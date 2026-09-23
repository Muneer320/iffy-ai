import { createHash, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { runtimeMode } from './runtime';
import { AppError, handleApiError } from './utils/errors';
import { getSupabaseAdmin } from './supabase/client';

const MAX_BODY = 128 * 1024;
let demoWindow = { start:0, count:0 };
function originAllowed(request: Request) {
  const origin = request.headers.get('origin');
  const allowed = process.env.CORS_ORIGIN ?? 'http://localhost:5175';
  if (allowed === '*' || (origin && origin !== allowed)) throw new AppError('forbidden', 'This origin is not allowed.', 403);
}
function decorate(response: NextResponse, request: Request) {
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Vary', 'Origin');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  const allowed = process.env.CORS_ORIGIN ?? 'http://localhost:5175';
  if (request.headers.get('origin') === allowed && allowed !== '*') response.headers.set('Access-Control-Allow-Origin', allowed);
  return response;
}
export function requireAccess(request: Request) {
  originAllowed(request);
  if (runtimeMode() === 'demo') return;
  const token = process.env.IFFY_API_TOKEN ?? '';
  if (token.length < 32) throw new AppError('configuration_error', 'Live mode requires a private workspace passkey of at least 32 characters.', 503);
  const supplied = request.headers.get('authorization') ?? '';
  if (supplied.length > 512 || !timingSafeEqual(createHash('sha256').update(supplied).digest(), createHash('sha256').update(`Bearer ${token}`).digest())) throw new AppError('unauthorized', 'Enter the workspace passkey to use live mode.', 401);
}
export async function consumeGenerationBudget() {
  if (runtimeMode() !== 'live') return;
  // Each actual model attempt, including repairs, consumes both shared budgets.
  try {
    const { data, error } = await getSupabaseAdmin().rpc('iffy_consume_generation_budget');
    if (error) throw new Error('Budget unavailable');
    if (data !== true) throw new AppError('rate_limit_error', 'The workspace generation budget is exhausted. Try again later.', 429);
  } catch(error) {
    if(error instanceof AppError) throw error;
    throw new AppError('configuration_error', 'The shared generation budget is unavailable. Apply migration 002 before enabling live mode.', 503);
  }
}
async function readBody(request: Request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new AppError('bad_request', 'Use Content-Type: application/json.', 415);
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY) throw new AppError('bad_request', 'Request body exceeds 128 KiB.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError('bad_request', 'A JSON object is required.', 400);
  const chunks: Uint8Array[]=[]; let size=0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY) { await reader.cancel(); throw new AppError('bad_request', 'Request body exceeds 128 KiB.', 413); }
      chunks.push(value);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new AppError('bad_request', 'Malformed JSON.', 400); }
  } finally { reader.releaseLock(); }
}
export function postRoute<T>(schema: z.ZodType<T>, action: (body: T) => Promise<unknown>) {
  return async (request: NextRequest) => {
    try {
      requireAccess(request);
      if (runtimeMode() === 'demo') {
        if (Date.now()-demoWindow.start >= 60_000) demoWindow={start:Date.now(),count:0};
        if (++demoWindow.count > 60) throw new AppError('rate_limit_error', 'Demo request budget reached. Wait a minute.', 429);
      }
      const parsed=schema.safeParse(await readBody(request));
      if (!parsed.success) throw new AppError('bad_request', 'Check the request fields.', 400, parsed.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`));
      return decorate(NextResponse.json({success:true,data:await action(parsed.data)}),request);
    } catch(error) {
      const response=decorate(handleApiError(error),request);
      if(response.status===429) response.headers.set('Retry-After','60');
      return response;
    }
  };
}
export function getRoute(action: (request: NextRequest) => Promise<unknown>, publicRoute=false) {
  return async (request: NextRequest) => {
    try { if(!publicRoute) requireAccess(request); return decorate(NextResponse.json({success:true,data:await action(request)}),request); }
    catch(error) { return decorate(handleApiError(error),request); }
  };
}
export async function options(request: NextRequest) {
  try {
    originAllowed(request);
    const response=decorate(new NextResponse(null,{status:204}),request);
    response.headers.set('Access-Control-Allow-Methods','GET, POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers','Content-Type, Authorization');
    return response;
  } catch(error) { return decorate(handleApiError(error),request); }
}
