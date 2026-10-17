import { NextRequest } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/db";
import { User } from "@/models/User";
import { comparePassword, generateToken, buildSessionCookie } from "@/lib/auth";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";
import { checkRateLimit } from "@/lib/rate-limit";

const loginSchema = z.object({
  email: z.string().trim().email("Please provide a valid email address").toLowerCase(),
  password: z.string().min(1, "Password is required"),
});

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") || "local";
    const rateLimit = checkRateLimit(`login:${ip}`, 15, 60 * 1000);
    if (!rateLimit.allowed) {
      return errorResponse("Too many login attempts. Please try again in 1 minute.", 429);
    }

    const body = await request.json();
    const { email, password } = loginSchema.parse(body);

    await connectToDatabase();

    // Query user and explicitly select passwordHash
    const user = await User.findOne({ email }).select("+passwordHash");
    if (!user) {
      return errorResponse("Invalid email or password", 401, "INVALID_CREDENTIALS");
    }

    // Verify password hash
    const isValid = await comparePassword(password, user.passwordHash);
    if (!isValid) {
      return errorResponse("Invalid email or password", 401, "INVALID_CREDENTIALS");
    }

    // Generate JWT token
    const token = generateToken({
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
    });

    const userSafe = {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      sport: user.sport,
      coachId: user.coachId,
      createdAt: user.createdAt,
    };

    const response = successResponse({
      user: userSafe,
      message: "Login successful",
      token,
    });

    response.headers.set("Set-Cookie", buildSessionCookie(token));
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
