import mongoose from "mongoose";
import {
  PROJECT_STATUSES,
  PROJECT_VISIBILITIES,
  PROJECT_PRIORITIES,
} from "../../models/Project.js";
import { slugify } from "../utils/slugify.js";

export { slugify };

export const FORBIDDEN_FIELDS = [
  "owner",
  "_id",
  "createdAt",
  "updatedAt",
  "__v",
  "isDeleting",
];

export const ALLOWED_FIELDS = [
  "title",
  "slug",
  "shortDescription",
  "description",
  "category",
  "status",
  "visibility",
  "priority",
  "startDate",
  "deadline",
  "completedAt",
  "progress",
  "techStack",
  "tags",
  "repositoryUrl",
  "liveUrl",
  "demoUrl",
  "docsUrl",
  "coverImage",
  "notes",
];

export const SORTABLE_FIELDS = [
  "createdAt",
  "updatedAt",
  "title",
  "deadline",
  "progress",
  "priority",
];

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Validates HTTP/HTTPS URL
 */
export function isValidHttpUrl(string) {
  if (!string) return true;
  try {
    const url = new URL(string);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Validates and sanitizes project create or update payload.
 *
 * @param {object} body Raw request body
 * @param {boolean} isUpdate Whether this is a PATCH update (all fields optional)
 * @returns {{ isValid: boolean, errors: string[], sanitized: object }}
 */
export function validateProjectPayload(body, isUpdate = false) {
  const errors = [];
  const sanitized = {};

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      isValid: false,
      errors: ["Request body must be a valid JSON object"],
      sanitized: {},
    };
  }

  // 1. Check for forbidden fields (prevent mass assignment)
  for (const field of FORBIDDEN_FIELDS) {
    if (field in body) {
      errors.push(`Modifying protected field '${field}' is not permitted`);
    }
  }

  // 2. Reject unsupported/unexpected fields
  const providedFields = Object.keys(body);
  for (const field of providedFields) {
    if (!ALLOWED_FIELDS.includes(field) && !FORBIDDEN_FIELDS.includes(field)) {
      errors.push(`Unsupported field '${field}' in request body`);
    }
  }

  // 3. Validate Title
  if (!isUpdate || "title" in body) {
    if (!body.title || typeof body.title !== "string" || !body.title.trim()) {
      errors.push("Title is required and must be a non-empty string");
    } else if (body.title.trim().length > 150) {
      errors.push("Title cannot exceed 150 characters");
    } else {
      sanitized.title = body.title.trim();
    }
  }

  // 4. Validate / Generate Slug
  if ("slug" in body) {
    if (typeof body.slug !== "string" || !body.slug.trim()) {
      errors.push("Slug must be a non-empty string");
    } else {
      const normalizedSlug = body.slug.toLowerCase().trim();
      if (!slugRegex.test(normalizedSlug)) {
        errors.push("Slug must be lowercase alphanumeric with hyphens (e.g. 'my-project-1')");
      } else if (normalizedSlug.length > 150) {
        errors.push("Slug cannot exceed 150 characters");
      } else {
        sanitized.slug = normalizedSlug;
      }
    }
  } else if (!isUpdate && sanitized.title) {
    // Auto-generate slug from title if not explicitly provided during creation
    const generated = slugify(sanitized.title);
    if (!generated) {
      errors.push("Could not generate valid slug from title; please provide an explicit slug");
    } else {
      sanitized.slug = generated;
    }
  }

  // 5. Validate Short Description
  if (!isUpdate || "shortDescription" in body) {
    if (!body.shortDescription || typeof body.shortDescription !== "string" || !body.shortDescription.trim()) {
      errors.push("Short description is required and must be a non-empty string");
    } else if (body.shortDescription.trim().length > 300) {
      errors.push("Short description cannot exceed 300 characters");
    } else {
      sanitized.shortDescription = body.shortDescription.trim();
    }
  }

  // 6. Validate Optional Description
  if ("description" in body) {
    if (body.description !== null && typeof body.description !== "string") {
      errors.push("Description must be a string");
    } else if (body.description && body.description.length > 5000) {
      errors.push("Description cannot exceed 5000 characters");
    } else {
      sanitized.description = body.description ? body.description.trim() : "";
    }
  }

  // 7. Validate Category
  if ("category" in body) {
    if (body.category !== null && typeof body.category !== "string") {
      errors.push("Category must be a string");
    } else if (body.category && body.category.length > 50) {
      errors.push("Category cannot exceed 50 characters");
    } else {
      sanitized.category = body.category ? body.category.trim() : "General";
    }
  }

  // 8. Validate Enums
  if ("status" in body) {
    if (!PROJECT_STATUSES.includes(body.status)) {
      errors.push(`Status must be one of: ${PROJECT_STATUSES.join(", ")}`);
    } else {
      sanitized.status = body.status;
    }
  }

  if ("visibility" in body) {
    if (!PROJECT_VISIBILITIES.includes(body.visibility)) {
      errors.push(`Visibility must be one of: ${PROJECT_VISIBILITIES.join(", ")}`);
    } else {
      sanitized.visibility = body.visibility;
    }
  }

  if ("priority" in body) {
    if (!PROJECT_PRIORITIES.includes(body.priority)) {
      errors.push(`Priority must be one of: ${PROJECT_PRIORITIES.join(", ")}`);
    } else {
      sanitized.priority = body.priority;
    }
  }

  // 9. Validate Progress
  if ("progress" in body) {
    const num = Number(body.progress);
    if (isNaN(num) || num < 0 || num > 100) {
      errors.push("Progress must be a number between 0 and 100");
    } else {
      sanitized.progress = Math.round(num);
    }
  }

  // 10. Validate Dates
  const dateFields = ["startDate", "deadline", "completedAt"];
  for (const df of dateFields) {
    if (df in body) {
      if (body[df] === null || body[df] === "") {
        sanitized[df] = null;
      } else {
        const d = new Date(body[df]);
        if (isNaN(d.getTime())) {
          errors.push(`Field '${df}' must be a valid date or null`);
        } else {
          sanitized[df] = d;
        }
      }
    }
  }

  // 11. Validate String Arrays
  const arrayFields = ["techStack", "tags"];
  for (const af of arrayFields) {
    if (af in body) {
      if (!Array.isArray(body[af])) {
        errors.push(`Field '${af}' must be an array of strings`);
      } else {
        sanitized[af] = body[af]
          .filter((item) => typeof item === "string" && item.trim())
          .map((item) => item.trim());
      }
    }
  }

  // 12. Validate URLs
  const urlFields = ["repositoryUrl", "liveUrl", "demoUrl", "docsUrl", "coverImage"];
  for (const uf of urlFields) {
    if (uf in body) {
      if (body[uf] === null || body[uf] === "") {
        sanitized[uf] = null;
      } else if (typeof body[uf] !== "string" || !isValidHttpUrl(body[uf])) {
        errors.push(`Field '${uf}' must be a valid HTTP or HTTPS URL`);
      } else {
        sanitized[uf] = body[uf].trim();
      }
    }
  }

  // 13. Validate Notes
  if ("notes" in body) {
    if (body.notes !== null && typeof body.notes !== "string") {
      errors.push("Notes must be a string");
    } else if (body.notes && body.notes.length > 3000) {
      errors.push("Notes cannot exceed 3000 characters");
    } else {
      sanitized.notes = body.notes ? body.notes.trim() : "";
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized,
  };
}
