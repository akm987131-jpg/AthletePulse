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

    // Verify athlete is assigned to this coach
    const athlete = await User.findOne({
      _id: athleteId,
      coachId: coach._id,
      role: "athlete",
    }).select("name email sport");

    if (!athlete) {
      return errorResponse("Athlete not found or not assigned to your roster", 404, "NOT_FOUND");
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "10", 10)));
    const skip = (page - 1) * limit;

    const reviewStatus = searchParams.get("reviewStatus");
    const query: any = { athleteId: athlete._id };
    if (reviewStatus) {
      query.reviewStatus = reviewStatus;
    }

    const [logs, total] = await Promise.all([
      DailyLog.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("reviewedBy", "name email")
        .lean(),
      DailyLog.countDocuments(query),
    ]);

    return successResponse(
      {
        athlete,
        logs,
      },
      200,
      {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
