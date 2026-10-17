import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { authenticateRequest } from "@/lib/auth";
import { DailyLog } from "@/models/DailyLog";
import { CoachFeedback } from "@/models/CoachFeedback";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";

interface RouteParams {
  params: Promise<{ logId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
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
    await connectToDatabase();

    const log = await DailyLog.findById(logId)
      .populate("athleteId", "name email sport coachId")
      .populate("reviewedBy", "name email");

    if (!log) {
      return errorResponse("Log not found", 404, "NOT_FOUND");
    }

    const athlete: any = log.athleteId;
    if (!athlete || !athlete.coachId || athlete.coachId.toString() !== coach._id.toString()) {
      return errorResponse("Log not found or athlete not on your roster", 404, "NOT_FOUND");
    }

    // Also fetch any existing coach feedback attached to this log
    const feedbacks = await CoachFeedback.find({ logId: log._id })
      .populate("coachId", "name email")
      .sort({ createdAt: -1 });

    return successResponse({
      log,
      feedbacks,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
