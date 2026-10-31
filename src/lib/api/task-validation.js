import { TASK_STATUSES, TASK_PRIORITIES } from "../../models/Task.js";

export const TASK_FORBIDDEN_FIELDS = [
  "owner",
  "project",
  "_id",
  "createdAt",
  "updatedAt",
  "__v",
];

export const TASK_ALLOWED_FIELDS = [
  "title",
  "description",
  "status",
  "priority",
  "dueDate",
  "completedAt",
];

export const TASK_SORTABLE_FIELDS = [
  "createdAt",
  "updatedAt",
  "title",
  "dueDate",
  "priority",
  "status",
];

/**
 * Validates and parses a date field.
 *
 * @param {unknown} value
 * @param {string} fieldName
 * @returns {{ isValid: boolean, date?: Date | null, error?: string }}
 */
export function validateDateField(value, fieldName) {
  if (value === null || value === "") {
    return { isValid: true, date: null };
  }
  if (
    typeof value === "boolean" ||
    Array.isArray(value) ||
    (typeof value === "object" && !(value instanceof Date))
  ) {
    return {
      isValid: false,
      error: `Field '${fieldName}' must be a valid date or null`,
    };
  }
  const d = new Date(value);
  if (isNaN(d.getTime())) {
    return {
      isValid: false,
      error: `Field '${fieldName}' must be a valid date or null`,
    };
  }
  return { isValid: true, date: d };
}

/**
 * Validates and sanitizes task create or update payload.
 *
 * @param {object} body Raw request body
 * @param {boolean} isUpdate Whether this is a PATCH update (fields optional)
 * @returns {{ isValid: boolean, errors: string[], sanitized: object }}
 */
export function validateTaskPayload(body, isUpdate = false) {
  const errors = [];
  const sanitized = {};

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      isValid: false,
      errors: ["Request body must be a valid JSON object"],
      sanitized: {},
    };
  }

  // 1. Strictly block protected fields (prevent mass assignment & relationship hijacking)
  for (const field of TASK_FORBIDDEN_FIELDS) {
    if (field in body) {
      errors.push(`Modifying protected field '${field}' is not permitted`);
    }
  }

  // 2. Reject unsupported/unexpected fields
  const providedFields = Object.keys(body);
  for (const field of providedFields) {
    if (
      !TASK_ALLOWED_FIELDS.includes(field) &&
      !TASK_FORBIDDEN_FIELDS.includes(field)
    ) {
      errors.push(`Unsupported field '${field}' in request body`);
    }
  }

  // 3. Validate Title
  if (!isUpdate || "title" in body) {
    if (!body.title || typeof body.title !== "string" || !body.title.trim()) {
      errors.push("Title is required and must be a non-empty string");
    } else if (body.title.trim().length > 200) {
      errors.push("Title cannot exceed 200 characters");
    } else {
      sanitized.title = body.title.trim();
    }
  }

  // 4. Validate Description
  if ("description" in body) {
    if (body.description !== null && typeof body.description !== "string") {
      errors.push("Description must be a string");
    } else if (body.description && body.description.length > 3000) {
      errors.push("Description cannot exceed 3000 characters");
    } else {
      sanitized.description = body.description ? body.description.trim() : "";
    }
  }

  // 5. Validate Status enum
  if ("status" in body) {
    if (!TASK_STATUSES.includes(body.status)) {
      errors.push(`Status must be one of: ${TASK_STATUSES.join(", ")}`);
    } else {
      sanitized.status = body.status;
    }
  }

  // 6. Validate Priority enum
  if ("priority" in body) {
    if (!TASK_PRIORITIES.includes(body.priority)) {
      errors.push(`Priority must be one of: ${TASK_PRIORITIES.join(", ")}`);
    } else {
      sanitized.priority = body.priority;
    }
  }

  // 7. Validate Date fields (dueDate, completedAt)
  const dateFields = ["dueDate", "completedAt"];
  for (const df of dateFields) {
    if (df in body) {
      const dateCheck = validateDateField(body[df], df);
      if (!dateCheck.isValid) {
        errors.push(dateCheck.error);
      } else {
        sanitized[df] = dateCheck.date;
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized,
  };
}
