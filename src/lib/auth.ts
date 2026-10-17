import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { env } from "./env";
import { connectToDatabase } from "./db";
import { User, IUser, UserRole } from "@/models/User";

export const SESSION_COOKIE_NAME = "athletepulse_session";
const SESSION_EXPIRATION_SECONDS = 7 * 24 * 60 * 60; // 7 days

export interface TokenPayload {
  userId: string;
  email: string;
  role: UserRole;
}

/**
 * Hash a plain text password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

/**
 * Compare plain text password with stored bcrypt hash
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generate a signed JWT session token
 */
export function generateToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.SESSION_SECRET, {
    expiresIn: SESSION_EXPIRATION_SECONDS,
  });
}

/**
 * Verify a JWT session token and return its decoded payload
 */
export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.SESSION_SECRET) as TokenPayload;
    if (!decoded || !decoded.userId || !decoded.role) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Extract token from either HttpOnly cookie or Authorization Bearer header
 */
export function extractTokenFromRequest(request: Request): string | null {
  // 1. Try reading from Authorization Bearer header (helpful for automated tests or API clients)
  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7).trim();
  }

  // 2. Try reading from cookie header directly
  const cookieHeader = request.headers.get("cookie");
  if (cookieHeader) {
    const match = cookieHeader.match(
      new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]*)`)
    );
    if (match && match[1]) {
      return decodeURIComponent(match[1]);
    }
  }

  return null;
}

/**
 * Resolve authenticated user from request session.
 * Never trusts client-supplied userIds or roles.
 */
export async function getSessionUser(request: Request): Promise<IUser | null> {
  const token = extractTokenFromRequest(request);
  if (!token) {
    return null;
  }

  const payload = verifyToken(token);
  if (!payload) {
    return null;
  }

  await connectToDatabase();
  const user = await User.findById(payload.userId);
  return user;
}

/**
 * Helper to require authentication and optionally check roles.
 * Returns the authenticated user or null.
 */
export async function authenticateRequest(
  request: Request,
  allowedRoles?: UserRole[]
): Promise<{ user: IUser | null; errorStatus?: number; errorMessage?: string }> {
  const user = await getSessionUser(request);
  if (!user) {
    return {
      user: null,
      errorStatus: 401,
      errorMessage: "Authentication required. Please log in.",
    };
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return {
      user: null,
      errorStatus: 403,
      errorMessage: `Access denied. Requires ${allowedRoles.join(" or ")} role.`,
    };
  }

  return { user };
}

/**
 * Build standard Cookie header for setting the session cookie
 */
export function buildSessionCookie(token: string): string {
  const isProd = env.NODE_ENV === "production";
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(
    token
  )}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_EXPIRATION_SECONDS}${
    isProd ? "; Secure" : ""
  }`;
}

/**
 * Build standard Cookie header for clearing the session cookie
 */
export function buildClearSessionCookie(): string {
  const isProd = env.NODE_ENV === "production";
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${
    isProd ? "; Secure" : ""
  }`;
}
