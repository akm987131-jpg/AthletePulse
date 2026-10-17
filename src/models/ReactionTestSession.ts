import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type ReactionInputMethod = "mouse" | "touch" | "keyboard";
export type SessionStatus = "completed" | "interrupted";

export interface IReactionTestSession extends Document {
  _id: Types.ObjectId;
  athleteId: Types.ObjectId;
  reactionTimes: number[];
  averageTime: number;
  bestTime: number;
  falseStartCount: number;
  completedRounds: number;
  inputMethod: ReactionInputMethod;
  status: SessionStatus;
  createdAt: Date;
  updatedAt: Date;
}

const ReactionTestSessionSchema = new Schema<IReactionTestSession>(
  {
    athleteId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Athlete ID is required"],
      index: true,
    },
    reactionTimes: {
      type: [Number],
      required: [true, "Reaction times array is required"],
      validate: {
        validator: function (times: number[]) {
          return times.length > 0 && times.every((t) => t >= 30 && t <= 10000);
        },
        message: "Reaction times must be non-empty and between 30ms and 10000ms",
      },
    },
    averageTime: {
      type: Number,
      required: [true, "Average reaction time is required"],
      min: [30, "Average reaction time too low"],
      max: [10000, "Average reaction time too high"],
    },
    bestTime: {
      type: Number,
      required: [true, "Best reaction time is required"],
      min: [30, "Best reaction time too low"],
      max: [10000, "Best reaction time too high"],
      index: true,
    },
    falseStartCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    completedRounds: {
      type: Number,
      required: true,
      default: 5,
      min: 1,
    },
    inputMethod: {
      type: String,
      enum: ["mouse", "touch", "keyboard"],
      default: "mouse",
    },
    status: {
      type: String,
      enum: ["completed", "interrupted"],
      default: "completed",
    },
  },
  {
    timestamps: true,
  }
);

// Performance Indexes
ReactionTestSessionSchema.index({ athleteId: 1, createdAt: -1 });
ReactionTestSessionSchema.index({ athleteId: 1, bestTime: 1 });

export const ReactionTestSession: Model<IReactionTestSession> =
  mongoose.models.ReactionTestSession ||
  mongoose.model<IReactionTestSession>(
    "ReactionTestSession",
    ReactionTestSessionSchema
  );
