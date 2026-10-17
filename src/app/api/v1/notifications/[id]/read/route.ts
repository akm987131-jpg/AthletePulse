import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { authenticateRequest } from "@/lib/auth";
import { Notification } from "@/models/Notification";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse("Notification not found", 404, "NOT_FOUND");
    }

    const authResult = await authenticateRequest(request);
    if (!authResult.user) {
      return errorResponse(
        authResult.errorMessage || "Unauthorized",
        authResult.errorStatus || 401
      );
    }

    const user = authResult.user;
    await connectToDatabase();

    const notification = await Notification.findOne({
      _id: id,
      recipientId: user._id,
    });

    if (!notification) {
      return errorResponse("Notification not found", 404, "NOT_FOUND");
    }

    notification.readAt = new Date();
    await notification.save();

    return successResponse(notification, 200);
  } catch (error) {
    return handleApiError(error);
  }
}
