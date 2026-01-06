import { wrapEmailTemplate, sendEmail } from "./emailBase.js";

/**
 * Send a deployment status notification email
 * @param {Object} details Deployment details
 * @param {string} details.status Success | Failed
 * @param {string} details.repository Frontend | Backend
 * @param {string} details.repoName Full repository name
 * @param {string} details.branch Branch name
 * @param {Object} details.commit Commit info from GitHub
 * @param {string[]} details.modifiedFiles List of modified files
 * @param {string} details.pusher Pusher name
 */
export const sendDeploymentEmail = async ({
  status,
  repository,
  repoName,
  branch,
  commit,
  modifiedFiles,
  pusher,
}) => {
  const themeColor = status === "Success" ? "#10B981" : "#EF4444"; // Green for success, Red for failure
  const emoji = status === "Success" ? "✅" : "❌";

  const contentHtml = `
    <div style="text-align: center; margin-bottom: 30px;">
      <div style="font-size: 48px; margin-bottom: 10px;">${emoji}</div>
      <h2 style="color: ${themeColor}; margin: 0; font-size: 24px;">Deployment ${status}</h2>
      <p style="color: #64748b; font-size: 16px; margin-top: 5px;">${repository.toUpperCase()} Production Environment</p>
    </div>

    <div class="highlight-box">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-size: 14px; width: 40%;">Repository</td>
          <td style="padding: 8px 0; color: #0f172a; font-weight: 600; font-size: 14px;">${repoName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Branch</td>
          <td style="padding: 8px 0; color: #0f172a; font-weight: 600; font-size: 14px;">
            <span style="background: #e2e8f0; padding: 2px 8px; border-radius: 4px; font-family: monospace;">${branch}</span>
          </td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Triggered By</td>
          <td style="padding: 8px 0; color: #0f172a; font-weight: 600; font-size: 14px;">${pusher}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Commit SHA</td>
          <td style="padding: 8px 0; color: #0f172a; font-weight: 600; font-size: 14px; font-family: monospace;">${commit.id?.substring(0, 7) || "N/A"}</td>
        </tr>
      </table>
    </div>

    <div style="margin-bottom: 24px;">
      <h3 style="font-size: 16px; font-weight: 700; color: #0f172a; margin-bottom: 12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">Commit Message</h3>
      <p style="background: #f8fafc; padding: 12px; border-radius: 8px; color: #334155; font-style: italic; margin: 0; border-left: 4px solid ${themeColor};">
        "${commit.message || "No commit message"}"
      </p>
    </div>

    ${modifiedFiles && modifiedFiles.length > 0 ? `
    <div style="margin-bottom: 24px;">
      <h3 style="font-size: 16px; font-weight: 700; color: #0f172a; margin-bottom: 12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">Files Changed</h3>
      <ul style="padding-left: 20px; color: #475569; font-size: 14px; margin: 0;">
        ${modifiedFiles.slice(0, 10).map(file => `<li style="margin-bottom: 4px;">${file}</li>`).join('')}
        ${modifiedFiles.length > 10 ? `<li style="color: #94a3b8; list-style: none; margin-top: 5px;">+ ${modifiedFiles.length - 10} more files...</li>` : ''}
      </ul>
    </div>
    ` : ''}

    <div class="button-wrapper">
      <a href="${commit.url || '#'}" class="button">View Changes on GitHub</a>
    </div>
  `;

  const html = wrapEmailTemplate(`CloudVault - Deployment ${status}`, contentHtml, themeColor);

  return await sendEmail({
    to: "varunmm0404@gmail.com",
    subject: `🚀 [${repository.toUpperCase()}] Deployment ${status}: ${commit.message?.split('\n')[0] || 'New Push'}`,
    html,
  });
};
