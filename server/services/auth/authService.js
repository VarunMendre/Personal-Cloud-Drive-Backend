import OTP from "../../models/otpModel.js";
import { verifyIdToken } from "../googleAuthService.js";
import { getGitHubUser } from "../githubAuthService.js";
import User from "../../models/userModel.js";
import { Types } from "mongoose";
import Directory from "../../models/directoryModel.js";
import { runInTransaction } from "../../utils/transactionHelper.js";
import { CustomError } from "../../utils/CustomError.js";

export const verifyOtpService = async (email, otp) => {
  const optRecord = await OTP.findOne({ email, otp });
  if (!optRecord) {
    throw new CustomError("Invalid or Expired OTP", 400);
  }
  return true;
};

export const registerService = async (data) => {
  const { name, email, password, otp } = data;
  const optRecord = await OTP.findOne({ email, otp });
  if (!optRecord) {
    throw new CustomError("Invalid or Expired OTP", 400);
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
  } catch (err) {
    if (err.code === 121) {
      throw new CustomError("Invalid input, please enter valid details", 400);
    } else if (err.code === 11000) {
      if (err.keyValue.email) {
        throw new CustomError("This email already exists", 409, {
          message: "A user with this email address already exists. Please try logging in or use a different email.",
        });
      }
    }
    throw err;
  }
};

export const loginService = async (email, password) => {
  const user = await User.findOne({ email, isDeleted: false });

  if (!user) {
    throw new CustomError("Invalid Credentials", 401);
  }

  // CHECK: If user doesn't have a password (OAuth user who hasn't set password)
  if (!user.password || user.password.length === 0) {
    throw new CustomError(
      "No password set. Please login with Google/GitHub or set a password in settings.",
      401
    );
  }

  const isPasswordValid = await user.comparePassword(password);

  if (!isPasswordValid) {
    throw new CustomError("Invalid Credentials", 401);
  }

  return user;
};

export const loginWithGoogleService = async (idToken) => {
  const userData = await verifyIdToken(idToken);
  const { name, email, picture } = userData;

  return { name, email, picture };
};

export const processGoogleLoginService = async (name, email, picture) => {
  let user = await User.findOne({ email }).select("-__v");

  if (user) {
    if (user.isDeleted) {
      throw new CustomError("Your account has been deleted. Contact admin to recover it.", 403);
    }

    if (user.picture && user.picture.includes("googleusercontent.com")) {
      user.picture = picture;
      await user.save();
    }

    return { user, isNew: false };
  }

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

  return { user: result, isNew: true };
};

export const processGithubLoginService = async (code) => {
  const { name, email, picture } = await getGitHubUser(code);
  return { name, email, picture };
};

export const handleGithubLoginService = async (name, email, picture) => {
  let user = await User.findOne({ email }).select("-__v");

  if (user) {
    if (user.picture.includes("avatars.githubusercontent")) {
      user.picture = picture;
      await user.save();
    }
    return { user, isNew: false };
  }

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

  return { user: result, isNew: true };
};

export const setUserPasswordService = async (userId, newPassword) => {
  const user = await User.findById(userId);

  if (!user) {
    throw new CustomError("User not Found", 404);
  }

  if (user.password && user.password.length > 0) {
    throw new CustomError("Password already set. Use change password instead.", 400);
  }
  user.password = newPassword;
  await user.save();
};

export const changeUserPasswordService = async (userId, currentPassword, newPassword) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new CustomError("User not found", 404);
  }

  if (!user.password || user.password.length === 0) {
    throw new CustomError("No existing password set. Please set a password first.", 400);
  }

  const isPasswordValid = await user.comparePassword(currentPassword);

  if (!isPasswordValid) {
    throw new CustomError("Current password is incorrect", 400);
  }

  user.password = newPassword;
  await user.save();
};
