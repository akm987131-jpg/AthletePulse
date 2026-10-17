import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type NotificationType =
  | "new_report"
  | "new_feedback"
  | "feedback_acknowledged";

export interface INotification extends Document {
  _id: Types.ObjectId;
  recipientId: Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  relatedLogId?: Types.ObjectId;
  relatedFeedbackId?: Types.ObjectId;
  readAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    recipientId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Recipient ID is required"],
      index: true,
    },
    type: {
      type: String,
      enum: ["new_report", "new_feedback", "feedback_acknowledged"],
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    relatedLogId: {
      type: Schema.Types.ObjectId,
      ref: "DailyLog",
      default: null,
    },
    relatedFeedbackId: {
      type: Schema.Types.ObjectId,
      ref: "CoachFeedback",
      default: null,
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
NotificationSchema.index({ recipientId: 1, createdAt: -1 });
NotificationSchema.index({ recipientId: 1, readAt: 1 });

export const Notification: Model<INotification> =
  mongoose.models.Notification ||
  mongoose.model<INotification>("Notification", NotificationSchema);
