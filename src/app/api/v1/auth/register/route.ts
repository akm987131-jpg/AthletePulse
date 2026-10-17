import { NextRequest } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { User } from "@/models/User";
import { hashPassword, generateToken, buildSessionCookie } from "@/lib/auth";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";
import { checkRateLimit } from "@/lib/rate-limit";

// Zod schema for registration validation
const registerSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  email: z.string().trim().email("Please provide a valid email address").toLowerCase(),
  password: z.string().min(8, "Password must be at least 8 characters long"),
  role: z.enum(["athlete", "coach"]).default("athlete"),
  sport: z.string().trim().max(80).optional(),
  coachId: z
    .string()
    .refine((val) => mongoose.Types.ObjectId.isValid(val), "Invalid coach ID format")
    .optional(),
});

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") || "local";
    const rateLimit = checkRateLimit(`register:${ip}`, 10, 60 * 1000);
    if (!rateLimit.allowed) {
      return errorResponse("Too many registration attempts. Please try again shortly.", 429);
    }

    const body = await request.json();
    const validatedData = registerSchema.parse(body);

    await connectToDatabase();

    // Check if user already exists
    const existingUser = await User.findOne({ email: validatedData.email });
    if (existingUser) {
      return errorResponse("An account with this email already exists", 409, "EMAIL_EXISTS");
    }

    // If an athlete specifies a coachId, ensure the coach exists and has role='coach'
    let assignedCoachId: mongoose.Types.ObjectId | undefined = undefined;
    if (validatedData.role === "athlete" && validatedData.coachId) {
      const coach = await User.findById(validatedData.coachId);
      if (!coach || coach.role !== "coach") {
        return errorResponse("The specified coach was not found or is not a registered coach", 400, "INVALID_COACH");
      }
      assignedCoachId = coach._id;
    } else if (validatedData.role === "athlete") {
      // Default to Head Coach Marcus Vance so athletes are never orphaned
      const defaultCoach = await User.findOne({ role: "coach", email: "coach@athletepulse.test" });
      if (defaultCoach) {
        assignedCoachId = defaultCoach._id;
      }
    }

    // Secure password hashing
    const passwordHash = await hashPassword(validatedData.password);

    // Create user in MongoDB
    const newUser = await User.create({
      name: validatedData.name,
      email: validatedData.email,
      passwordHash,
      role: validatedData.role,
      sport: validatedData.sport,
      coachId: assignedCoachId,
    });

    // Create session token and build Set-Cookie header
    const token = generateToken({
      userId: newUser._id.toString(),
      email: newUser.email,
      role: newUser.role,
    });

    const userSafe = {
      _id: newUser._id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      sport: newUser.sport,
      coachId: newUser.coachId,
      createdAt: newUser.createdAt,
    };

    const response = successResponse(
      {
        user: userSafe,
        message: "Account created successfully",
        token, // Included for API clients; HttpOnly cookie is also set
      },
      201
    );

    response.headers.set("Set-Cookie", buildSessionCookie(token));
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
