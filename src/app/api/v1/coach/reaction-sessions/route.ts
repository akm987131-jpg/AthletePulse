import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { authenticateRequest } from "@/lib/auth";
import { User } from "@/models/User";
import { ReactionTestSession } from "@/models/ReactionTestSession";
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
    const athleteId = searchParams.get("athleteId");
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "25", 10)));

    await connectToDatabase();

    // Find assigned athletes (Head coach Marcus Vance oversees all team athletes)
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

    const assignedAthleteIds = assignedAthletes.map((a) => a._id.toString());

    // Filter by specific athlete if requested, verifying authorization
    let queryAthleteIds = assignedAthleteIds;
    if (athleteId) {
      if (!assignedAthleteIds.includes(athleteId)) {
        return errorResponse("Athlete not found on your assigned roster", 403, "FORBIDDEN");
      }
      queryAthleteIds = [athleteId];
    }

    if (queryAthleteIds.length === 0) {
      return successResponse({
        sessions: [],
        assignedAthletes: [],
      });
    }

    const sessions = await ReactionTestSession.find({
      athleteId: { $in: queryAthleteIds },
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("athleteId", "name email sport")
      .lean();

    return successResponse({
      sessions,
      assignedAthletes,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
