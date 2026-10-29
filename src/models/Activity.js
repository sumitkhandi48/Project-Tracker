import mongoose from "mongoose";

export const ACTIVITY_TYPES = [
  "project_created",
  "project_updated",
  "project_archived",
  "task_created",
  "task_updated",
  "task_completed",
  "milestone_created",
  "milestone_completed",
];

const ActivitySchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Activity owner is required"],
      index: true,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      default: null,
      index: true,
    },
    type: {
      type: String,
      required: [true, "Activity type is required"],
      enum: {
        values: ACTIVITY_TYPES,
        message: "{VALUE} is not a valid activity type",
      },
      index: true,
    },
    message: {
      type: String,
      required: [true, "Activity message is required"],
      trim: true,
      maxlength: [500, "Activity message cannot exceed 500 characters"],
    },
    // Scoped flexible schema for event-specific contextual attributes (e.g. { taskId, statusFrom, statusTo })
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for activity stream queries ordered chronologically
ActivitySchema.index({ owner: 1, createdAt: -1 });
ActivitySchema.index({ project: 1, createdAt: -1 });

const Activity = mongoose.models.Activity || mongoose.model("Activity", ActivitySchema);

export default Activity;
