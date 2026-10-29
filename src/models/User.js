import mongoose from "mongoose";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      trim: true,
      lowercase: true,
      unique: true,
      match: [emailRegex, "Please provide a valid email address"],
      index: true,
    },
    // Stable provider account identifier for GitHub OAuth
    githubId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
      default: null,
    },
    image: {
      type: String,
      trim: true,
      validate: {
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
      },
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent recompilation in Next.js development hot reloads
const User = mongoose.models.User || mongoose.model("User", UserSchema);

export default User;
