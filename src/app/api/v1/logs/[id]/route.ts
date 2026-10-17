import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { connectToDatabase } from "@/lib/db";
import { authenticateRequest } from "@/lib/auth";
import { DailyLog } from "@/models/DailyLog";
import { User } from "@/models/User";
import { computeTriageAndSafety } from "@/services/ai_service";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";

const patchLogSchema = z.object({
  // Athlete editable fields
  workoutDescription: z.string().trim().min(3).max(2000).optional(),
  discomfortText: z.string().trim().max(2000).optional(),
  affectedBodyPart: z.string().trim().toLowerCase().optional(),
  bodySide: z.enum(["left", "right", "bilateral", "center", "unspecified"]).optional(),
  symptomType: z
    .enum([
      "sharp_pain",
      "dull_ache",
      "tightness",
      "stiffness",
      "swelling",
      "throbbing",
      "soreness",
      "weakness",
      "numbness_tingling",
      "other",
      "none",
    ])
    .optional(),
  reportedSeverity: z.number().min(0).max(10).optional(),

  // Coach editable fields
  reviewStatus: z.enum(["pending", "reviewed", "addressed", "dismissed"]).optional(),
  reviewNotes: z.string().trim().max(1000).optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse("Log not found", 404, "NOT_FOUND");
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

    const log = await DailyLog.findById(id)
      .populate("athleteId", "name email sport coachId")
      .populate("reviewedBy", "name email");

    if (!log) {
      return errorResponse("Log not found", 404, "NOT_FOUND");
    }

    const logAthlete: any = log.athleteId;

    // Athlete can only view their own log
    if (user.role === "athlete") {
      if (logAthlete._id.toString() !== user._id.toString()) {
        return errorResponse("Log not found", 404, "NOT_FOUND");
      }
    }

    // Coach can only view logs from an athlete assigned to them
    if (user.role === "coach") {
      if (!logAthlete.coachId || logAthlete.coachId.toString() !== user._id.toString()) {
        return errorResponse("Log not found", 404, "NOT_FOUND");
      }
    }

    return successResponse(log);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse("Log not found", 404, "NOT_FOUND");
    }

    const authResult = await authenticateRequest(request);
    if (!authResult.user) {
      return errorResponse(
        authResult.errorMessage || "Unauthorized",
        authResult.errorStatus || 401
      );
    }

    const user = authResult.user;
    const body = await request.json();
    const validated = patchLogSchema.parse(body);

    await connectToDatabase();

    const log = await DailyLog.findById(id);
    if (!log) {
      return errorResponse("Log not found", 404, "NOT_FOUND");
    }

    // Authorization & field permissions
    if (user.role === "athlete") {
      if (log.athleteId.toString() !== user._id.toString()) {
        return errorResponse("Log not found", 404, "NOT_FOUND");
      }

      // Athlete can only update log details & discomfort fields
      if (validated.workoutDescription !== undefined) log.workoutDescription = validated.workoutDescription;
      if (validated.discomfortText !== undefined) log.discomfortText = validated.discomfortText;
      if (validated.affectedBodyPart !== undefined) log.affectedBodyPart = validated.affectedBodyPart;
      if (validated.bodySide !== undefined) log.bodySide = validated.bodySide;
      if (validated.symptomType !== undefined) log.symptomType = validated.symptomType;
      if (validated.reportedSeverity !== undefined) log.reportedSeverity = validated.reportedSeverity;

      // Re-evaluate triage flags if text or symptoms changed
      const triage = computeTriageAndSafety(
        log.discomfortText,
        log.workoutDescription,
        {
          affectedBodyPart: log.affectedBodyPart,
          bodySide: log.bodySide,
          symptomType: log.symptomType,
          onset: log.onset,
          reportedSeverity: log.reportedSeverity,
          activity: log.activity,
          confidence: log.extractionConfidence,
        }
      );
      log.reviewPriority = triage.reviewPriority;
      log.triageFlags = triage.triageFlags;
      log.emergencyGuidance = triage.emergencyGuidance || undefined;
    } else if (user.role === "coach") {
      // Check coach assignment to this athlete
      const athlete = await User.findById(log.athleteId);
      if (!athlete || !athlete.coachId || athlete.coachId.toString() !== user._id.toString()) {
        return errorResponse("Log not found", 404, "NOT_FOUND");
      }

      // Coach can update review status and review notes
      if (validated.reviewStatus !== undefined) {
        log.reviewStatus = validated.reviewStatus;
        log.reviewedBy = user._id;
        log.reviewedAt = new Date();
      }
      if (validated.reviewNotes !== undefined) {
        log.reviewNotes = validated.reviewNotes;
      }
    }

    await log.save();

    const updatedLog = await DailyLog.findById(id)
      .populate("athleteId", "name email sport")
      .populate("reviewedBy", "name email");

    return successResponse(updatedLog, 200);
  } catch (error) {
    return handleApiError(error);
  }
}
