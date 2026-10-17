import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { authenticateRequest } from "@/lib/auth";
import { Notification } from "@/models/Notification";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request);
    if (!authResult.user) {
      return errorResponse(
        authResult.errorMessage || "Unauthorized",
        authResult.errorStatus || 401
      );
    }

    const user = authResult.user;
    await connectToDatabase();

    const [notifications, unreadCount] = await Promise.all([
      Notification.find({ recipientId: user._id })
        .sort({ createdAt: -1 })
        .limit(30)
        .lean(),
      Notification.countDocuments({
        recipientId: user._id,
        readAt: null,
      }),
    ]);

    return successResponse({
      unreadCount,
      notifications,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
