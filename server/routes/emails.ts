import { Router } from "express";
import { getCurrentAppState, saveAppState } from "../utils/state.ts";
import { getSupabaseServiceKey, getSupabaseUrl, getSupabaseAnonKey } from "../utils/db.ts";
import { getAppCredentialFromDB, setAppCredentialInDB } from "../utils/credentials.ts";
import { generateServerQAChecklistBase64 } from "../utils/excel.ts";
import nodemailer from "nodemailer";
import { 
  emailTemplate, 
  cqaApprovalEmailTemplate, 
  cqaApprovalEmailText, 
  formatFriendlyName, 
  passwordResetEmailTemplate, 
  passwordSetupEmailTemplate, 
  escapeHtml, 
  isPrivateOrInternalUrl,
  resolveUserFullNameServer,
  sanitizeGreetingName
} from "../utils/helpers.ts";
import { buildDynamicSetupUrl, sendEmailWithAutoFallback } from "../utils/mailer.ts";

export const router = Router();

router.post("/api/forgot-password", async (req, res) => {
  const { email, resetUrl, name, origin } = req.body || {};

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const targetUrl = buildDynamicSetupUrl(req, cleanEmail, "reset", resetUrl, origin);
  const resolvedName = name ? sanitizeGreetingName(name) : await resolveUserFullNameServer(cleanEmail, "Team Member");

  try {
    const mailResult = await sendEmailWithAutoFallback({
      to: cleanEmail,
      subject: "Password Reset Request - Zeta QA Platform",
      html: passwordResetEmailTemplate({
        name: resolvedName,
        email: cleanEmail,
        resetUrl: targetUrl
      }),
    });

    res.json({
      success: true,
      deliveredVia: "smtp",
      port: mailResult.port,
      sender: mailResult.user,
      resetUrl: targetUrl,
      message: "Password reset email sent successfully!"
    });
  } catch (error: any) {
    console.error("Error sending forgot password email:", error);
    res.status(500).json({ error: error.message || "Failed to send reset email.", resetUrl: targetUrl });
  }
});

router.post("/api/send-password-setup", async (req, res) => {
  const { name, email, setupUrl, origin } = req.body || {};

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const targetUrl = buildDynamicSetupUrl(req, cleanEmail, "setup", setupUrl, origin);
  const resolvedName = name ? sanitizeGreetingName(name) : await resolveUserFullNameServer(cleanEmail, "Team Member");

  try {
    const mailResult = await sendEmailWithAutoFallback({
      to: cleanEmail,
      subject: "Set Up Your Password - Zeta QA Platform",
      html: passwordSetupEmailTemplate({
        name: resolvedName,
        email: cleanEmail,
        setupUrl: targetUrl
      }),
    });

    res.json({
      success: true,
      deliveredVia: "smtp",
      port: mailResult.port,
      sender: mailResult.user,
      setupUrl: targetUrl,
      message: "Password setup email sent successfully!"
    });
  } catch (error: any) {
    console.error("Error sending password setup email:", error);
    res.status(500).json({ error: error.message || "Failed to send password setup email.", setupUrl: targetUrl });
  }
});

router.post("/api/send-approval-email", async (req, res) => {
  const { 
    to, 
    cc, 
    subject, 
    body, 
    html, 
    senderEmail, 
    senderName, 
    recipientName,
    assignedQaName,
    loggedInUserName,
    campaignName, 
    team, 
    country, 
    versionName, 
    feedback, 
    callouts,
    ownerCallouts,
    clientCallouts,
    isApproved,
    screenshots,
    attachments,
    complianceScore,
    totalCheckpoints,
    passedCheckpoints,
    checklists,
    answers,
    qaType,
    smtpUser,
    smtpPass
  } = req.body;
  
  if (!to) {
    return res.status(400).json({ error: "Recipient email is required" });
  }

  const effectiveQaType = (qaType || "CQA").toUpperCase();

  try {
    if (smtpUser && smtpUser.trim()) {
      await setAppCredentialInDB("GMAIL_USER", smtpUser.trim().toLowerCase(), "Gmail SMTP Sender");
    }
    if (smtpPass && smtpPass.trim()) {
      await setAppCredentialInDB("GMAIL_APP_PASSWORD", smtpPass.trim().replace(/\s+/g, ""), "Gmail App Password");
    }

    const rawGmailUser = (smtpUser || "").trim() || (await getAppCredentialFromDB("GMAIL_USER")) || process.env.GMAIL_USER || "";
    const rawGmailPass = (smtpPass || "").trim() || (await getAppCredentialFromDB("GMAIL_APP_PASSWORD")) || process.env.GMAIL_APP_PASSWORD || "";

    const cleanGmailUser = rawGmailUser.trim().toLowerCase();
    const cleanGmailPass = rawGmailPass.trim().replace(/\s+/g, "").replace(/["']/g, "");

    // Separate file attachments (Excel checklist) from inline screenshot attachments
    let fileAttachments: any[] = Array.isArray(attachments) ? [...attachments] : [];
    const inlineAttachments: any[] = [];

    // Ensure Excel attachment exists; auto-generate on server if not provided
    if (fileAttachments.length === 0 && campaignName) {
      try {
        const generated = generateServerQAChecklistBase64({
          campaignName: campaignName,
          team: team || "Zeta QA",
          country: country || "Global",
          versionName: versionName || "v1",
          userEmail: senderEmail || "",
          campaignStatus: "Approved",
          qaType: effectiveQaType,
          checklists: checklists || [],
          answers: answers || {}
        });
        if (generated && generated.base64) {
          fileAttachments.push({
            filename: generated.filename,
            content: generated.base64,
            contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          });
        }
      } catch (excelErr) {
        console.warn("[Server API] Could not auto-generate Excel attachment on server:", excelErr);
      }
    }

    // Process callout bullet screenshots to assign Content-IDs (cid) and convert to inline MIME attachments
    let shotCounter = 1;
    const processCalloutBulletsWithCid = (bullets: any[], prefix: string) => {
      if (!Array.isArray(bullets)) return [];
      return bullets.map((c: any) => {
        if (!c || typeof c !== 'object') return c;
        const itemCopy = { ...c };
        if (itemCopy.screenshot && itemCopy.screenshot.dataUrl) {
          const matches = itemCopy.screenshot.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
          if (matches) {
            const mimeType = matches[1];
            const base64Data = matches[2];
            const ext = mimeType.split("/")[1] || "png";
            const cid = `callout_shot_${shotCounter++}_${Date.now().toString(36)}`;
            itemCopy.screenshot = {
              ...itemCopy.screenshot,
              cid
            };
            inlineAttachments.push({
              filename: itemCopy.screenshot.name || `${prefix}_Screenshot_${shotCounter}.${ext}`,
              content: Buffer.from(base64Data, "base64"),
              contentType: mimeType,
              cid,
              contentDisposition: "inline"
            });
          }
        }
        return itemCopy;
      });
    };

    const processedOwnerCallouts = processCalloutBulletsWithCid(ownerCallouts !== undefined ? ownerCallouts : callouts, "OwnerCallout");
    const processedClientCallouts = processCalloutBulletsWithCid(clientCallouts, "ClientCallout");

    const primaryAttachmentFilename = fileAttachments && fileAttachments[0]?.filename 
      ? fileAttachments[0].filename 
      : `ZETA_QA_Checklist_${effectiveQaType.replace(/\s+/g, "_")}_${(campaignName || "Campaign").replace(/[^a-zA-Z0-9_-]/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`;

    // Resolve clean human sender name from app_users or fallback
    let candidateSenderName = (senderName || "").trim();
    if (!candidateSenderName || candidateSenderName.includes("@") || /^qa\s*user$/i.test(candidateSenderName)) {
      const emailToLookup = senderEmail || (candidateSenderName.includes("@") ? candidateSenderName : "");
      candidateSenderName = await resolveUserFullNameServer(emailToLookup, "Chaithanya");
    }
    const effectiveSenderName = sanitizeGreetingName(candidateSenderName, "Chaithanya");

    // Dynamically resolve greeting recipient name from app_users metadata
    let effectiveRecipientName = (recipientName || "").trim();
    if (!effectiveRecipientName || effectiveRecipientName.includes("@") || /^qa\s*user$/i.test(effectiveRecipientName) || /^user$/i.test(effectiveRecipientName)) {
      if (assignedQaName && !/^qa\s*user$/i.test(assignedQaName.trim()) && !assignedQaName.includes("@")) {
        effectiveRecipientName = assignedQaName.trim();
      } else if (loggedInUserName && !/^qa\s*user$/i.test(loggedInUserName.trim()) && !loggedInUserName.includes("@")) {
        effectiveRecipientName = loggedInUserName.trim();
      } else if (to) {
        // Look up recipient full name by querying app_users metadata
        effectiveRecipientName = await resolveUserFullNameServer(to, "Campaign Reviewer");
      }
    }
    effectiveRecipientName = sanitizeGreetingName(effectiveRecipientName, "Campaign Reviewer");

    // Build specialized, responsive, clean Zeta QA approval HTML template
    let finalHtml = html;
    if (!finalHtml || campaignName) {
      finalHtml = cqaApprovalEmailTemplate({
        campaignName: campaignName || "Campaign Verification",
        recipientName: effectiveRecipientName,
        senderName: effectiveSenderName,
        assignedQaName: assignedQaName || undefined,
        loggedInUserName: loggedInUserName || undefined,
        team: team || "Zeta QA",
        country: country || "Global",
        versionName: versionName || "v1",
        feedback: feedback || "",
        callouts: processedOwnerCallouts,
        ownerCallouts: processedOwnerCallouts,
        clientCallouts: processedClientCallouts,
        isApproved: isApproved !== undefined ? Boolean(isApproved) : true,
        screenshots: [],
        attachmentFilename: primaryAttachmentFilename,
        complianceScore: complianceScore || "100%",
        totalCheckpoints: totalCheckpoints || 22,
        passedCheckpoints: passedCheckpoints || 22,
        qaType: effectiveQaType
      });
    }

    const dynamicPlainText = cqaApprovalEmailText({
      recipientName: effectiveRecipientName,
      senderName: effectiveSenderName,
      assignedQaName: assignedQaName || undefined,
      loggedInUserName: loggedInUserName || undefined,
      feedback: feedback || "",
      callouts: processedOwnerCallouts,
      ownerCallouts: processedOwnerCallouts,
      clientCallouts: processedClientCallouts,
      isApproved: isApproved !== undefined ? Boolean(isApproved) : true,
      screenshots: [],
      qaType: effectiveQaType
    });

    if (!cleanGmailUser || !cleanGmailPass) {
      return res.status(400).json({ 
        success: false, 
        deliveredVia: "none",
        isConfigured: false,
        error: "Gmail SMTP Dispatcher is not configured yet. Please configure your Gmail sender address and 16-character App Password to send.",
        message: "Gmail Dispatcher not configured.",
        hasAttachment: Boolean(fileAttachments && fileAttachments.length > 0),
        attachmentFilename: primaryAttachmentFilename
      });
    }

    try {
      const formattedAttachments: any[] = [
        ...inlineAttachments,
        ...fileAttachments.map((att: any) => ({
          filename: att.filename,
          content: Buffer.isBuffer(att.content) ? att.content : Buffer.from(att.content, "base64"),
          contentType: att.contentType || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          contentDisposition: "attachment"
        }))
      ];

      const mailResult = await sendEmailWithAutoFallback({
        from: `"${effectiveSenderName}" <${cleanGmailUser}>`,
        to: to,
        cc: cc || undefined,
        subject: subject || `${effectiveQaType} Approved | ${campaignName || "Campaign QA Verification"}`,
        text: (body && body.trim()) ? body : dynamicPlainText,
        html: finalHtml,
        attachments: formattedAttachments.length > 0 ? formattedAttachments : undefined,
        smtpUser: cleanGmailUser,
        smtpPass: cleanGmailPass,
      });

      return res.json({ 
        success: true, 
        deliveredVia: "smtp",
        port: mailResult.port,
        message: `Approval email with attached Excel checklist sent successfully via Gmail SMTP (${mailResult.user})!`,
        hasAttachment: Boolean(fileAttachments && fileAttachments.length > 0),
        attachmentFilename: primaryAttachmentFilename
      });
    } catch (smtpError: any) {
      console.error("[Server API] Direct SMTP attempt failed:", smtpError.message);
      let errorMsg = smtpError.message || "Failed to dispatch email via Gmail SMTP.";
      let authFailed = false;
      if (smtpError.message?.includes("535") || smtpError.message?.includes("Username and Password not accepted")) {
        authFailed = true;
        errorMsg = "Google Authentication Failed (535-5.7.8): Username or App Password rejected by Gmail. Please ensure 2-Step Verification is active on your Google account and enter a 16-character App Password (generated at myaccount.google.com/apppasswords), NOT your regular Google account password.";
      }
      return res.status(400).json({
        success: false,
        deliveredVia: "smtp_error",
        authFailed,
        smtpError: smtpError.message,
        error: errorMsg,
        message: errorMsg,
        hasAttachment: Boolean(fileAttachments && fileAttachments.length > 0),
        attachmentFilename: primaryAttachmentFilename
      });
    }
  } catch (error: any) {
    console.error("Error sending approval email via server:", error);
    return res.status(500).json({
      success: false,
      deliveredVia: "server_error",
      error: error.message || "Failed to dispatch via server SMTP",
      message: error.message || "Failed to dispatch via server SMTP",
      hasAttachment: false
    });
  }
});

export default router;
