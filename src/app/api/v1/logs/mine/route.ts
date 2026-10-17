import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { authenticateRequest } from "@/lib/auth";
import { DailyLog } from "@/models/DailyLog";
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

    const reviewStatus = searchParams.get("reviewStatus");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const search = searchParams.get("search");

    // Build filter query scoped strictly to the authenticated athlete
    const query: any = { athleteId: athlete._id };

    if (reviewStatus) {
      query.reviewStatus = reviewStatus;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }

    if (search) {
      query.$or = [
        { workoutDescription: { $regex: search, $options: "i" } },
        { discomfortText: { $regex: search, $options: "i" } },
        { affectedBodyPart: { $regex: search, $options: "i" } },
      ];
    }

    await connectToDatabase();

    const [logs, total] = await Promise.all([
      DailyLog.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("reviewedBy", "name email")
        .lean(),
      DailyLog.countDocuments(query),
    ]);

    return successResponse(logs, 200, {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
