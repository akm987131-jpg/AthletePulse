import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type BodySide = "left" | "right" | "bilateral" | "center" | "unspecified";

export type SymptomType =
  | "sharp_pain"
  | "dull_ache"
  | "tightness"
  | "stiffness"
  | "swelling"
  | "throbbing"
  | "soreness"
  | "weakness"
  | "numbness_tingling"
  | "other"
  | "none";

export type OnsetType =
  | "acute"
  | "gradual"
  | "insidious"
  | "post_workout"
  | "unknown";

export type ExtractionStatus =
  | "not_requested"
  | "pending"
  | "success"
  | "failed"
  | "fallback";

export type ReviewPriority = "urgent" | "high" | "medium" | "low";

export type ReviewStatus = "pending" | "reviewed" | "addressed" | "dismissed";

export interface IDailyLog extends Document {
  _id: Types.ObjectId;
  athleteId: Types.ObjectId;
  workoutDescription: string;
  discomfortText: string;
  activity: string;
  durationMinutes?: number;
  energyLevel?: number;
  fatigueLevel?: number;
  affectedBodyPart: string;
  bodySide: BodySide;
  symptomType: SymptomType;
  onset: OnsetType;
  reportedSeverity: number;
  extractionConfidence: number;
  extractionStatus: ExtractionStatus;
  reviewPriority: ReviewPriority;
  reviewStatus: ReviewStatus;
  triageFlags: string[];
  emergencyGuidance?: string;
  reviewNotes?: string;
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  idempotencyKey?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DailyLogSchema = new Schema<IDailyLog>(
  {
    athleteId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Athlete ID is required"],
      index: true,
    },
    workoutDescription: {
      type: String,
      required: [true, "Workout description is required"],
      maxlength: [2000, "Workout description cannot exceed 2000 characters"],
      trim: true,
    },
    discomfortText: {
      type: String,
      default: "",
      maxlength: [2000, "Discomfort report cannot exceed 2000 characters"],
      trim: true,
    },
    activity: {
      type: String,
      default: "general",
      trim: true,
      maxlength: [120, "Activity cannot exceed 120 characters"],
    },
    durationMinutes: {
      type: Number,
      min: [0, "Duration must be positive"],
      max: [1440, "Duration cannot exceed 24 hours"],
      default: null,
    },
    energyLevel: {
      type: Number,
      min: [1, "Energy level must be at least 1"],
      max: [10, "Energy level cannot exceed 10"],
      default: null,
    },
    fatigueLevel: {
      type: Number,
      min: [1, "Fatigue level must be at least 1"],
      max: [10, "Fatigue level cannot exceed 10"],
      default: null,
    },
    affectedBodyPart: {
      type: String,
      default: "unspecified",
      trim: true,
      lowercase: true,
    },
    bodySide: {
      type: String,
      enum: ["left", "right", "bilateral", "center", "unspecified"],
      default: "unspecified",
    },
    symptomType: {
      type: String,
      enum: [
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
      ],
      default: "none",
    },
    onset: {
      type: String,
      enum: ["acute", "gradual", "insidious", "post_workout", "unknown"],
      default: "unknown",
    },
    reportedSeverity: {
      type: Number,
      min: [0, "Reported severity must be between 0 and 10"],
      max: [10, "Reported severity must be between 0 and 10"],
      default: 0,
    },
    extractionConfidence: {
      type: Number,
      min: 0,
      max: 1,
      default: 0,
    },
    extractionStatus: {
      type: String,
      enum: ["not_requested", "pending", "success", "failed", "fallback"],
      default: "pending",
    },
    reviewPriority: {
      type: String,
      enum: ["urgent", "high", "medium", "low"],
      default: "low",
      index: true,
    },
    reviewStatus: {
      type: String,
      enum: ["pending", "reviewed", "addressed", "dismissed"],
      default: "pending",
      index: true,
    },
    triageFlags: {
      type: [String],
      default: [],
    },
    emergencyGuidance: {
      type: String,
      default: null,
    },
    reviewNotes: {
      type: String,
      default: "",
      maxlength: [1000, "Review notes cannot exceed 1000 characters"],
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    idempotencyKey: {
      type: String,
      sparse: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes as required by data access patterns
DailyLogSchema.index({ athleteId: 1, createdAt: -1 });
DailyLogSchema.index({ reviewPriority: 1, reviewStatus: 1, createdAt: -1 });
DailyLogSchema.index({ athleteId: 1, affectedBodyPart: 1 });

export const DailyLog: Model<IDailyLog> =
  mongoose.models.DailyLog ||
  mongoose.model<IDailyLog>("DailyLog", DailyLogSchema);
