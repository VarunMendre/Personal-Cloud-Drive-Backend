import { sendOtpService } from "../services/sendOtpService.js";
import {
  registerSchema,
  githubLoginSchema,
  googleLoginSchema,
  otpSchema,
  loginSchema,
} from "../validators/authSchema.js";
import { successResponse, errorResponse } from "../utils/response.js";
import { sanitize } from "../utils/sanitizer.js";
import { validateWithSchema } from "../utils/validationWrapper.js";
import { createSession } from "../utils/authUtils.js";
import asyncHandler from "../utils/asyncHandler.js";
import { CustomError } from "../utils/CustomError.js";
import {
  verifyOtpService,
  registerService,
  loginService,
  loginWithGoogleService,
  processGoogleLoginService,
  processGithubLoginService,
  handleGithubLoginService,
  setUserPasswordService,
  changeUserPasswordService,
} from "../services/auth/authService.js";

/**
 * CPU-intensive Auth operations (bcrypt hashing/comparison and OAuth)
 */

export const sendOtp = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const resData = await sendOtpService(email);
  return successResponse(res, resData, null, 201);
});

export const verifyOtp = asyncHandler(async (req, res) => {
  const { success, data } = validateWithSchema(otpSchema, req.body);

  if (!success) {
    throw new CustomError("Invalid or Expired OTP", 400);
  }

  const { email, otp } = data;
  await verifyOtpService(email, otp);

  return successResponse(res, null, "OTP verified");
});

export const register = asyncHandler(async (req, res) => {
  const sanitizedBody = sanitize(req.body);

  const { success, data, fieldErrors } = validateWithSchema(registerSchema, sanitizedBody);

  if (!success) {
    return errorResponse(res, "Validation failed", 400, { fieldErrors });
  }

  await registerService(data);

  return successResponse(res, null, "User Registered", 201);
});

export const login = asyncHandler(async (req, res) => {
  const sanitizedBody = sanitize(req.body);

  const { success, data } = validateWithSchema(loginSchema, sanitizedBody);

  if (!success) {
    throw new CustomError("Invalid Credentials", 401);
  }

  const { email, password } = data;

  if (!email || !password) {
    throw new CustomError("Email and password are required", 400);
  }

  const user = await loginService(email, password);

  await createSession(res, user);
  return successResponse(res, null, "logged in");
});

export const loginWithGoogle = asyncHandler(async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    throw new CustomError("Id Token not generated", 400);
  }

  const { name, email, picture } = await loginWithGoogleService(idToken);

  const { success } = validateWithSchema(googleLoginSchema, {
    name,
    email,
    picture,
  });

  if (!success) {
    throw new CustomError("Invalid credentials", 400);
  }

  const { user, isNew } = await processGoogleLoginService(name, email, picture);

  await createSession(res, user);

  if (isNew) {
    return successResponse(res, { insertedUser: user }, "logged in", 201);
  }
  return successResponse(res, null, "logged in");
});

export const githubLogin = asyncHandler(async (req, res) => {
  const { code } = req.body;
  if (!code) throw new CustomError("Code is required", 400);

  const { name, email, picture } = await processGithubLoginService(code);

  const { success } = validateWithSchema(githubLoginSchema, {
    name,
    email,
    picture,
  });

  if (!success || !email) {
    throw new CustomError("Invalid Credentials or Email not available from GitHub", 400);
  }

  const { user, isNew } = await handleGithubLoginService(name, email, picture);

  await createSession(res, user);
  
  if (isNew) {
    return successResponse(res, { user }, "logged in", 201);
  }
  return successResponse(res, { user }, "logged in");
});

export const setUserPassword = asyncHandler(async (req, res) => {
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 4) {
    throw new CustomError("Password must be at least 4 characters long", 400);
  }

  await setUserPasswordService(req.user._id, newPassword);

  return successResponse(res, null, "Password Set Successfully, You may now login with credentials");
});

export const changeUserPassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw new CustomError("Current and new passwords are required", 400);
  }

  if (newPassword.length < 4) {
    throw new CustomError("New password must be at least 4 characters long", 400);
  }

  await changeUserPasswordService(req.user._id, currentPassword, newPassword);

  return successResponse(res, null, "Password changed successfully");
});
