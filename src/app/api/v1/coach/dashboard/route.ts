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
    const { searchParams } = new URL(request.url);

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "10", 10)));
    const timeframeDays = Math.max(1, parseInt(searchParams.get("timeframeDays") || "30", 10));
    const skip = (page - 1) * limit;

    await connectToDatabase();

    // 1. Get all athletes assigned to this coach (Head Coach Marcus oversees all team athletes)
    const coachFilter: any =
      coach.email === "coach@athletepulse.test"
        ? {
            role: "athlete",
            $or: [{ coachId: coach._id }, { coachId: { $exists: false } }, { coachId: null }],
          }
        : { coachId: coach._id, role: "athlete" };

    const assignedAthletes = await User.find(coachFilter)
      .select("_id name email sport")
      .lean();

    const athleteIds = assignedAthletes.map((a) => a._id);

    if (athleteIds.length === 0) {
      return successResponse(
        {
          counts: {
            totalAssignedAthletes: 0,
            pendingReviewsCount: 0,
            flaggedLogsCount: 0,
          },
          symptomPatterns: {
            timeframeDays,
            disclaimer: "Pattern in reported symptoms (not a predicted injury)",
            patterns: [],
          },
          logsQueue: [],
        },
        200,
        {
          page: 1,
          limit,
          total: 0,
          totalPages: 1,
        }
      );
    }

    // 2. Compute key dashboard counts
    const [pendingCount, flaggedCount] = await Promise.all([
      DailyLog.countDocuments({
        athleteId: { $in: athleteIds },
        reviewStatus: "pending",
      }),
      DailyLog.countDocuments({
        athleteId: { $in: athleteIds },
        reviewStatus: "pending",
        reviewPriority: { $in: ["urgent", "high"] },
      }),
    ]);

    // 3. Compute recurring reported symptom patterns over timeframe
    const timeframeDate = new Date();
    timeframeDate.setDate(timeframeDate.getDate() - timeframeDays);

    const recurringAggregation = await DailyLog.aggregate([
      {
        $match: {
          athleteId: { $in: athleteIds },
          createdAt: { $gte: timeframeDate },
          affectedBodyPart: { $nin: ["unspecified", "none", ""] },
        },
      },
      {
        $group: {
          _id: "$affectedBodyPart",
          totalReports: { $sum: 1 },
          affectedAthletes: { $addToSet: "$athleteId" },
          symptomTypes: { $addToSet: "$symptomType" },
          averageSeverity: { $avg: "$reportedSeverity" },
          urgentCount: {
            $sum: { $cond: [{ $eq: ["$reviewPriority", "urgent"] }, 1, 0] },
          },
        },
      },
      { $sort: { totalReports: -1 } },
      { $limit: 8 },
    ]);

    const recurringReportedAreas = recurringAggregation.map((item) => ({
      bodyPart: item._id,
      reportCount: item.totalReports,
      distinctAthleteCount: item.affectedAthletes.length,
      reportedSymptomTypes: item.symptomTypes.filter((s: string) => s !== "none"),
      averageSeverity: Math.round(item.averageSeverity * 10) / 10,
      urgentReportsCount: item.urgentCount,
    }));

    // 4. Prioritized Logs Queue: Urgent human-review flags first, then other pending reviews, then recent logs
    const prioritizedPipeline: any[] = [
      { $match: { athleteId: { $in: athleteIds } } },
      {
        $addFields: {
          sortRank: {
            $switch: {
              branches: [
                {
                  case: {
                    $and: [
                      { $eq: ["$reviewStatus", "pending"] },
                      { $eq: ["$reviewPriority", "urgent"] },
                    ],
                  },
                  then: 100,
                },
                {
                  case: {
                    $and: [
                      { $eq: ["$reviewStatus", "pending"] },
                      { $eq: ["$reviewPriority", "high"] },
                    ],
                  },
                  then: 80,
                },
                {
                  case: {
                    $and: [
                      { $eq: ["$reviewStatus", "pending"] },
                      { $eq: ["$reviewPriority", "medium"] },
                    ],
                  },
                  then: 60,
                },
                {
                  case: {
                    $and: [
                      { $eq: ["$reviewStatus", "pending"] },
                      { $eq: ["$reviewPriority", "low"] },
                    ],
                  },
                  then: 40,
                },
              ],
              default: 10,
            },
          },
        },
      },
      { $sort: { sortRank: -1, createdAt: -1 } },
      {
        $facet: {
          data: [
            { $skip: skip },
            { $limit: limit },
            {
              $lookup: {
                from: "users",
                localField: "athleteId",
                foreignField: "_id",
                as: "athlete",
              },
            },
            { $unwind: "$athlete" },
            {
              $project: {
                _id: 1,
                athleteId: 1,
                athleteName: "$athlete.name",
                athleteSport: "$athlete.sport",
                workoutDescription: 1,
                discomfortText: 1,
                activity: 1,
                affectedBodyPart: 1,
                bodySide: 1,
                symptomType: 1,
                reportedSeverity: 1,
                reviewPriority: 1,
                reviewStatus: 1,
                triageFlags: 1,
                emergencyGuidance: 1,
                createdAt: 1,
              },
            },
          ],
          totalCount: [{ $count: "count" }],
        },
      },
    ];

    const [queueResult] = await DailyLog.aggregate(prioritizedPipeline);
    const logsQueue = queueResult.data || [];
    const totalLogs = queueResult.totalCount?.[0]?.count || 0;

    return successResponse(
      {
        counts: {
          totalAssignedAthletes: athleteIds.length,
          pendingReviewsCount: pendingCount,
          flaggedLogsCount: flaggedCount,
        },
        symptomPatterns: {
          timeframeDays,
          disclaimer: "Pattern in reported symptoms (not a predicted injury)",
          patterns: recurringReportedAreas,
        },
        logsQueue,
      },
      200,
      {
        page,
        limit,
        total: totalLogs,
        totalPages: Math.ceil(totalLogs / limit) || 1,
      }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
