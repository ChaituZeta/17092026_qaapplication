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
 * Builds a bulletproof signup / invitation link targeting the current assigned domain.
 */
export function buildDynamicSignupUrl(
  req: any,
  email: string,
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
  return `${base}/signup?email=${encodeURIComponent(cleanEmail)}`;
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
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });
}

// Backward compatibility alias
export const createGmailTransporter = (user: string, pass: string, port: 465 | 587 = 465) =>
  createSmtpTransporter("smtp.gmail.com", port, user, pass, port === 465);

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
