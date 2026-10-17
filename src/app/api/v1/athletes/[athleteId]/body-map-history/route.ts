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

    const authResult = await authenticateRequest(request);
    if (!authResult.user) {
      return errorResponse(
        authResult.errorMessage || "Unauthorized",
        authResult.errorStatus || 401
      );
    }

    const currentUser = authResult.user;
    await connectToDatabase();

    const targetAthlete = await User.findById(athleteId).select("name email sport coachId");
    if (!targetAthlete || targetAthlete.role !== "athlete") {
      return errorResponse("Athlete not found", 404, "NOT_FOUND");
    }

    // Role-based authorization:
    // Athlete can only view their own body map history
    if (currentUser.role === "athlete") {
      if (currentUser._id.toString() !== targetAthlete._id.toString()) {
        return errorResponse("Athlete not found", 404, "NOT_FOUND");
      }
    }

    // Coach can only view an athlete assigned to their roster
    if (currentUser.role === "coach") {
      if (
        !targetAthlete.coachId ||
        targetAthlete.coachId.toString() !== currentUser._id.toString()
      ) {
        return errorResponse("Athlete not found or not on your roster", 404, "NOT_FOUND");
      }
    }

    // Aggregate body map history from recorded logs
    const bodyMapAggregation = await DailyLog.aggregate([
      {
        $match: {
          athleteId: targetAthlete._id,
          affectedBodyPart: { $nin: ["unspecified", "none", ""] },
        },
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: {
            bodyPart: "$affectedBodyPart",
            side: "$bodySide",
          },
          reportCount: { $sum: 1 },
          highestSeverity: { $max: "$reportedSeverity" },
          latestSeverity: { $first: "$reportedSeverity" },
          latestSymptomType: { $first: "$symptomType" },
          symptomTypes: { $addToSet: "$symptomType" },
          firstReportedDate: { $last: "$createdAt" },
          lastReportedDate: { $first: "$createdAt" },
          recentEntries: {
            $push: {
              logId: "$_id",
              activity: "$activity",
              symptomType: "$symptomType",
              reportedSeverity: "$reportedSeverity",
              reviewPriority: "$reviewPriority",
              createdAt: "$createdAt",
            },
          },
        },
      },
      { $sort: { reportCount: -1, lastReportedDate: -1 } },
    ]);

    const formattedHistory = bodyMapAggregation.map((item) => ({
      bodyPart: item._id.bodyPart,
      side: item._id.side,
      reportCount: item.reportCount,
      highestSeverity: item.highestSeverity,
      latestSeverity: item.latestSeverity,
      latestSymptomType: item.latestSymptomType,
      symptomTypes: item.symptomTypes.filter((s: string) => s !== "none"),
      firstReportedDate: item.firstReportedDate,
      lastReportedDate: item.lastReportedDate,
      recentEntries: item.recentEntries.slice(0, 5),
    }));

    const totalLogs = await DailyLog.countDocuments({ athleteId: targetAthlete._id });

    return successResponse({
      athlete: {
        _id: targetAthlete._id,
        name: targetAthlete.name,
        sport: targetAthlete.sport,
      },
      disclaimer: "Body map symptom history reflects athlete-reported discomfort patterns, not clinical diagnoses.",
      totalLogsRecorded: totalLogs,
      bodyPartHotspots: formattedHistory,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
