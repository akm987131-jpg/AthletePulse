import { NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";
import { User } from "@/models/User";

export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request);
    if (!authResult.user) {
      return errorResponse(
        authResult.errorMessage || "Unauthorized",
        authResult.errorStatus || 401
      );
    }

    const user = authResult.user;

    let coachDetails = null;
    if (user.role === "athlete" && user.coachId) {
      coachDetails = await User.findById(user.coachId).select("name email sport");
    }

    let athleteCount = 0;
    if (user.role === "coach") {
      athleteCount = await User.countDocuments({ coachId: user._id });
    }

    return successResponse({
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        sport: user.sport,
        coachId: user.coachId,
        coach: coachDetails,
        assignedAthleteCount: user.role === "coach" ? athleteCount : undefined,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
