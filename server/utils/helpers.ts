import { getCurrentAppState } from "./state.ts";
import { getSupabaseUrl, getSupabaseServiceKey, getSupabaseAnonKey } from "./db.ts";

export const escapeHtml = (str: string = "") => {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

export const isPrivateOrInternalUrl = (urlStr: string): boolean => {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return true;
    }
    const hostname = parsed.hostname.toLowerCase();
    
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "::1" ||
      hostname === "169.254.169.254" ||
      hostname.endsWith(".internal") ||
      hostname.endsWith(".local")
    ) {
      return true;
    }

    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const match = hostname.match(ipv4Regex);
    if (match) {
      const [, p1, p2] = match.map(Number);
      if (
        p1 === 10 ||
        (p1 === 172 && p2 >= 16 && p2 <= 31) ||
        (p1 === 192 && p2 === 168) ||
        (p1 === 169 && p2 === 254) ||
        p1 === 127 ||
        p1 === 0
      ) {
        return true;
      }
    }

    return false;
  } catch {
    return true; 
  }
};

/**
 * Official Zeta Campaign QA Operations Logo Component (HTML/SVG)
 * Matches the official branding from the login page (AuthShell):
 * Multi-colored polygon emblem, bold ZETA, vertical divider, and CAMPAIGN QA Operations text.
 */
export const zetaLogoHtml = (mode: 'dark' | 'light' = 'dark') => {
  const isDark = mode === 'dark';
  const textColor = isDark ? '#FFFFFF' : '#0F172A';
  const subtextColor = isDark ? '#CBD5E1' : '#64748B';
  const dividerColor = isDark ? 'rgba(255, 255, 255, 0.35)' : '#94A3B8';
  const fallbackLogoUrl = "https://companieslogo.com/img/orig/ZETA-424536bc.png";

  return `
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="display: inline-table; vertical-align: middle;">
    <tr>
      <td style="vertical-align: middle; padding-right: 12px;">
        <img src="cid:zeta_logo_header" onerror="this.onerror=null; this.src='${fallbackLogoUrl}';" alt="Zeta Global" width="105" height="30" style="display: block; width: 105px; max-width: 105px; height: auto; border: 0; outline: none; text-decoration: none;" />
      </td>
      <td style="vertical-align: middle; border-left: 1.5px solid ${dividerColor}; padding-left: 10px;">
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: ${textColor}; line-height: 1.2;">
          CAMPAIGN
        </div>
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 9px; font-weight: 500; letter-spacing: 0.5px; color: ${subtextColor}; line-height: 1.2; margin-top: 1px;">
          QA Operations
        </div>
      </td>
    </tr>
  </table>`;
};

/**
 * Universal, fully responsive, bulletproof HTML email wrapper for Zeta QA Platform
 * Supports Outlook (MSO), Apple Mail, Gmail (Web/App), and mobile viewports.
 */
export const emailTemplate = (
  title: string, 
  content: string, 
  ctaLink?: string, 
  ctaText?: string, 
  badgeText: string = "Zeta QA Platform",
  preheaderText?: string
) => {
  const currentYear = new Date().getFullYear();
  const preheader = preheaderText || title;

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <title>${escapeHtml(title)}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:AllowPNG/>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style type="text/css">
    /* Universal Client Resets */
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    table { border-collapse: collapse !important; }
    body { height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased; }
    
    /* Mobile Responsive Overrides */
    @media only screen and (max-width: 620px) {
      .container-table { width: 100% !important; max-width: 100% !important; border-radius: 0 !important; border-left: 0 !important; border-right: 0 !important; }
      .brand-header { padding: 24px 20px !important; }
      .header-title { font-size: 20px !important; line-height: 1.3 !important; }
      .content-body { padding: 24px 20px !important; font-size: 14px !important; }
      .meta-table td { display: block !important; width: 100% !important; box-sizing: border-box !important; padding: 8px 12px !important; }
      .meta-label { border-bottom: none !important; padding-bottom: 2px !important; }
      .meta-value { padding-top: 2px !important; border-bottom: 1px solid #e2e8f0 !important; }
      .btn-responsive { display: block !important; width: 100% !important; box-sizing: border-box !important; text-align: center !important; }
      .footer-wrap { padding: 20px 16px !important; font-size: 11px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; min-width: 100%;">
  <!-- Hidden Preheader -->
  <div style="display: none; max-height: 0px; overflow: hidden; font-size: 1px; line-height: 1px; color: #f1f5f9; opacity: 0;">
    ${escapeHtml(preheader)} &zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;
  </div>

  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f1f5f9;">
    <tr>
      <td align="center" style="padding: 32px 12px;">
        <!--[if (gte mso 9)|(IE)]>
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="600">
        <tr>
        <td align="center" valign="top" width="600">
        <![endif]-->
        
        <table role="presentation" class="container-table" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(15, 23, 42, 0.08); border: 1px solid #e2e8f0;">
          
          <!-- Header Banner with Official Zeta Brand Logo -->
          <tr>
            <td class="brand-header" style="background: linear-gradient(135deg, #0A05B0 0%, #1E3A8A 100%); padding: 26px 30px; text-align: left;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="vertical-align: middle;">
                    <!-- Official Zeta Logo Header with Universal Image Tag for Gmail & Outlook -->
                    <div style="margin-bottom: 14px;">
                      <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="vertical-align: middle; padding-right: 12px;">
                            <img src="https://companieslogo.com/img/orig/ZETA-424536bc.png" alt="Zeta Global" width="105" style="width: 105px; height: auto; display: block; border: 0;" />
                          </td>
                          <td style="vertical-align: middle; border-left: 1.5px solid rgba(255, 255, 255, 0.35); padding-left: 12px;">
                            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: #ffffff; line-height: 1.2;">
                              CAMPAIGN
                            </div>
                            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 9px; font-weight: 600; letter-spacing: 0.5px; color: rgba(255, 255, 255, 0.85); line-height: 1.2; margin-top: 2px;">
                              QA Operations
                            </div>
                          </td>
                        </tr>
                      </table>
                    </div>
                    <!-- Badge -->
                    <div style="display: inline-block; padding: 4px 12px; background-color: rgba(255, 255, 255, 0.18); border: 1px solid rgba(255, 255, 255, 0.3); border-radius: 16px; color: #ffffff; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px;">
                      ${escapeHtml(badgeText)}
                    </div>
                    <!-- Title -->
                    <h1 class="header-title" style="margin: 0; color: #ffffff; font-size: 21px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.25; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                      ${escapeHtml(title)}
                    </h1>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body Content Area -->
          <tr>
            <td class="content-body" style="padding: 32px; color: #334155; font-size: 15px; line-height: 1.65; background-color: #ffffff;">
              ${content}

              ${ctaLink && ctaText ? `
              <!-- Bulletproof CTA Button -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top: 28px; margin-bottom: 12px;">
                <tr>
                  <td align="center">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" style="border-radius: 8px; background-color: #0A05B0;">
                          <a href="${escapeHtml(ctaLink)}" target="_blank" class="btn-responsive" style="font-size: 15px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-weight: 600; color: #ffffff; text-decoration: none; padding: 13px 34px; border-radius: 8px; border: 1px solid #0001AA; display: inline-block; box-shadow: 0 2px 6px rgba(10, 5, 176, 0.35);">
                            ${escapeHtml(ctaText)} &rarr;
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Direct Link Fallback -->
              <p style="margin: 16px 0 0 0; font-size: 12px; color: #64748b; line-height: 1.5; word-break: break-all; text-align: center;">
                If the button above does not work, copy and paste this link into your browser:<br/>
                <a href="${escapeHtml(ctaLink)}" target="_blank" style="color: #0A05B0; font-weight: 500; text-decoration: underline;">${escapeHtml(ctaLink)}</a>
              </p>
              ` : ''}
            </td>
          </tr>

          <!-- Corporate Footer -->
          <tr>
            <td class="footer-wrap" style="background-color: #f8fafc; padding: 22px 32px; text-align: center; color: #64748b; font-size: 12px; line-height: 1.6; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0 0 4px 0; font-weight: 700; color: #334155; font-size: 13px;">
                Zeta Global
              </p>
              <p style="margin: 0; color: #64748b; font-size: 12px;">
                &copy; ${currentYear} Zeta Global Inc. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
        <!--[if (gte mso 9)|(IE)]>
        </td>
        </tr>
        </table>
        <![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;
};

export interface CalloutScreenshotItem {
  name?: string;
  dataUrl?: string;
  caption?: string;
  cid?: string;
}

export interface CalloutItem {
  text: string;
  screenshot?: CalloutScreenshotItem;
}

export interface CQAApprovalEmailOptions {
  campaignName?: string;
  recipientName?: string;
  senderName?: string;
  assignedQaName?: string;
  loggedInUserName?: string;
  team?: string;
  country?: string;
  versionName?: string;
  feedback?: string;
  callouts?: Array<string | CalloutItem> | string;
  ownerCallouts?: Array<string | CalloutItem> | string;
  clientCallouts?: Array<string | CalloutItem> | string;
  isApproved?: boolean;
  screenshots?: CalloutScreenshotItem[];
  attachmentFilename?: string;
  complianceScore?: string | number;
  totalCheckpoints?: number;
  passedCheckpoints?: number;
  qaType?: string;
}

/**
 * Sanitizes a name intended for greetings or sign-offs, guaranteeing that
 * no raw email address or generic placeholder is ever rendered.
 */
export function sanitizeGreetingName(name?: string, fallback = "Campaign Reviewer"): string {
  if (!name || typeof name !== "string") return fallback;
  const trimmed = name.trim();
  if (!trimmed || /^qa\s*user$/i.test(trimmed) || /^user$/i.test(trimmed)) return fallback;

  if (trimmed.includes("@")) {
    const lower = trimmed.toLowerCase();
    if (lower.includes("chaithanya") || lower.includes("bogineni")) return "Chaithanya";
    if (lower.includes("malik")) return "Malik";
    if (lower.includes("hpapj") || lower.includes("hp-apj")) return "HP APJ QA Team";
    const local = trimmed.split("@")[0];
    const parts = local.split(/[._\-\d]+/).filter(Boolean);
    if (parts.length > 0 && !parts[0].toLowerCase().includes("team") && !parts[0].toLowerCase().includes("admin")) {
      return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
    }
    return fallback;
  }
  return trimmed;
}

/**
 * Asynchronously resolves a user's full name by querying app_users metadata in Supabase,
 * with memory state and heuristic fallbacks.
 */
export async function resolveUserFullNameServer(
  input?: string | null,
  defaultFallback = "QA Specialist"
): Promise<string> {
  if (!input || typeof input !== "string") return defaultFallback;
  const raw = input.trim();
  if (!raw) return defaultFallback;

  // If already a clean human name without @ and not generic
  if (!raw.includes("@") && !/^qa\s*user$/i.test(raw) && !/^user$/i.test(raw) && !/^admin$/i.test(raw)) {
    return raw;
  }

  const lower = raw.toLowerCase();

  // 1. Query Supabase app_users table
  try {
    const supabaseUrl = getSupabaseUrl();
    const supabaseKey = getSupabaseServiceKey() || getSupabaseAnonKey();
    if (supabaseUrl && supabaseKey && supabaseUrl.startsWith("https://")) {
      const { createClient } = await import("@supabase/supabase-js");
      const client = createClient(supabaseUrl, supabaseKey);
      
      const { data: matched } = await client
        .from("app_users")
        .select("name, email")
        .ilike("email", lower)
        .maybeSingle();

      if (matched?.name && matched.name.trim()) {
        const cleanName = matched.name.trim();
        if (!/^qa\s*user$/i.test(cleanName) && !cleanName.includes("@")) {
          return cleanName;
        }
      }
    }
  } catch (err) {
    console.warn("[resolveUserFullNameServer] Supabase lookup error:", err);
  }

  // 2. Check currentAppState.users
  try {
    const state = getCurrentAppState();
    if (Array.isArray(state?.users)) {
      const u = state.users.find((user: any) => user.email && user.email.toLowerCase() === lower);
      if (u?.name && u.name.trim() && !/^qa\s*user$/i.test(u.name.trim()) && !u.name.includes("@")) {
        return u.name.trim();
      }
    }
  } catch {}

  // 3. Known heuristics
  if (lower.includes("chaithanya") || lower.includes("bogineni")) {
    return "Chaithanya";
  }
  if (lower.includes("malik")) {
    return "Malik";
  }
  if (lower.includes("hpapj") || lower.includes("hp-apj")) {
    return "HP APJ QA Team";
  }

  // 4. Sanitize email prefix into human name
  return sanitizeGreetingName(raw, defaultFallback);
}

/**
 * Formats a clean humanized name from a raw name or email address,
 * explicitly avoiding generic placeholders like "QA User".
 */
export function formatFriendlyName(rawName?: string, email?: string): string {
  if (rawName && rawName.trim()) {
    const clean = rawName.trim();
    if (!/^qa\s*user$/i.test(clean) && !/^user$/i.test(clean) && !clean.includes("@")) {
      return clean;
    }
  }

  if (email && email.trim()) {
    return sanitizeGreetingName(email.trim(), "");
  }

  return "";
}

/**
 * Helper to normalize callout items into CalloutItem[]
 */
function normalizeCalloutItems(items?: Array<string | CalloutItem> | string): CalloutItem[] {
  const result: CalloutItem[] = [];
  if (Array.isArray(items)) {
    items.forEach(c => {
      if (typeof c === 'string') {
        const clean = c.trim();
        if (clean) result.push({ text: clean });
      } else if (c && typeof c === 'object' && c.text) {
        const clean = c.text.trim();
        if (clean) {
          result.push({
            text: clean,
            screenshot: c.screenshot && c.screenshot.dataUrl ? c.screenshot : undefined
          });
        }
      }
    });
  } else if (typeof items === 'string' && items.trim()) {
    items.split('\n').forEach(line => {
      const clean = line.replace(/^[•\-\*]\s*/, '').trim();
      if (clean) result.push({ text: clean });
    });
  }
  return result;
}

/**
 * Clean, Dynamic, and Branded Zeta QA Approval Email Template
 * Supports rendering screenshots directly BELOW bullet points as requested by user,
 * plus standalone screenshots below the callouts list.
 */
export const cqaApprovalEmailTemplate = (options: CQAApprovalEmailOptions) => {
  const {
    recipientName = "",
    senderName = "Cbogineni",
    assignedQaName,
    loggedInUserName,
    feedback = "",
    callouts = [],
    ownerCallouts,
    clientCallouts,
    isApproved = true,
    screenshots = [],
    qaType = "CQA"
  } = options;

  // Dynamically resolve greeting name, replacing static "QA User" placeholder and raw emails
  const rawRecipient = (recipientName || "").trim();
  const isGeneric = !rawRecipient || /^qa\s*user$/i.test(rawRecipient) || /^user$/i.test(rawRecipient);
  const candidateRecipient = (!isGeneric && rawRecipient)
    ? rawRecipient
    : ((assignedQaName && !/^qa\s*user$/i.test(assignedQaName.trim())) ? assignedQaName.trim()
      : ((loggedInUserName && !/^qa\s*user$/i.test(loggedInUserName.trim())) ? loggedInUserName.trim()
        : "Campaign Reviewer"));
  const cleanRecipientName = sanitizeGreetingName(candidateRecipient, "Campaign Reviewer");
  const cleanSenderName = sanitizeGreetingName(senderName, "Chaithanya");

  const normalizedQaType = (qaType || "CQA").trim();

  // Normalize owner callouts (prefer explicit ownerCallouts, fallback to callouts)
  const normalizedOwnerCallouts = normalizeCalloutItems(ownerCallouts !== undefined ? ownerCallouts : callouts);
  const normalizedClientCallouts = normalizeCalloutItems(clientCallouts);

  // Standalone general screenshots
  const validStandaloneScreenshots = Array.isArray(screenshots) ? screenshots.filter(s => s && s.dataUrl) : [];

  const renderBulletList = (items: CalloutItem[]) => `
    <ul style="margin: 0; padding-left: 20px; color: #1e293b; font-size: 14.5px; line-height: 1.6;">
      ${items.map(item => `
        <li style="margin-bottom: ${item.screenshot ? '16px' : '6px'}; list-style-type: disc;">
          <div style="font-weight: 500; color: #1e293b;">
            ${escapeHtml(item.text)}
          </div>
          ${item.screenshot ? `
          <div style="margin-top: 10px; margin-bottom: 6px; padding: 8px; background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; display: inline-block; max-width: 100%; box-shadow: 0 1px 3px rgba(0,0,0,0.06);">
            ${item.screenshot.caption ? `
            <div style="font-size: 11.5px; font-weight: 600; color: #475569; margin-bottom: 6px;">
              ${escapeHtml(item.screenshot.caption)}
            </div>` : ''}
            <img src="${item.screenshot.cid ? `cid:${item.screenshot.cid}` : item.screenshot.dataUrl}" alt="${escapeHtml(item.screenshot.name || 'Callout screenshot')}" style="display: block; max-width: 100%; max-height: 400px; height: auto; border-radius: 4px; border: 1px solid #e2e8f0;" />
          </div>
          ` : ''}
        </li>
      `).join('')}
    </ul>
  `;

  // Owner callouts box
  const ownerCalloutsHtml = normalizedOwnerCallouts.length > 0 ? `
    <div style="margin: 20px 0 16px 0; padding: 16px 20px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #0A05B0; border-radius: 8px;">
      <p style="margin: 0 0 10px 0; font-size: 15px; font-weight: 700; color: #0A05B0;">
        Callouts for Campaign Owner:
      </p>
      ${renderBulletList(normalizedOwnerCallouts)}
    </div>` : '';

  // Client callouts box
  const clientCalloutsHtml = normalizedClientCallouts.length > 0 ? `
    <div style="margin: 20px 0 16px 0; padding: 16px 20px; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-left: 4px solid #16a34a; border-radius: 8px;">
      <p style="margin: 0 0 10px 0; font-size: 15px; font-weight: 700; color: #16a34a;">
        Client Callouts:
      </p>
      ${renderBulletList(normalizedClientCallouts)}
    </div>` : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Calibri, 'Segoe UI', Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #111827; margin: 0; padding: 24px; background-color: #ffffff;">
  <div style="max-width: 640px; margin: 0; font-family: Calibri, 'Segoe UI', Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #111827;">
    
    <!-- Header Brand Card with Zeta Logo & Status Badge -->
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #0b0f19; border-radius: 8px; padding: 14px 18px; margin-bottom: 22px;">
      <tr>
        <td align="left" style="vertical-align: middle;">
          ${zetaLogoHtml('dark')}
        </td>
        <td align="right" style="vertical-align: middle;">
          <span style="display: inline-block; background-color: rgba(34, 197, 94, 0.15); border: 1px solid rgba(34, 197, 94, 0.35); color: #4ade80; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; padding: 4px 10px; border-radius: 16px; text-transform: uppercase;">
            &#10003; ${escapeHtml(normalizedQaType)} ${isApproved ? 'APPROVED' : 'COMPLETED'}
          </span>
        </td>
      </tr>
    </table>

    <p style="margin: 0 0 18px 0; font-size: 15px; color: #111827;">
      Hi ${escapeHtml(cleanRecipientName)} ,
    </p>

    ${isApproved ? `
    <p style="margin: 0 0 4px 0; font-size: 15px; font-weight: 700; color: #111827;">
      ${escapeHtml(normalizedQaType)} Approved!
    </p>

    <p style="margin: 0 0 18px 0; font-size: 15px; color: #374151;">
      Check list uploaded to OneDrive
    </p>` : ''}

${ownerCalloutsHtml}
${clientCalloutsHtml}

    <p style="margin: 18px 0 4px 0; font-size: 15px; color: #111827;">
      Thanks!
    </p>

    <p style="margin: 0; font-size: 15px; font-weight: 600; color: #111827;">
      ${escapeHtml(cleanSenderName)}
    </p>
  </div>
</body>
</html>`;
};

export const cqaApprovalEmailText = (options: {
  recipientName?: string;
  senderName?: string;
  assignedQaName?: string;
  loggedInUserName?: string;
  feedback?: string;
  callouts?: Array<string | CalloutItem> | string;
  ownerCallouts?: Array<string | CalloutItem> | string;
  clientCallouts?: Array<string | CalloutItem> | string;
  isApproved?: boolean;
  screenshots?: CalloutScreenshotItem[];
  qaType?: string;
}) => {
  const {
    recipientName = "",
    senderName = "Chaithanya",
    assignedQaName,
    loggedInUserName,
    callouts = [],
    ownerCallouts,
    clientCallouts,
    isApproved = true,
    screenshots = [],
    qaType = "CQA"
  } = options;

  // Dynamically resolve greeting name, replacing static 'QA User' placeholder and raw emails
  const rawRecipient = (recipientName || "").trim();
  const isGeneric = !rawRecipient || /^qa\s*user$/i.test(rawRecipient) || /^user$/i.test(rawRecipient);
  const candidateRecipient = (!isGeneric && rawRecipient)
    ? rawRecipient
    : ((assignedQaName && !/^qa\s*user$/i.test(assignedQaName.trim())) ? assignedQaName.trim()
      : ((loggedInUserName && !/^qa\s*user$/i.test(loggedInUserName.trim())) ? loggedInUserName.trim()
        : "Campaign Reviewer"));
  const cleanRecipientName = sanitizeGreetingName(candidateRecipient, "Campaign Reviewer");
  const cleanSenderName = sanitizeGreetingName(senderName, "Chaithanya");

  const normalizedQaType = (qaType || "CQA").trim();

  const normalizedOwnerCallouts = normalizeCalloutItems(ownerCallouts !== undefined ? ownerCallouts : callouts);
  const normalizedClientCallouts = normalizeCalloutItems(clientCallouts);

  const ownerSection = normalizedOwnerCallouts.length > 0
    ? `\n\nCallouts for Campaign Owner:\n` + normalizedOwnerCallouts.map(item => {
        let line = `• ${item.text}`;
        if (item.screenshot) {
          line += `\n  [Screenshot: ${item.screenshot.caption || item.screenshot.name || 'Image attached'}]`;
        }
        return line;
      }).join('\n')
    : "";

  const clientSection = normalizedClientCallouts.length > 0
    ? `\n\nClient Callouts:\n` + normalizedClientCallouts.map(item => {
        let line = `• ${item.text}`;
        if (item.screenshot) {
          line += `\n  [Screenshot: ${item.screenshot.caption || item.screenshot.name || 'Image attached'}]`;
        }
        return line;
      }).join('\n')
    : "";

  const validScreenshots = Array.isArray(screenshots) ? screenshots.filter(s => s && s.dataUrl) : [];
  const screenshotsBlock = validScreenshots.length > 0
    ? `\n\n[Attached: ${validScreenshots.length} Additional Callout Screenshot(s)]`
    : "";

  const approvalBlock = isApproved
    ? `\n\n${normalizedQaType} Approved!\nCheck list uploaded to OneDrive`
    : "";

  return `Hi ${cleanRecipientName} ,${approvalBlock}${ownerSection}${clientSection}${screenshotsBlock}

Thanks!
${cleanSenderName}`;
};

/**
 * Branded User Invitation Email Template
 */
export const inviteEmailTemplate = (options: {
  name: string;
  email: string;
  role: string;
  team: string;
  inviteUrl: string;
}) => {
  const { name, email, role, team, inviteUrl } = options;
  const cleanName = sanitizeGreetingName(name || email, "Team Member");

  const content = `
    <p style="font-size: 16px; margin: 0 0 16px 0; color: #1e293b;">
      Hi <strong>${escapeHtml(cleanName)}</strong>,
    </p>

    <p style="margin: 0 0 20px 0; font-size: 14px; color: #475569; line-height: 1.6;">
      You have been invited to access the <strong>Zeta QA Platform</strong> by an administrator.
    </p>

    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 24px;">
      <tr>
        <td style="padding: 14px 18px; font-size: 13px; border-bottom: 1px solid #e2e8f0;">
          <strong style="color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 2px;">Assigned Team</strong>
          <span style="font-weight: 600; color: #0f172a;">${escapeHtml(team)}</span>
        </td>
      </tr>
      <tr>
        <td style="padding: 14px 18px; font-size: 13px;">
          <strong style="color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 2px;">Account Role</strong>
          <span style="display: inline-block; background-color: #e0f2fe; color: #0369a1; font-weight: 700; font-size: 12px; padding: 2px 8px; border-radius: 12px; text-transform: capitalize;">
            ${escapeHtml(role)}
          </span>
        </td>
      </tr>
    </table>

    <p style="margin: 0 0 10px 0; font-size: 14px; color: #475569; line-height: 1.6;">
      Click the button below to complete your registration and set up your secure account password:
    </p>
  `;

  return emailTemplate("Welcome to Zeta QA Platform", content, inviteUrl, "Accept Invitation & Set Password", "PLATFORM INVITATION");
};

/**
 * Branded Password Reset Email Template
 */
export const passwordResetEmailTemplate = (options: {
  name?: string;
  email: string;
  resetUrl: string;
}) => {
  const { name, email, resetUrl } = options;
  const displayName = sanitizeGreetingName(name || email, "Team Member");

  const content = `
    <p style="font-size: 16px; margin: 0 0 16px 0; color: #1e293b;">
      Hello <strong>${escapeHtml(displayName)}</strong>,
    </p>

    <p style="margin: 0 0 16px 0; font-size: 14px; color: #475569; line-height: 1.6;">
      We received a request to reset the password for your <strong>Zeta QA Platform</strong> account (<code>${escapeHtml(email)}</code>).
    </p>

    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 18px 0; background-color: #fffbeb; border: 1px solid #fef3c7; border-left: 4px solid #f59e0b; border-radius: 8px;">
      <tr>
        <td style="padding: 14px 18px;">
          <p style="margin: 0; font-size: 13px; color: #92400e; line-height: 1.5;">
            <strong>Security Notice:</strong> This password reset link is valid for 1 hour. If you did not make this request, you can safely ignore this email.
          </p>
        </td>
      </tr>
    </table>

    <p style="margin: 0 0 10px 0; font-size: 14px; color: #475569; line-height: 1.6;">
      Click the secure button below to specify a new password:
    </p>
  `;

  return emailTemplate("Password Reset Request", content, resetUrl, "Reset My Password", "SECURITY NOTICE");
};

/**
 * Branded Password Setup Email Template
 */
export const passwordSetupEmailTemplate = (options: {
  name?: string;
  email: string;
  setupUrl: string;
}) => {
  const { name, email, setupUrl } = options;
  const displayName = sanitizeGreetingName(name || email, "Team Member");

  const content = `
    <p style="font-size: 16px; margin: 0 0 16px 0; color: #1e293b;">
      Hello <strong>${escapeHtml(displayName)}</strong>,
    </p>

    <p style="margin: 0 0 16px 0; font-size: 14px; color: #475569; line-height: 1.6;">
      An administrator has generated a direct account setup link for your <strong>Zeta QA Platform</strong> profile.
    </p>

    <p style="margin: 0 0 10px 0; font-size: 14px; color: #475569; line-height: 1.6;">
      Please click the button below to initialize your credentials and access the verification dashboard:
    </p>
  `;

  return emailTemplate("Account Credentials Setup", content, setupUrl, "Set Up My Password", "CREDENTIAL SETUP");
};
