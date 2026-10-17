import { NextRequest } from "next/server";
import { buildClearSessionCookie } from "@/lib/auth";
import { successResponse, handleApiError } from "@/lib/api-response";

export async function POST(request: NextRequest) {
  try {
    const response = successResponse({
      message: "Logged out successfully",
    });

    response.headers.set("Set-Cookie", buildClearSessionCookie());
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
