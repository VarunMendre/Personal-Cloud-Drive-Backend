import DOMPurify from "isomorphic-dompurify";

/**
 * Sanitizes a string or an object using DOMPurify
 * @param {string|object} input - Content to sanitize
 * @returns {string|object} - Sanitized content
 */
export const sanitize = (input) => {
  if (typeof input === "string") {
    return DOMPurify.sanitize(input);
  }

  if (input && typeof input === "object" && !Array.isArray(input)) {
    const sanitizedObj = {};
    for (const [key, value] of Object.entries(input)) {
      sanitizedObj[key] = typeof value === "string" ? DOMPurify.sanitize(value) : value;
    }
    return sanitizedObj;
  }

  return input;
};

export default sanitize;