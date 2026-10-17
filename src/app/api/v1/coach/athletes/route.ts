import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { authenticateRequest } from "@/lib/auth";
import { User } from "@/models/User";
import { DailyLog } from "@/models/DailyLog";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request, ["coach"]);
    if (!authResult.user) {
      return errorResponse(
        authResult.errorMessage || "Unauthorized",
        authResult.errorStatus || 401
      );
    }

    const coach = authResult.user;
    await connectToDatabase();

    // Find all athletes assigned to this coach (Head Coach oversees unassigned athletes as well)
    const coachFilter: any =
      coach.email === "coach@athletepulse.test"
        ? {
            role: "athlete",
            $or: [{ coachId: coach._id }, { coachId: { $exists: false } }, { coachId: null }],
          }
        : { coachId: coach._id, role: "athlete" };

    const athletes = await User.find(coachFilter)
      .select("name email sport createdAt")
      .sort({ name: 1 })
      .lean();

    // Fetch summary metrics for each athlete (total logs, pending reviews, last log)
    const athleteIds = athletes.map((a) => a._id);

    const [logsCountAggregate, pendingAggregate, lastLogs] = await Promise.all([
      DailyLog.aggregate([
        { $match: { athleteId: { $in: athleteIds } } },
        { $group: { _id: "$athleteId", totalLogs: { $sum: 1 } } },
      ]),
      DailyLog.aggregate([
        { $match: { athleteId: { $in: athleteIds }, reviewStatus: "pending" } },
        { $group: { _id: "$athleteId", pendingCount: { $sum: 1 } } },
      ]),
      DailyLog.aggregate([
        { $match: { athleteId: { $in: athleteIds } } },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: "$athleteId",
            lastLogDate: { $first: "$createdAt" },
            lastActivity: { $first: "$activity" },
            lastBodyPart: { $first: "$affectedBodyPart" },
            lastPriority: { $first: "$reviewPriority" },
          },
        },
      ]),
    ]);

    const totalLogsMap = new Map(
      logsCountAggregate.map((item) => [item._id.toString(), item.totalLogs])
    );
    const pendingMap = new Map(
      pendingAggregate.map((item) => [item._id.toString(), item.pendingCount])
    );
    const lastLogMap = new Map(
      lastLogs.map((item) => [item._id.toString(), item])
    );

    const athletesWithMetrics = athletes.map((athlete) => {
      const idStr = athlete._id.toString();
      const lastInfo = lastLogMap.get(idStr);
      return {
        ...athlete,
        totalLogs: totalLogsMap.get(idStr) || 0,
        pendingReviews: pendingMap.get(idStr) || 0,
        lastActive: lastInfo?.lastLogDate || null,
        lastActivity: lastInfo?.lastActivity || null,
        lastBodyPart: lastInfo?.lastBodyPart || null,
        lastPriority: lastInfo?.lastPriority || null,
      };
    });

    return successResponse(athletesWithMetrics);
  } catch (error) {
    return handleApiError(error);
  }
}
