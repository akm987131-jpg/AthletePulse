import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type AcknowledgementStatus = "pending" | "acknowledged";

export interface ICoachFeedback extends Document {
  _id: Types.ObjectId;
  athleteId: Types.ObjectId;
  coachId: Types.ObjectId;
  logId: Types.ObjectId;
  message: string;
  activityModification: string;
  acknowledgementStatus: AcknowledgementStatus;
  acknowledgedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CoachFeedbackSchema = new Schema<ICoachFeedback>(
  {
    athleteId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Athlete ID is required"],
      index: true,
    },
    coachId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Coach ID is required"],
      index: true,
    },
    logId: {
      type: Schema.Types.ObjectId,
      ref: "DailyLog",
      required: [true, "Log ID is required"],
      index: true,
    },
    message: {
      type: String,
      required: [true, "Feedback message is required"],
      trim: true,
      maxlength: [2000, "Feedback message cannot exceed 2000 characters"],
    },
    activityModification: {
      type: String,
      default: "Continue as planned",
      trim: true,
      maxlength: [1000, "Activity modification cannot exceed 1000 characters"],
    },
    acknowledgementStatus: {
      type: String,
      enum: ["pending", "acknowledged"],
      default: "pending",
      index: true,
    },
    acknowledgedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
CoachFeedbackSchema.index({ athleteId: 1, createdAt: -1 });
CoachFeedbackSchema.index({ athleteId: 1, acknowledgementStatus: 1 });
CoachFeedbackSchema.index({ coachId: 1, createdAt: -1 });

export const CoachFeedback: Model<ICoachFeedback> =
  mongoose.models.CoachFeedback ||
  mongoose.model<ICoachFeedback>("CoachFeedback", CoachFeedbackSchema);
