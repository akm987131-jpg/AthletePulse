import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { authenticateRequest } from "@/lib/auth";
import { CoachFeedback } from "@/models/CoachFeedback";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";

interface RouteParams {
  params: Promise<{ feedbackId: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { feedbackId } = await params;
    if (!mongoose.Types.ObjectId.isValid(feedbackId)) {
      return errorResponse("Feedback not found", 404, "NOT_FOUND");
    }

    const authResult = await authenticateRequest(request, ["athlete"]);
    if (!authResult.user) {
      return errorResponse(
        authResult.errorMessage || "Unauthorized",
        authResult.errorStatus || 401
      );
    }

    const athlete = authResult.user;
    await connectToDatabase();

    const feedback = await CoachFeedback.findById(feedbackId);
    if (!feedback) {
      return errorResponse("Feedback not found", 404, "NOT_FOUND");
    }

    // Athlete can only acknowledge their own feedback
    if (feedback.athleteId.toString() !== athlete._id.toString()) {
      return errorResponse("Feedback not found", 404, "NOT_FOUND");
    }

    feedback.acknowledgementStatus = "acknowledged";
    feedback.acknowledgedAt = new Date(); // Consistent UTC timestamp
    await feedback.save();

    // Notify coach that feedback has been acknowledged
    try {
      const { Notification } = await import("@/models/Notification");
      await Notification.create({
        recipientId: feedback.coachId,
        type: "feedback_acknowledged",
        title: `${athlete.name} acknowledged feedback`,
        message: `${athlete.name} confirmed receipt of your training modification instructions.`,
        relatedFeedbackId: feedback._id,
        relatedLogId: feedback.logId,
      });
    } catch (err) {
      console.warn("[Notification] Non-blocking notification creation failed:", err);
    }

    const populated = await CoachFeedback.findById(feedback._id)
      .populate("coachId", "name email sport")
      .populate("logId", "workoutDescription discomfortText activity affectedBodyPart reportedSeverity");

    return successResponse(populated, 200);
  } catch (error) {
    return handleApiError(error);
  }
}

export const POST = PATCH;

