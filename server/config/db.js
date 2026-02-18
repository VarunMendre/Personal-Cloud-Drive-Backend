import mongoose from "mongoose";

let isConnected = false;
export async function connectDB() {
  if (isConnected) return;
  if (!process.env.DB_URL) {
    console.error("CRITICAL ERROR: DB_URL environment variable is MISSING!");
    return;
  }
  try {
    await mongoose.connect(process.env.DB_URL);
    isConnected = mongoose.connection.readyState;
    console.log("Database connected");
  } catch (err) {
    console.error("DB Connection Error:", err);
    console.log("DB Couldn't connect");
    // Removed process.exit(1) for Lambda stability
  }
}

process.on("SIGINT", async () => {
  await mongoose.disconnect();
  console.log("Client Disconnected!");
  process.exit(0);
});
