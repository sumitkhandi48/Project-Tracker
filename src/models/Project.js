import mongoose from "mongoose";

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const urlValidator = {
  validator: function (v) {
    if (!v) return true;
    try {
      const url = new URL(v);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  },
  message: (props) => `${props.value} is not a valid HTTP or HTTPS URL`,
};

export const PROJECT_STATUSES = ["Planned", "In Progress", "On Hold", "Completed"];
export const PROJECT_VISIBILITIES = ["Public", "Private"];
export const PROJECT_PRIORITIES = ["Low", "Medium", "High", "Critical"];

const ProjectSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Project owner is required"],
      index: true,
    },
    title: {
      type: String,
      required: [true, "Project title is required"],
      trim: true,
      maxlength: [150, "Title cannot exceed 150 characters"],
    },
    slug: {
      type: String,
      required: [true, "Project slug is required"],
      trim: true,
      lowercase: true,
      match: [slugRegex, "Slug must be lowercase alphanumeric with hyphens (e.g. 'my-first-project')"],
      maxlength: [150, "Slug cannot exceed 150 characters"],
    },
    shortDescription: {
      type: String,
      required: [true, "Short description is required"],
      trim: true,
      maxlength: [300, "Short description cannot exceed 300 characters"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [5000, "Description cannot exceed 5000 characters"],
      default: "",
    },
    category: {
      type: String,
      trim: true,
      maxlength: [50, "Category cannot exceed 50 characters"],
      default: "General",
    },
    status: {
      type: String,
      enum: {
        values: PROJECT_STATUSES,
        message: "{VALUE} is not a valid project status",
      },
      default: "Planned",
      index: true,
    },
    visibility: {
      type: String,
      enum: {
        values: PROJECT_VISIBILITIES,
        message: "{VALUE} is not a valid project visibility",
      },
      default: "Private",
      index: true,
    },
    priority: {
      type: String,
      enum: {
        values: PROJECT_PRIORITIES,
        message: "{VALUE} is not a valid project priority",
      },
      default: "Medium",
      index: true,
    },
    startDate: {
      type: Date,
      default: null,
    },
    deadline: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    progress: {
      type: Number,
      min: [0, "Progress cannot be less than 0"],
      max: [100, "Progress cannot exceed 100"],
      default: 0,
    },
    techStack: {
      type: [String],
      default: [],
    },
    repositoryUrl: {
      type: String,
      trim: true,
      validate: urlValidator,
      default: null,
    },
    liveUrl: {
      type: String,
      trim: true,
      validate: urlValidator,
      default: null,
    },
    demoUrl: {
      type: String,
      trim: true,
      validate: urlValidator,
      default: null,
    },
    docsUrl: {
      type: String,
      trim: true,
      validate: urlValidator,
      default: null,
    },
    coverImage: {
      type: String,
      trim: true,
      validate: urlValidator,
      default: null,
    },
    tags: {
      type: [String],
      default: [],
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [3000, "Notes cannot exceed 3000 characters"],
      default: "",
    },
    // Internal coordination flag for transactional cascade deletion
    isDeleting: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index ensuring slugs are unique per user account
ProjectSchema.index({ owner: 1, slug: 1 }, { unique: true });

// Efficient compound indexes for dashboard list filtering and sorting
ProjectSchema.index({ owner: 1, updatedAt: -1 });
ProjectSchema.index({ owner: 1, status: 1 });
ProjectSchema.index({ owner: 1, priority: 1 });
ProjectSchema.index({ visibility: 1, status: 1 });

const Project = mongoose.models.Project || mongoose.model("Project", ProjectSchema);

export default Project;
