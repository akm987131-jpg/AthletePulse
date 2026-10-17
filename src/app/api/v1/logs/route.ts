import { NextRequest } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/db";
import { authenticateRequest } from "@/lib/auth";
import { DailyLog, BodySide, SymptomType, OnsetType } from "@/models/DailyLog";
import { extractSymptomFields } from "@/services/ai_service";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";

function normalizeBodySide(value?: string): BodySide {
  if (!value) return "unspecified";
  const normalized = value.toLowerCase().trim();
  if (
    normalized === "left" ||
    normalized === "right" ||
    normalized === "bilateral" ||
    normalized === "center" ||
    normalized === "unspecified"
  ) {
    return normalized;
  }
  if (normalized.includes("both")) return "bilateral";
  if (normalized.includes("left")) return "left";
  if (normalized.includes("right")) return "right";
  if (normalized.includes("center") || normalized.includes("middle")) return "center";
  return "unspecified";
}

function normalizeSymptomType(value?: string): SymptomType {
  if (!value) return "soreness";
  const normalized = value.toLowerCase().trim().replace(/[\s-]+/g, "_");
  const validSymptoms: SymptomType[] = [
    "sharp_pain",
    "dull_ache",
    "tightness",
    "stiffness",
    "swelling",
    "throbbing",
    "soreness",
    "weakness",
    "numbness_tingling",
    "other",
    "none",
  ];
  if (validSymptoms.includes(normalized as SymptomType)) {
    return normalized as SymptomType;
  }
  if (normalized.includes("sharp") || normalized.includes("stab")) return "sharp_pain";
  if (normalized.includes("dull") || normalized.includes("ache")) return "dull_ache";
  if (normalized.includes("tight") || normalized.includes("cramp")) return "tightness";
  if (normalized.includes("stiff")) return "stiffness";
  if (normalized.includes("swell")) return "swelling";
  if (normalized.includes("throbb")) return "throbbing";
  if (normalized.includes("weak")) return "weakness";
  if (normalized.includes("numb") || normalized.includes("tingl")) return "numbness_tingling";
  if (normalized.includes("sore")) return "soreness";
  return "other";
}

function normalizeOnsetType(value?: string): OnsetType {
  if (!value) return "acute";
  const normalized = value.toLowerCase().trim().replace(/[\s-]+/g, "_");
  const validOnsets: OnsetType[] = [
    "acute",
    "gradual",
    "insidious",
    "post_workout",
    "unknown",
  ];
  if (validOnsets.includes(normalized as OnsetType)) {
    return normalized as OnsetType;
  }
  if (
    normalized.includes("post") ||
    normalized.includes("exercise") ||
    normalized.includes("workout")
  ) {
    return "post_workout";
  }
  if (normalized.includes("gradual") || normalized.includes("slow")) return "gradual";
  if (normalized.includes("insidious")) return "insidious";
  if (normalized.includes("acute") || normalized.includes("sudden")) return "acute";
  return "unknown";
}

const createLogSchema = z.object({
  workoutDescription: z
    .string()
    .trim()
    .min(3, "Workout description must be at least 3 characters")
    .max(2000, "Workout description cannot exceed 2000 characters"),
  discomfortText: z
    .string()
    .trim()
    .max(2000, "Discomfort report cannot exceed 2000 characters")
    .optional()
    .default(""),
  activity: z.string().trim().max(120).optional(),
  affectedBodyPart: z.string().trim().optional(),
  bodySide: z.string().trim().optional(),
  symptomType: z.string().trim().optional(),
  onset: z.string().trim().optional(),
  durationMinutes: z.number().min(0).max(1440).optional(),
  energyLevel: z.number().min(1).max(10).optional(),
  fatigueLevel: z.number().min(1).max(10).optional(),
  reportedSeverity: z
    .number()
    .min(0, "Reported severity must be 0 or higher")
    .max(10, "Reported severity must be 10 or lower")
    .optional()
    .default(0),
  idempotencyKey: z.string().trim().max(100).optional(),
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
    const validated = createLogSchema.parse(body);

    await connectToDatabase();

    // Idempotency check: prevent duplicate submissions if client retried with same key
    if (validated.idempotencyKey) {
      const existing = await DailyLog.findOne({
        athleteId: athlete._id,
        idempotencyKey: validated.idempotencyKey,
      });
      if (existing) {
        return successResponse(existing, 200);
      }
    }

    // Run AI or rule-based extraction & safety triage
    const { extracted, triage, extractionStatus } = await extractSymptomFields(
      validated.workoutDescription,
      validated.discomfortText,
      validated.reportedSeverity
    );

    // Resolve final fields: use AI extraction if identified; otherwise fallback to athlete's selected input
    const finalBodyPart =
      extracted.affectedBodyPart && extracted.affectedBodyPart !== "unspecified"
        ? extracted.affectedBodyPart
        : (validated.affectedBodyPart || "unspecified");

    const finalBodySide: BodySide =
      extracted.bodySide && extracted.bodySide !== "unspecified"
        ? extracted.bodySide
        : normalizeBodySide(validated.bodySide);

    const finalSymptom: SymptomType =
      extracted.symptomType && extracted.symptomType !== "none"
        ? extracted.symptomType
        : normalizeSymptomType(validated.symptomType);

    const finalOnset: OnsetType =
      extracted.onset && extracted.onset !== "unknown"
        ? extracted.onset
        : normalizeOnsetType(validated.onset);

    // Save DailyLog in MongoDB (preserve original text completely unchanged)
    const newLog = await DailyLog.create({
      athleteId: athlete._id,
      workoutDescription: validated.workoutDescription,
      discomfortText: validated.discomfortText,
      activity: validated.activity || extracted.activity,
      durationMinutes: validated.durationMinutes,
      energyLevel: validated.energyLevel,
      fatigueLevel: validated.fatigueLevel,
      affectedBodyPart: finalBodyPart,
      bodySide: finalBodySide,
      symptomType: finalSymptom,
      onset: finalOnset,
      reportedSeverity: extracted.reportedSeverity || validated.reportedSeverity || 0,
      extractionConfidence: extracted.confidence,
      extractionStatus,
      reviewPriority: triage.reviewPriority,
      reviewStatus: "pending",
      triageFlags: triage.triageFlags,
      emergencyGuidance: triage.emergencyGuidance || undefined,
      idempotencyKey: validated.idempotencyKey,
    });

    // Ensure athlete is linked to a coach so reports flow directly to coach triage queue
    let targetCoachId = athlete.coachId;
    if (!targetCoachId) {
      const { User } = await import("@/models/User");
      const headCoach = await User.findOne({ role: "coach", email: "coach@athletepulse.test" });
      if (headCoach) {
        targetCoachId = headCoach._id;
        await User.updateOne({ _id: athlete._id }, { $set: { coachId: headCoach._id } });
      }
    }

    // Notify assigned coach if applicable
    if (targetCoachId) {
      try {
        const { Notification } = await import("@/models/Notification");
        await Notification.create({
          recipientId: targetCoachId,
          type: "new_report",
          title: `New log from ${athlete.name}`,
          message: `Logged: "${validated.workoutDescription.slice(0, 80)}"${
            validated.discomfortText ? ` (Reported: ${validated.discomfortText.slice(0, 60)})` : ""
          }`,
          relatedLogId: newLog._id,
        });
      } catch (err) {
        console.warn("[Notification] Non-blocking notification creation failed:", err);
      }
    }

    return successResponse(newLog, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
