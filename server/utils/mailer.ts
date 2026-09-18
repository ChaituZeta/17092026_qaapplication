import nodemailer from "nodemailer";
import { getAppCredentialFromDB } from "./credentials.ts";

/**
 * Accurately extracts the origin / domain of the deployed application.
 * Honors client origin, reverse proxies (Vercel, Cloud Run, AWS), and standard HTTP headers.
 */
export function resolveRequestOrigin(req: any, clientOrigin?: string): string {
  // 1. Explicitly provided client origin (e.g. window.location.origin from frontend)
  if (clientOrigin && typeof clientOrigin === "string" && clientOrigin.startsWith("http")) {
    return clientOrigin.replace(/\/+$/, "");
  }

  // 2. Request body origin
  if (req?.body?.origin && typeof req.body.origin === "string" && req.body.origin.startsWith("http")) {
    return req.body.origin.replace(/\/+$/, "");
  }

  // 3. Request Origin header
  const reqOrigin = req?.headers?.origin;
  if (reqOrigin && typeof reqOrigin === "string" && reqOrigin.startsWith("http")) {
    return reqOrigin.replace(/\/+$/, "");
  }

  // 4. X-Forwarded-Host & X-Forwarded-Proto (standard for Vercel, Cloud Run, AWS, Render)
  const forwardedHost = req?.headers?.["x-forwarded-host"];
  if (forwardedHost && typeof forwardedHost === "string") {
    const proto = req?.headers?.["x-forwarded-proto"] || "https";
    const host = forwardedHost.split(",")[0].trim();
    return `${proto}://${host}`.replace(/\/+$/, "");
  }

  // 5. Referer header
  const referer = req?.headers?.referer;
  if (referer && typeof referer === "string") {
    try {
      const u = new URL(referer);
      return u.origin.replace(/\/+$/, "");
    } catch {}
  }

  // 6. Host header
  const hostHeader = req?.headers?.host;
  if (hostHeader && typeof hostHeader === "string") {
    const proto = req?.secure || req?.headers?.["x-forwarded-proto"] === "https" ? "https" : "http";
    return `${proto}://${hostHeader}`.replace(/\/+$/, "");
  }

  // 7. Configured production environment variables
  if (process.env.APP_URL && process.env.APP_URL.startsWith("http")) {
    return process.env.APP_URL.replace(/\/+$/, "");
  }
  if (process.env.PUBLIC_URL && process.env.PUBLIC_URL.startsWith("http")) {
    return process.env.PUBLIC_URL.replace(/\/+$/, "");
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`.replace(/\/+$/, "");
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`.replace(/\/+$/, "");
  }
  if (process.env.SITE_URL && process.env.SITE_URL.startsWith("http")) {
    return process.env.SITE_URL.replace(/\/+$/, "");
  }

  return "";
}

/**
 * Builds a bulletproof signup / invitation link targeting the current assigned domain using a secure token.
 */
export function buildDynamicSignupUrl(
  req: any,
  tokenOrEmail: string,
  providedUrl?: string,
  clientOrigin?: string
): string {
  const origin = resolveRequestOrigin(req, clientOrigin);

  if (providedUrl && typeof providedUrl === "string" && providedUrl.startsWith("http")) {
    if (providedUrl.includes("localhost") && origin && !origin.includes("localhost")) {
      try {
        const u = new URL(providedUrl);
        return `${origin}${u.pathname}${u.search}`;
      } catch {}
    }
    return providedUrl;
  }

  const base = origin || "";
  const identifier = (tokenOrEmail || "").trim();
  // If it is an invite token (e.g. inv_... or does not contain @)
  if (identifier.startsWith("inv_") || !identifier.includes("@")) {
    return `${base}/signup?token=${encodeURIComponent(identifier)}`;
  }

  // If passed an email, do NOT append email into the URL directly to ensure security
  return `${base}/signup`;
}

/**
 * Builds a dynamic password setup or reset URL targeting the current assigned domain.
 */
export function buildDynamicSetupUrl(
  req: any,
  email: string,
  mode: "setup" | "reset",
  providedUrl?: string,
  clientOrigin?: string
): string {
  const origin = resolveRequestOrigin(req, clientOrigin);
  const cleanEmail = (email || "").trim().toLowerCase();

  if (providedUrl && typeof providedUrl === "string" && providedUrl.startsWith("http")) {
    if (providedUrl.includes("localhost") && origin && !origin.includes("localhost")) {
      try {
        const u = new URL(providedUrl);
        return `${origin}${u.pathname}${u.search}`;
      } catch {}
    }
    return providedUrl;
  }

  const base = origin || "";
  if (mode === "reset") {
    return `${base}/login?mode=reset&email=${encodeURIComponent(cleanEmail)}`;
  }
  return `${base}/signup?email=${encodeURIComponent(cleanEmail)}&type=password-setup`;
}

/**
 * Creates a Nodemailer transporter configured with timeouts and SSL/TLS settings.
 */
export function createSmtpTransporter(
  host: string,
  port: number,
  user: string,
  pass: string,
  secure?: boolean
) {
  const isSecure = secure !== undefined ? secure : port === 465;
  return nodemailer.createTransport({
    host: host || "smtp.gmail.com",
    port: port || 465,
    secure: isSecure,
    auth: {
      user,
      pass,
    },
    tls: {
      rejectUnauthorized: false,
    },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 10000,
  });
}

// Backward compatibility alias
export const createGmailTransporter = (user: string, pass: string, port: 465 | 587 = 465) =>
  createSmtpTransporter("smtp.gmail.com", port, user, pass, port === 465);

export interface SmtpPortDiagnostic {
  port: number;
  mode: string;
  status: "connected" | "failed";
  latencyMs: number;
  error?: string;
  code?: string;
}

export interface SmtpDiagnosticResult {
  host: string;
  configuredUser: string;
  hasPassword: boolean;
  overallStatus: "healthy" | "partial" | "unconfigured" | "failed";
  recommendedPort: number;
  ports: SmtpPortDiagnostic[];
  details: string;
  timestamp: string;
}

/**
 * Diagnostic tool to thoroughly test SMTP configuration, port connectivity, and authentication
 */
export async function runSmtpDiagnostics(overrideUser?: string, overridePass?: string): Promise<SmtpDiagnosticResult> {
  const host = (await getAppCredentialFromDB("SMTP_HOST")) || process.env.SMTP_HOST || "smtp.gmail.com";
  const user = (overrideUser || "").trim() ||
    (await getAppCredentialFromDB("SMTP_USER")) ||
    (await getAppCredentialFromDB("GMAIL_USER")) ||
    process.env.SMTP_USER ||
    process.env.GMAIL_USER ||
    "";
  const pass = (overridePass || "").trim().replace(/\s+/g, "").replace(/["']/g, "") ||
    (await getAppCredentialFromDB("SMTP_PASS")) ||
    (await getAppCredentialFromDB("SMTP_PASSWORD")) ||
    (await getAppCredentialFromDB("GMAIL_APP_PASSWORD")) ||
    process.env.SMTP_PASS ||
    process.env.SMTP_PASSWORD ||
    process.env.GMAIL_APP_PASSWORD ||
    "";

  const cleanUser = user.trim();
  const cleanPass = pass.trim();
  const hasPassword = cleanPass.length > 0 && !cleanPass.includes("placeholder");

  if (!cleanUser || !hasPassword) {
    return {
      host,
      configuredUser: cleanUser,
      hasPassword,
      overallStatus: "unconfigured",
      recommendedPort: 465,
      ports: [],
      details: !cleanUser
        ? "Sender email is not configured in database."
        : "App password is missing or set to default placeholder.",
      timestamp: new Date().toISOString()
    };
  }

  const portsToTest = [
    { port: 465, mode: "SSL / TLS (Direct)", secure: true },
    { port: 587, mode: "STARTTLS (Explicit)", secure: false }
  ];

  const results: SmtpPortDiagnostic[] = [];

  for (const p of portsToTest) {
    const t0 = Date.now();
    try {
      console.log(`[SMTP Diagnostic] Testing ${host}:${p.port} (${p.mode}) with ${cleanUser}...`);
      const transporter = createSmtpTransporter(host, p.port, cleanUser, cleanPass, p.secure);
      await transporter.verify();
      const latency = Date.now() - t0;
      console.log(`[SMTP Diagnostic] ${host}:${p.port} succeeded in ${latency}ms`);
      results.push({
        port: p.port,
        mode: p.mode,
        status: "connected",
        latencyMs: latency
      });
    } catch (err: any) {
      const latency = Date.now() - t0;
      console.warn(`[SMTP Diagnostic] ${host}:${p.port} failed in ${latency}ms:`, err.message);
      let cleanErr = err.message || "Connection failed";
      if (cleanErr.includes("535") || cleanErr.includes("Username and Password not accepted")) {
        cleanErr = "Google 535 Authentication Error: 16-character App Password was rejected by Gmail. Verify at myaccount.google.com/apppasswords";
      }
      results.push({
        port: p.port,
        mode: p.mode,
        status: "failed",
        latencyMs: latency,
        error: cleanErr,
        code: err.code || "AUTH_OR_CONN_ERR"
      });
    }
  }

  const connectedPorts = results.filter(r => r.status === "connected");
  let overallStatus: "healthy" | "partial" | "unconfigured" | "failed" = "failed";
  let recommendedPort = 465;

  if (connectedPorts.length === 2) {
    overallStatus = "healthy";
    recommendedPort = 465;
  } else if (connectedPorts.length === 1) {
    overallStatus = "partial";
    recommendedPort = connectedPorts[0].port;
  }

  let details = "";
  if (overallStatus === "healthy") {
    details = `Both SSL (465) and STARTTLS (587) authenticated successfully in ~${connectedPorts[0].latencyMs}ms. Ready to dispatch emails!`;
  } else if (overallStatus === "partial") {
    details = `Port ${recommendedPort} is operating normally. Secondary port had a notice: ${results.find(r => r.status === "failed")?.error}`;
  } else {
    details = `SMTP handshake failed on both ports. Error: ${results[0]?.error || "Authentication rejected"}`;
  }

  return {
    host,
    configuredUser: cleanUser,
    hasPassword,
    overallStatus,
    recommendedPort,
    ports: results,
    details,
    timestamp: new Date().toISOString()
  };
}

/**
 * Sends a real live test message to verify end-to-end email delivery
 */
export async function sendTestEmail(recipientEmail: string, overrideUser?: string, overridePass?: string): Promise<{
  success: boolean;
  message: string;
  port?: number;
  user?: string;
  host?: string;
  messageId?: string;
  latencyMs?: number;
}> {
  const t0 = Date.now();
  const cleanTo = (recipientEmail || "").trim().toLowerCase();
  if (!cleanTo || !cleanTo.includes("@")) {
    throw new Error("A valid recipient email address is required to send a test message.");
  }

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Zeta QA Platform - SMTP Test Message</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
  <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    <div style="background: #0f172a; padding: 24px 32px; border-bottom: 2px solid #2b61d6;">
      <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.025em;">ZETA QA PLATFORM</h1>
      <p style="color: #94a3b8; margin: 4px 0 0 0; font-size: 13px;">SMTP Dispatcher Diagnostic Test</p>
    </div>
    <div style="padding: 32px;">
      <div style="display: inline-block; padding: 6px 12px; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 9999px; color: #065f46; font-size: 12px; font-weight: 600; margin-bottom: 16px;">
        ✓ SMTP CONNECTION VERIFIED & ACTIVE
      </div>
      <h2 style="color: #0f172a; margin: 0 0 12px 0; font-size: 18px; font-weight: 600;">Your SMTP Service is Operational!</h2>
      <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
        This test message confirms that your <strong>Zeta QA Platform</strong> instance has successfully authenticated with the email server and can deliver campaign approvals, user invitations, and alert notifications.
      </p>

      <div style="background: #f1f5f9; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: 500; width: 140px;">Recipient:</td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${cleanTo}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: 500;">SMTP Host:</td>
            <td style="padding: 6px 0; color: #0f172a; font-family: monospace;">smtp.gmail.com</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: 500;">Dispatched At:</td>
            <td style="padding: 6px 0; color: #0f172a;">${new Date().toUTCString()}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: 500;">Dual-Port Fallback:</td>
            <td style="padding: 6px 0; color: #059669; font-weight: 600;">Active (465 SSL & 587 TLS)</td>
          </tr>
        </table>
      </div>

      <p style="color: #94a3b8; font-size: 12px; margin: 0; line-height: 1.5;">
        Automated test message generated from Admin Settings &bull; Zeta Global & HP APJ QA Operations.
      </p>
    </div>
  </div>
</body>
</html>
  `;

  const result = await sendEmailWithAutoFallback({
    to: cleanTo,
    subject: `✓ Zeta QA Platform: SMTP Dispatcher Test (${new Date().toLocaleTimeString()})`,
    html,
    text: `Zeta QA Platform SMTP Test Successful!\nDispatched to: ${cleanTo}\nAt: ${new Date().toISOString()}`,
    smtpUser: overrideUser,
    smtpPass: overridePass
  });

  const latency = Date.now() - t0;
  return {
    success: true,
    message: `Test email successfully sent to ${cleanTo} via ${result.host}:${result.port} in ${latency}ms!`,
    port: result.port,
    user: result.user,
    host: result.host,
    messageId: result.messageId,
    latencyMs: latency
  };
}

export interface MailOptions {
  from?: string;
  to: string;
  cc?: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: any[];
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  smtpPass?: string;
}

/**
 * Sends email via the environment's configured SMTP settings with automatic dual-port fallback.
 * Works independently of host domain, serverless runtime, proxy configuration, or hosting environment.
 */
export async function sendEmailWithAutoFallback(options: MailOptions): Promise<{
  success: boolean;
  port: number;
  user: string;
  host: string;
  messageId?: string;
}> {
  const customHost = (options.smtpHost || "").trim();
  const customPort = options.smtpPort;
  const customUser = (options.smtpUser || "").trim();
  const customPass = (options.smtpPass || "").trim().replace(/\s+/g, "");

  // Resolve SMTP Host
  const host =
    customHost ||
    (await getAppCredentialFromDB("SMTP_HOST")) ||
    process.env.SMTP_HOST ||
    "smtp.gmail.com";

  // Resolve SMTP User
  const user =
    customUser ||
    (await getAppCredentialFromDB("SMTP_USER")) ||
    (await getAppCredentialFromDB("GMAIL_USER")) ||
    process.env.SMTP_USER ||
    process.env.GMAIL_USER ||
    "";

  // Resolve SMTP Password
  const pass =
    customPass ||
    (await getAppCredentialFromDB("SMTP_PASS")) ||
    (await getAppCredentialFromDB("SMTP_PASSWORD")) ||
    (await getAppCredentialFromDB("GMAIL_APP_PASSWORD")) ||
    process.env.SMTP_PASS ||
    process.env.SMTP_PASSWORD ||
    process.env.GMAIL_APP_PASSWORD ||
    "";

  const cleanUser = user.trim();
  const cleanPass = pass.trim().replace(/\s+/g, "").replace(/["']/g, "");

  if (!cleanUser || !cleanPass) {
    throw new Error("Gmail/SMTP credentials are not configured. Please save your Gmail sender email and App Password in the database (via Settings -> Notification Dispatcher).");
  }

  const isPlaceholderPass = 
    cleanPass === "your-16-character-app-password" ||
    cleanPass.includes("placeholder") ||
    cleanPass.includes("your-16-character");
  if (isPlaceholderPass) {
    throw new Error("Gmail SMTP App Password is currently set to the default placeholder. Please navigate to Settings -> Notification Dispatcher, enter your actual 16-character Google App Password (from myaccount.google.com/apppasswords), and click Save.");
  }

  // Resolve From header
  const envFrom = (await getAppCredentialFromDB("SMTP_FROM")) || process.env.SMTP_FROM;
  const fromHeader = options.from || envFrom || `"Zeta QA Platform" <${cleanUser}>`;

  // Ensure inline Zeta Logo CID attachment is present if referenced in HTML
  const attachmentsList = [...(options.attachments || [])];
  if (options.html && options.html.includes("cid:zeta_logo_header")) {
    const hasLogo = attachmentsList.some((att: any) => att.cid === "zeta_logo_header");
    if (!hasLogo) {
      try {
        const fs = await import("fs");
        const path = await import("path");
        const logoPngPath = path.join(process.cwd(), "public/zeta-qa-operations-logo.png");
        if (fs.existsSync(logoPngPath)) {
          attachmentsList.push({
            filename: "zeta-qa-operations-logo.png",
            content: fs.readFileSync(logoPngPath),
            contentType: "image/png",
            cid: "zeta_logo_header",
            contentDisposition: "inline"
          });
        }
      } catch (e) {
        console.warn("[Mailer] Could not auto-embed inline zeta logo:", e);
      }
    }
  }

  const mailOptions = {
    from: fromHeader,
    to: options.to,
    cc: options.cc || undefined,
    subject: options.subject,
    text: options.text,
    html: options.html,
    attachments: attachmentsList.length > 0 ? attachmentsList : undefined,
  };

  // Determine initial port
  let initialPort = customPort || (options.smtpSecure ? 465 : undefined);
  if (!initialPort) {
    const envPort = (await getAppCredentialFromDB("SMTP_PORT")) || process.env.SMTP_PORT;
    if (envPort) {
      initialPort = parseInt(String(envPort), 10);
    }
  }
  if (!initialPort) {
    initialPort = 465; // Default SSL
  }

  const isGmailHost = host.toLowerCase().includes("gmail.com") || host.toLowerCase().includes("googlemail.com");

  // Attempt 1: Configured port (or 465 SSL)
  try {
    const transporter = createSmtpTransporter(host, initialPort, cleanUser, cleanPass, initialPort === 465);
    const info = await transporter.sendMail(mailOptions);
    return {
      success: true,
      port: initialPort,
      user: cleanUser,
      host,
      messageId: info.messageId,
    };
  } catch (err1: any) {
    console.warn(`[Mailer] Initial attempt on ${host}:${initialPort} failed:`, err1.message);

    // If initial port was 465 (or host is Gmail), retry on 587 (STARTTLS)
    // If initial port was 587, retry on 465 (SSL)
    const fallbackPort = initialPort === 465 ? 587 : 465;
    console.log(`[Mailer] Retrying connection via ${host}:${fallbackPort}...`);

    try {
      const fallbackTransporter = createSmtpTransporter(host, fallbackPort, cleanUser, cleanPass, fallbackPort === 465);
      const info = await fallbackTransporter.sendMail(mailOptions);
      return {
        success: true,
        port: fallbackPort,
        user: cleanUser,
        host,
        messageId: info.messageId,
      };
    } catch (err2: any) {
      console.error(`[Mailer] Fallback on ${host}:${fallbackPort} also failed:`, err2.message);

      let msg = err2.message || err1.message || "Failed to dispatch email via SMTP server.";
      if (msg.includes("535") || msg.includes("Username and Password not accepted")) {
        if (isGmailHost) {
          msg = "Google Authentication Failed (535): App Password rejected by Gmail. Please generate a 16-character App Password at myaccount.google.com/apppasswords.";
        } else {
          msg = `SMTP Authentication Failed (535): Credentials rejected by ${host}.`;
        }
      }
      throw new Error(msg);
    }
  }
}
