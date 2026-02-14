/**
 * Sanitizer Stub
 * Currently disabled to avoid package size and ESM compatibility issues on AWS Lambda.
 * Simply returns the input without modification.
 */
export const sanitize = (input) => {
  return input;
};

export default sanitize;