import { NextResponse } from "next/server";
import { ZodError } from "zod";

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  pagination?: PaginationMeta;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    message: string;
    code?: string;
    details?: any;
  };
}

/**
 * Returns a standardized JSON success response
 */
export function successResponse<T>(
  data: T,
  status: number = 200,
  pagination?: PaginationMeta
) {
  const payload: ApiSuccessResponse<T> = {
    success: true,
    data,
    ...(pagination ? { pagination } : {}),
  };
  return NextResponse.json(payload, { status });
}

/**
 * Returns a standardized JSON error response
 */
export function errorResponse(
  message: string,
  status: number = 400,
  code?: string,
  details?: any
) {
  const payload: ApiErrorResponse = {
    success: false,
    error: {
      message,
      ...(code ? { code } : {}),
      ...(details ? { details } : {}),
    },
  };
  return NextResponse.json(payload, { status });
}

/**
 * Global API error handler for catching unhandled exceptions in routes
 */
export function handleApiError(error: unknown) {
  console.error("[API Error Caught]:", error);

  if (error instanceof ZodError) {
    return errorResponse(
      "Validation failed",
      400,
      "VALIDATION_ERROR",
      error.issues.map((err) => ({
        field: err.path.join("."),
        message: err.message,
      }))
    );
  }

  if (error instanceof Error) {
    // Handle typical MongoDB duplicate key error (code 11000)
    if ((error as any).code === 11000) {
      return errorResponse("A record with that key already exists", 409, "DUPLICATE_KEY");
    }

    // Generic safe error message (do not expose internal server traces)
    return errorResponse(
      error.message || "An unexpected server error occurred",
      500,
      "INTERNAL_SERVER_ERROR"
    );
  }

  return errorResponse("An unknown error occurred", 500, "UNKNOWN_ERROR");
}
