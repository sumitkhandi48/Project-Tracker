import mongoose from "mongoose";

export const TASK_STATUSES = ["Todo", "In Progress", "Done"];
export const TASK_PRIORITIES = ["Low", "Medium", "High", "Critical"];

const TaskSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: [true, "Project reference is required"],
      index: true,
    },
    // Decision: Storing the owner reference directly on Task enables fast user-level
    // queries (e.g., "my assigned tasks" or cross-project work queues) and immediate
    // authorization checks without populating the parent Project document.
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Task owner is required"],
      index: true,
    },
    title: {
      type: String,
      required: [true, "Task title is required"],
      trim: true,
      maxlength: [200, "Title cannot exceed 200 characters"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [3000, "Description cannot exceed 3000 characters"],
      default: "",
    },
    status: {
      type: String,
      enum: {
        values: TASK_STATUSES,
        message: "{VALUE} is not a valid task status",
      },
      default: "Todo",
      index: true,
    },
    priority: {
      type: String,
      enum: {
        values: TASK_PRIORITIES,
        message: "{VALUE} is not a valid task priority",
      },
      default: "Medium",
      index: true,
    },
    dueDate: {
      type: Date,
      default: null,
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

// Compound indexes for project board filtering and deadlines
TaskSchema.index({ project: 1, status: 1 });
TaskSchema.index({ project: 1, dueDate: 1 });
TaskSchema.index({ owner: 1, status: 1 });

const Task = mongoose.models.Task || mongoose.model("Task", TaskSchema);

export default Task;
