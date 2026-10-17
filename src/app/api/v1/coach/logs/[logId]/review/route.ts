import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { connectToDatabase } from "@/lib/db";
import { authenticateRequest } from "@/lib/auth";
import { DailyLog } from "@/models/DailyLog";
import { User } from "@/models/User";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";

const reviewSchema = z.object({
  reviewStatus: z.enum(["reviewed", "addressed", "dismissed", "pending"]),
  reviewNotes: z.string().trim().max(1000).optional(),
});

interface RouteParams {
  params: Promise<{ logId: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
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
    const { reviewStatus, reviewNotes } = reviewSchema.parse(body);

    await connectToDatabase();

    const log = await DailyLog.findById(logId);
    if (!log) {
      return errorResponse("Log not found", 404, "NOT_FOUND");
    }

    // Verify coach assignment
    const athlete = await User.findById(log.athleteId);
    if (!athlete || !athlete.coachId || athlete.coachId.toString() !== coach._id.toString()) {
      return errorResponse("Log not found or athlete not on your roster", 404, "NOT_FOUND");
    }

    log.reviewStatus = reviewStatus;
    if (reviewNotes !== undefined) {
      log.reviewNotes = reviewNotes;
    }
    log.reviewedBy = coach._id;
    log.reviewedAt = new Date();

    await log.save();

    const updatedLog = await DailyLog.findById(logId)
      .populate("athleteId", "name email sport")
      .populate("reviewedBy", "name email");

    return successResponse(updatedLog, 200);
  } catch (error) {
    return handleApiError(error);
  }
}
