import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { authenticateRequest } from "@/lib/auth";
import { CoachFeedback } from "@/models/CoachFeedback";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";

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

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "10", 10)));
    const skip = (page - 1) * limit;

    const acknowledgementStatus = searchParams.get("acknowledgementStatus");
    const query: any = { athleteId: athlete._id };
    if (acknowledgementStatus) {
      query.acknowledgementStatus = acknowledgementStatus;
    }

    await connectToDatabase();

    const [feedbacks, total] = await Promise.all([
      CoachFeedback.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("coachId", "name email sport")
        .populate("logId", "workoutDescription discomfortText activity affectedBodyPart reportedSeverity createdAt")
        .lean(),
      CoachFeedback.countDocuments(query),
    ]);

    return successResponse(feedbacks, 200, {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
