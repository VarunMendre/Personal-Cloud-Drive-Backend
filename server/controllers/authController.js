import { sendOtpService } from "../services/sendOtpService.js";
import OTP from "../models/otpModel.js";
import { verifyIdToken } from "../services/googleAuthService.js";
import { getGitHubUser } from "../services/githubAuthService.js";
import User from "../models/userModel.js";
import { Types } from "mongoose";
import Directory from "../models/directoryModel.js";
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
import { runInTransaction } from "../utils/transactionHelper.js";
import { createSession } from "../utils/authUtils.js";

/**
 * CPU-intensive Auth operations (bcrypt hashing/comparison and OAuth)
 */

export const sendOtp = async (req, res, next) => {
  const { email } = req.body;
  const resData = await sendOtpService(email);
  return successResponse(res, resData, null, 201);
};

export const verifyOtp = async (req, res, next) => {
  const { success, data } = validateWithSchema(otpSchema, req.body);

  if (!success) {
    return errorResponse(res, "Invalid or Expired OTP", 400);
  }

  const { email, otp } = data;
  const optRecord = await OTP.findOne({ email, otp });
  if (!optRecord) {
    return errorResponse(res, "Invalid or Expired OTP", 400);
  }

  return successResponse(res, null, "OTP verified");
};

export const register = async (req, res, next) => {
  const sanitizedBody = sanitize(req.body);

  const { success, data, fieldErrors } = validateWithSchema(registerSchema, sanitizedBody);

  if (!success) {
    return errorResponse(res, "Validation failed", 400, { fieldErrors });
  }

  const { name, email, password, otp } = data;
  const optRecord = await OTP.findOne({ email, otp });
  if (!optRecord) {
    return errorResponse(res, "Invalid or Expired OTP", 400);
  }
  await optRecord.deleteOne();

  try {
    await runInTransaction(async (session) => {
      const rootDirId = new Types.ObjectId();
      const userId = new Types.ObjectId();

      await Directory.create(
        [
          {
            _id: rootDirId,
            name: `root-${email}`,
            parentDirId: null,
            userId,
          },
        ],
        { session }
      );

      await User.create(
        [
          {
            _id: userId,
            name,
            email,
            password,
            rootDirId,
          },
        ],
        { session }
      );
    });

    return successResponse(res, null, "User Registered", 201);
  } catch (err) {
    if (err.code === 121) {
      return errorResponse(res, "Invalid input, please enter valid details", 400);
    } else if (err.code === 11000) {
      if (err.keyValue.email) {
        return errorResponse(res, "This email already exists", 409, {
          message: "A user with this email address already exists. Please try logging in or use a different email.",
        });
      }
    } else {
      next(err);
    }
  }
};

export const login = async (req, res, next) => {
  try {
    const sanitizedBody = sanitize(req.body);

    const { success, data } = validateWithSchema(loginSchema, sanitizedBody);

    if (!success) {
      return errorResponse(res, "Invalid Credentials", 404);
    }

    const { email, password } = data;

    if (!email || !password) {
      return errorResponse(res, "Email and password are required", 400);
    }
    const user = await User.findOne({ email, isDeleted: false });

    if (!user) {
      return errorResponse(res, "Invalid Credentials", 404);
    }

    // CHECK: If user doesn't have a password (OAuth user who hasn't set password)
    if (!user.password || user.password.length === 0) {
      return errorResponse(
        res,
        "No password set. Please login with Google/GitHub or set a password in settings.",
        401
      );
    }

    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      return errorResponse(res, "Invalid Credentials", 404);
    }

    await createSession(res, user);
    return successResponse(res, null, "logged in");
  } catch (err) {
    next(err);
  }
};

export const loginWithGoogle = async (req, res, next) => {
  const { idToken } = req.body;

  if (!idToken) {
    return errorResponse(res, "Id Token not generated", 400);
  }

  const userData = await verifyIdToken(idToken);
  const { name, email, picture } = userData;

  const { success } = validateWithSchema(googleLoginSchema, {
    name,
    email,
    picture,
  });

  if (!success) {
    return errorResponse(res, "Invalid credentials", 400);
  }

  let user = await User.findOne({ email }).select("-__v");

  // ✅ If user exists
  if (user) {
    if (user.isDeleted) {
      return errorResponse(res, "Your account has been deleted. Contact admin to recover it.", 403);
    }

    if (user.picture && user.picture.includes("googleusercontent.com")) {
      user.picture = picture;
      await user.save();
    }

    await createSession(res, user);

    return successResponse(res, null, "logged in");
  }

  // ✅ If user doesn't exist
  try {
    const result = await runInTransaction(async (session) => {
      const rootDirId = new Types.ObjectId();
      const userId = new Types.ObjectId();

      const [newUser] = await User.create(
        [
          {
            _id: userId,
            name,
            email,
            picture,
            rootDirId,
          },
        ],
        { session }
      );

      await Directory.create(
        [
          {
            _id: rootDirId,
            name: `root-${email}`,
            parentDirId: null,
            userId,
          },
        ],
        { session }
      );

      return newUser;
    });

    await createSession(res, result);

    return successResponse(res, { insertedUser: result }, "logged in", 201);
  } catch (err) {
    next(err);
  }
};

export async function githubLogin(req, res, next) {
  const { code } = req.body;
  if (!code) return errorResponse(res, "Code is required", 400);

  try {
    const { name, email, picture } = await getGitHubUser(code);

    const { success } = validateWithSchema(githubLoginSchema, {
      name,
      email,
      picture,
    });

    if (!success || !email) {
      return errorResponse(res, "Invalid Credentials or Email not available from GitHub", 400);
    }

    // Check if user exists
    let user = await User.findOne({ email }).select("-__v");

    if (user) {
      // Update avatar if default
      if (user.picture.includes("avatars.githubusercontent")) {
        user.picture = picture;
        await user.save();
      }

      await createSession(res, user);
      return successResponse(res, { user }, "logged in");
    }

    // If user doesn't exist, create user and root directory
    const result = await runInTransaction(async (session) => {
      const rootDirId = new Types.ObjectId();
      const userId = new Types.ObjectId();

      await Directory.create([{
        _id: rootDirId,
        name: `root-${email}`,
        parentDirId: null,
        userId,
      }], { session });

      const newUser = await User.create([{
        _id: userId,
        name,
        email,
        picture,
        rootDirId
      }], { session });

      return newUser[0];
    });

    await createSession(res, result);
    return successResponse(res, { user: result }, "logged in", 201);
  } catch (err) {
    console.error("GitHub login error:", err.message);
    return errorResponse(res, "GitHub login failed", 500);
  }
}

export const setUserPassword = async (req, res, next) => {
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 4) {
    return errorResponse(res, "Password must be at least 4 characters long", 400);
  }

  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return errorResponse(res, "User not Found", 404);
    }

    if (user.password && user.password.length > 0) {
      return errorResponse(res, "Password already set. Use change password instead.", 400);
    }
    user.password = newPassword;
    await user.save();

    return successResponse(res, null, "Password Set Successfully, You may now login with credentials");
  } catch (err) {
    console.error("Error setting password:", err);
    return errorResponse(res, "Error setting password", 500);
  }
};

export const changeUserPassword = async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return errorResponse(res, "Current and new passwords are required", 400);
  }

  if (newPassword.length < 4) {
    return errorResponse(res, "New password must be at least 4 characters long", 400);
  }

  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return errorResponse(res, "User not found", 404);
    }

    if (!user.password || user.password.length === 0) {
      return errorResponse(res, "No existing password set. Please set a password first.", 400);
    }

    const isPasswordValid = await user.comparePassword(currentPassword);

    if (!isPasswordValid) {
      return errorResponse(res, "Current password is incorrect", 400);
    }

    user.password = newPassword;
    await user.save();

    return successResponse(res, null, "Password changed successfully");
  } catch (err) {
    return errorResponse(res, "Error changing password", 500);
  }
};
