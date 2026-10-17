import { NextRequest } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/db";
import { authenticateRequest } from "@/lib/auth";
import { ReactionTestSession } from "@/models/ReactionTestSession";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";

const saveReactionSessionSchema = z.object({
  reactionTimes: z
    .array(
      z
        .number()
        .min(30, "Reaction time too low (< 30ms)")
        .max(10000, "Reaction time too high (> 10000ms)")
    )
    .min(1, "At least 1 valid reaction time required")
    .max(10, "Maximum 10 reaction times per session"),
  falseStartCount: z
    .number()
    .int()
    .min(0, "False start count cannot be negative")
    .max(50, "False start count exceeds reasonable limit")
    .default(0),
  completedRounds: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional(),
  inputMethod: z
    .enum(["mouse", "touch", "keyboard"])
    .optional()
    .default("mouse"),
  status: z
    .enum(["completed", "interrupted"])
    .optional()
    .default("completed"),
});

export async function POST(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request, ["athlete"]);
    if (!authResult.user) {
      return errorResponse(
        authResult.errorMessage || "Unauthorized",
        authResult.errorStatus || 401
      );
    }

    const athlete = authResult.user;
    const body = await request.json();
    const validated = saveReactionSessionSchema.parse(body);

    await connectToDatabase();

    // Server-side calculation to prevent fabrication of best or average records
    const bestTime = Math.min(...validated.reactionTimes);
    const averageTime = Math.round(
      validated.reactionTimes.reduce((sum, t) => sum + t, 0) /
        validated.reactionTimes.length
    );

    const session = await ReactionTestSession.create({
      athleteId: athlete._id,
      reactionTimes: validated.reactionTimes,
      averageTime,
      bestTime,
      falseStartCount: validated.falseStartCount,
      completedRounds: validated.completedRounds || validated.reactionTimes.length,
      inputMethod: validated.inputMethod,
      status: validated.status,
    });

    return successResponse(session, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request, ["athlete"]);
    if (!authResult.user) {
      return errorResponse(
        authResult.errorMessage || "Unauthorized",
        authResult.errorStatus || 401
      );
    }

    const athlete = authResult.user;
    const { searchParams } = new URL(request.url);
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));

    await connectToDatabase();

    const [sessions, total] = await Promise.all([
      ReactionTestSession.find({ athleteId: athlete._id })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
      ReactionTestSession.countDocuments({ athleteId: athlete._id }),
    ]);

    // Calculate all-time summary stats
    let allTimeBest = null;
    let overallAverage = null;

    if (sessions.length > 0) {
      const bestRecord = await ReactionTestSession.findOne({ athleteId: athlete._id })
        .sort({ bestTime: 1 })
        .select("bestTime")
        .lean();
      allTimeBest = bestRecord?.bestTime || null;

      const agg = await ReactionTestSession.aggregate([
        { $match: { athleteId: athlete._id } },
        { $group: { _id: null, avgScore: { $avg: "$averageTime" } } },
      ]);
      overallAverage = agg[0]?.avgScore ? Math.round(agg[0].avgScore) : null;
    }

    return successResponse({
      sessions,
      stats: {
        totalSessions: total,
        allTimeBest,
        overallAverage,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
