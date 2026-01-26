import { z } from "zod";
import mongoose from "mongoose";

export const objectIdSchema = z
  .string()
  .refine((val) => mongoose.Types.ObjectId.isValid(val), {
    message: "Invalid ObjectId",
  });

export const stringSchema = z.string().min(1, "Field cannot be empty");

export const filenameSchema = z
  .string()
  .min(1, "Filename cannot be empty")
  .max(255, "Filename is too long")
  .regex(/^[a-zA-Z0-9._\- ]+$/, "Invalid characters in filename");