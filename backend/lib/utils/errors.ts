import { NextResponse } from "next/server";

/* â”€â”€â”€ Error Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

export type AppErrorType =
  | "configuration_error"
  | "storage_error"
  | "unauthorized"
  | "forbidden"
  | "validation_error"       // Zod / schema failure
  | "ai_generation_error"    // Groq call failed completely
  | "ai_parse_error"         // Could not parse JSON from LLM
  | "rate_limit_error"       // Groq rate-limited us
  | "not_found"              // Requested resource doesn't exist
  | "bad_request"            // Malformed caller input
  | "internal_error";        // Catch-all

export class AppError extends Error {
  constructor(
    public readonly type: AppErrorType,
    message: string,
    public readonly statusCode: number = 500,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }
}

/* â”€â”€â”€ Response Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

/** Wraps a successful payload in the standard envelope. */
export function successResponse<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

/** Wraps an error in the standard error envelope from the PRD. */
export function errorResponse(
  type: AppErrorType,
  message: string,
  status = 500,
  details?: unknown
) {
  return NextResponse.json(
    {
      success: false,
      error: {
        type,
        message,
        ...(details ? { details } : {}),
      },
    },
    { status }
  );
}

/** Converts any caught value into a standard error response. */
export function handleApiError(err: unknown) {
  if (err instanceof AppError) {
    return errorResponse(err.type, err.message, err.statusCode, err.details);
  }

  if (err instanceof Error) {
    // Groq rate-limit check
    if (err.message.toLowerCase().includes("rate limit")) {
      return errorResponse("rate_limit_error", "AI rate limit reached. Please try again shortly.", 429);
    }
    return errorResponse("internal_error", "The request could not be completed. Check the server configuration and logs.", 500);
  }

  return errorResponse("internal_error", "An unexpected error occurred.", 500);
}

/* â”€â”€â”€ CORS Headers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

export function corsHeaders(): HeadersInit {
  const origin = process.env.CORS_ORIGIN ?? "http://localhost:5175";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

/** Handles OPTIONS pre-flight requests. */
export function handleOptions() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}
