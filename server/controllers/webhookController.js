import { spawn } from "child_process";
import { sendDeploymentEmail } from "../services/emailService/deploymentEmail.js";

/**
 * Handle GitHub webhook for automated deployments
 */
export const handleGitHubWebhook = async (req, res) => {
  const { repository: repoInfo, ref, head_commit: commit, pusher } = req.body;
  
  let repository;
  if (repoInfo?.name === "Personal-Cloud-Drive-Frontend") {
    repository = "frontend";
  } else if (repoInfo?.name === "Personal-Cloud-Drive-Backend-PM2") {
    repository = "backend";
  } else {
    return res.status(200).json({ message: "Unknown repository, skipping deploy" });
  }

  console.log(`[CI/CD] Starting deployment for: ${repository}`);

  const branch = ref ? ref.split("/").pop() : "unknown";
  const repoName = repoInfo?.full_name || "CloudVault Repository";
  const modifiedFiles = commit?.modified || [];
  const pusherName = pusher?.name || "GitHub Actions";

  // Start deployment script
  const scriptPath = `/home/ubuntu/deploy-${repository}.sh`;
  const bashProcess = spawn("bash", [scriptPath]);

  bashProcess.stdout.on("data", (data) => process.stdout.write(data));
  bashProcess.stderr.on("data", (data) => process.stderr.write(data));

  bashProcess.on("close", async (code) => {
    const status = code === 0 ? "Success" : "Failed";
    console.log(`[CI/CD] Deployment ${status} (Exit Code: ${code})`);

    try {
      const result = await sendDeploymentEmail({
        status,
        repository,
        repoName,
        branch,
        commit: commit || {},
        modifiedFiles,
        pusher: pusherName,
      });

      if (result.success) {
        console.log(`[CI/CD] Notification email sent for ${repository}`);
      } else {
        console.error(`[CI/CD] Failed to send notification email:`, result.error);
      }
    } catch (error) {
      console.error("[CI/CD] Critical error in notification flow:", error);
    }
  });

  bashProcess.on("error", (err) => {
    console.error(`[CI/CD] Failed to start process: ${err.message}`);
  });

  res.status(202).json({ message: "Deployment initiated" });
};
