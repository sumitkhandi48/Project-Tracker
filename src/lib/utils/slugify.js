/**
 * Normalizes title into a clean URL-friendly slug
 *
 * @param {string} text
 * @returns {string}
 */
export function slugify(text) {
  if (!text || typeof text !== "string") return "";
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default slugify;
