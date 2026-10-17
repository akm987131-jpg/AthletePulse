import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { connectToDatabase } from "@/lib/db";
import { authenticateRequest } from "@/lib/auth";
import { DailyLog } from "@/models/DailyLog";
import { User } from "@/models/User";
import { CoachFeedback } from "@/models/CoachFeedback";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";

const feedbackSchema = z.object({
  message: z.string().trim().optional(),
  comments: z.string().trim().optional(),
  activityModification: z.string().trim().optional(),
  recommendedAction: z.string().trim().optional(),
  status: z.string().optional(),
});

interface RouteParams {
  params: Promise<{ logId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { logId } = await params;
    if (!mongoose.Types.ObjectId.isValid(logId)) {
      return errorResponse("Log not found", 404, "NOT_FOUND");
    }

    const authResult = await authenticateRequest(request, ["coach"]);
    if (!authResult.user) {
      return errorResponse(
        authResult.errorMessage || "Unauthorized",
        authResult.errorStatus || 401
      );
    }

    const coach = authResult.user;
    const body = await request.json();
    const parsed = feedbackSchema.parse(body);

    const message = (parsed.message || parsed.comments || "").trim();
    if (!message) {
      return errorResponse("Feedback message is required (min 3 characters)", 400, "VALIDATION_ERROR");
    }

    const actionMap: Record<string, string> = {
      rest: "Full Rest - Discontinue training load until re-evaluated",
      modify: "Modify Volume - Scale down volume & avoid loading injury site",
      physio: "See Physio - Report to athletic trainer / physiotherapist",
      continue: "Continue Routine - Proceed with active recovery monitoring",
    };

    const activityModification = (
      parsed.activityModification ||
      (parsed.recommendedAction ? (actionMap[parsed.recommendedAction] || `Action: ${parsed.recommendedAction}`) : "Continue as planned")
    ).trim();

    await connectToDatabase();

    const log = await DailyLog.findById(logId);
    if (!log) {
      return errorResponse("Log not found", 404, "NOT_FOUND");
    }

    // Verify coach assignment or auto-link unassigned athlete to coach
    const athlete = await User.findById(log.athleteId);
    if (!athlete) {
      return errorResponse("Athlete not found for this log entry", 404, "NOT_FOUND");
    }

    if (!athlete.coachId || athlete.coachId.toString() !== coach._id.toString()) {
      athlete.coachId = coach._id;
      await athlete.save();
    }

    // Create feedback record without mutating original historical log entry
    const feedback = await CoachFeedback.create({
      athleteId: athlete._id,
      coachId: coach._id,
      logId: log._id,
      message,
      activityModification,
      acknowledgementStatus: "pending",
    });

    // Update log status to addressed and stamp review audit fields
    log.reviewStatus = "addressed";
    log.reviewedBy = coach._id;
    log.reviewedAt = new Date();
    await log.save();

    // Notify athlete of new feedback
    try {
      const { Notification } = await import("@/models/Notification");
      await Notification.create({
        recipientId: athlete._id,
        type: "new_feedback",
        title: `Coach guidance from ${coach.name}`,
        message: `Feedback: "${feedback.message.slice(0, 100)}" - Modification: "${feedback.activityModification.slice(0, 80)}"`,
        relatedFeedbackId: feedback._id,
        relatedLogId: log._id,
      });
    } catch (err) {
      console.warn("[Notification] Non-blocking notification creation failed:", err);
    }

    const populatedFeedback = await CoachFeedback.findById(feedback._id)
      .populate("coachId", "name email")
      .populate("athleteId", "name email");

    return successResponse(populatedFeedback, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
