import mongoose from "mongoose";

export const MILESTONE_STATUSES = ["Planned", "In Progress", "Completed"];

const MilestoneSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: [true, "Project reference is required"],
      index: true,
    },
    // Decision: Storing owner on Milestone supports direct tenant verification
    // and rapid cross-project roadmap aggregation without additional lookups.
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Milestone owner is required"],
      index: true,
    },
    title: {
      type: String,
      required: [true, "Milestone title is required"],
      trim: true,
      maxlength: [200, "Title cannot exceed 200 characters"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [3000, "Description cannot exceed 3000 characters"],
      default: "",
    },
    targetDate: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: {
        values: MILESTONE_STATUSES,
        message: "{VALUE} is not a valid milestone status",
      },
      default: "Planned",
      index: true,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for chronological project roadmaps and status filtering
MilestoneSchema.index({ project: 1, targetDate: 1 });
MilestoneSchema.index({ project: 1, status: 1 });

const Milestone = mongoose.models.Milestone || mongoose.model("Milestone", MilestoneSchema);

export default Milestone;
