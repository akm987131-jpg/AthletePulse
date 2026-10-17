import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { authenticateRequest } from "@/lib/auth";
import { User } from "@/models/User";
import { DailyLog } from "@/models/DailyLog";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";

interface RouteParams {
  params: Promise<{ athleteId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { athleteId } = await params;
    if (!mongoose.Types.ObjectId.isValid(athleteId)) {
      return errorResponse("Athlete not found", 404, "NOT_FOUND");
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

    // Verify athlete is on this coach's roster
    const athlete = await User.findOne({
      _id: athleteId,
      coachId: coach._id,
      role: "athlete",
    }).select("name email sport");

    if (!athlete) {
      return errorResponse("Athlete not found or not on your roster", 404, "NOT_FOUND");
    }

    const { searchParams } = new URL(request.url);
    const timeframeDays = Math.max(1, parseInt(searchParams.get("timeframeDays") || "30", 10));

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - timeframeDays);

    // Group logs by affected body part to identify recurring patterns
    const timelineLogs = await DailyLog.find({
      athleteId: athlete._id,
      createdAt: { $gte: sinceDate },
      affectedBodyPart: { $nin: ["unspecified", "none", ""] },
    })
      .sort({ createdAt: -1 })
      .lean();

    // Group by body part
    const groupedByArea: Record<string, any[]> = {};
    for (const log of timelineLogs) {
      const area = log.affectedBodyPart;
      if (!groupedByArea[area]) {
        groupedByArea[area] = [];
      }
      groupedByArea[area].push({
        logId: log._id,
        date: log.createdAt,
        activity: log.activity,
        bodySide: log.bodySide,
        symptomType: log.symptomType,
        reportedSeverity: log.reportedSeverity,
        reviewPriority: log.reviewPriority,
        reviewStatus: log.reviewStatus,
        workoutDescription: log.workoutDescription,
        discomfortText: log.discomfortText,
        triageFlags: log.triageFlags,
      });
    }

    const recurringComplaints = Object.entries(groupedByArea).map(
      ([bodyPart, reports]) => ({
        bodyPart,
        occurrenceCount: reports.length,
        isRecurring: reports.length >= 2,
        timeframeDays,
        reports,
      })
    );

    // Sort by most frequently reported areas first
    recurringComplaints.sort((a, b) => b.occurrenceCount - a.occurrenceCount);

    return successResponse({
      athlete,
      timeframeDays,
      disclaimer:
        "Recurring complaint history describes recorded athlete discomfort reports over time; it does not constitute a clinical diagnosis or predicted injury.",
      totalDiscomfortReports: timelineLogs.length,
      recurringComplaints,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
