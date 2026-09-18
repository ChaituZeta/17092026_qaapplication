import { Router } from "express";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { getCurrentAppState, saveAppState } from "../utils/state.ts";
import { getSupabaseServiceKey, getSupabaseUrl, getSupabaseAnonKey, setDatabaseCredentials, clearDatabaseCredentials, checkEnvDbCredentials, saveToEnvFile } from "../utils/db.ts";
import { getAppCredentialFromDB, setAppCredentialInDB } from "../utils/credentials.ts";
import { getPersistentDatabaseStatus, persistDatabaseConnectionStatus, clearPersistentDatabaseStatus } from "../utils/dbStatus.ts";
import nodemailer from "nodemailer";
import { emailTemplate, escapeHtml, isPrivateOrInternalUrl } from "../utils/helpers.ts";
import { runSmtpDiagnostics, sendTestEmail } from "../utils/mailer.ts";

export const router = Router();

router.get("/api/env-config", async (req, res) => {
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  const serviceKey = getSupabaseServiceKey();
  
  // Non-DB credentials retrieved directly from Supabase database first
  const geminiKey = await getAppCredentialFromDB("GEMINI_API_KEY") || process.env.GEMINI_API_KEY || "";
  const gmailUser = await getAppCredentialFromDB("GMAIL_USER") || process.env.GMAIL_USER || "";
  const gmailPass = await getAppCredentialFromDB("GMAIL_APP_PASSWORD") || process.env.GMAIL_APP_PASSWORD || "";
  const sessionSecret = await getAppCredentialFromDB("SESSION_SECRET") || process.env.SESSION_SECRET || "";

  res.json({
    supabaseUrl: url || "",
    supabaseAnonKey: anonKey || "",
    hasServiceRoleKey: Boolean(serviceKey && serviceKey !== anonKey),
    hasGeminiKey: Boolean(geminiKey),
    gmailUser: gmailUser || "",
    gmailAppPassword: gmailPass || "",
    hasGmailAppPassword: Boolean(gmailPass),
    gmailConfigured: Boolean(gmailUser && gmailPass),
    hasSessionSecret: Boolean(sessionSecret),
    isConfigured: Boolean(url && anonKey && url.startsWith("https://") && anonKey.length > 10)
  });
});

/**
 * Save Database credentials into .env file.
 * Any other application credentials provided are saved directly into the Supabase DB app_credentials table.
 */
router.post("/api/save-env-config", async (req, res) => {
  const {
    supabaseUrl,
    supabaseAnonKey,
    supabaseServiceRoleKey,
    geminiApiKey,
    gmailUser,
    gmailAppPassword,
    sessionSecret
  } = req.body || {};

  const cleanUrl = (supabaseUrl || "").trim();
  const cleanAnonKey = (supabaseAnonKey || "").trim();
  const cleanServiceKey = (supabaseServiceRoleKey || "").trim();
  const cleanGeminiKey = (geminiApiKey || "").trim();
  const cleanGmailUser = (gmailUser || "").trim();
  const cleanGmailPass = (gmailAppPassword || "").trim();
  const cleanSessionSecret = (sessionSecret || "").trim();

  if (!cleanUrl || !cleanAnonKey) {
    return res.status(400).json({
      success: false,
      error: "Supabase Project URL and Anon Key are required."
    });
  }

  if (!cleanUrl.startsWith("https://")) {
    return res.status(400).json({
      success: false,
      error: "Supabase Project URL must start with https://"
    });
  }

  try {
    // 1. Verify reachability with a 2.5s timeout
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const testClient = createClient(cleanUrl, cleanServiceKey || cleanAnonKey);
      await Promise.race([
        testClient.from("app_users").select("id", { count: "exact", head: true }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout reaching Supabase")), 2500))
      ]);
    } catch (pingErr) {
      console.warn("[Server API] Note on Supabase ping (tables may be pending creation):", pingErr);
    }

    // 2. Persist database credentials securely to application state & runtime memory
    setDatabaseCredentials(cleanUrl, cleanAnonKey, cleanServiceKey);

    // Persist connected state
    await persistDatabaseConnectionStatus(true, {
      url: cleanUrl,
      hasServiceRoleKey: Boolean(cleanServiceKey && cleanServiceKey.length > 10),
      storageTarget: "Database & Secure Storage"
    });

    // 3. Save all other application secrets directly to Supabase Database
    if (cleanGeminiKey) {
      await setAppCredentialInDB("GEMINI_API_KEY", cleanGeminiKey, "Gemini AI API Key");
    }
    if (cleanGmailUser) {
      await setAppCredentialInDB("GMAIL_USER", cleanGmailUser, "Gmail User for Alerts");
    }
    if (cleanGmailPass) {
      await setAppCredentialInDB("GMAIL_APP_PASSWORD", cleanGmailPass, "Gmail App Password");
    }
    if (cleanSessionSecret) {
      await setAppCredentialInDB("SESSION_SECRET", cleanSessionSecret, "Session Token Secret");
    }

    return res.json({
      success: true,
      message: "Database credentials and application secrets stored securely in database!",
      isConfigured: true,
      storageTarget: "Database & Secure Storage",
      url: cleanUrl
    });
  } catch (err: any) {
    console.error("[Server API] Error saving env config:", err);
    return res.status(500).json({
      success: false,
      error: err?.message || "Failed to validate and save credentials."
    });
  }
});

router.get("/api/setup-status", (req, res) => {
  const envCheck = checkEnvDbCredentials();

  if (!envCheck.isConfigured) {
    clearPersistentDatabaseStatus();
    return res.json({
      envExists: envCheck.envExists,
      isConfigured: false,
      isConnected: false,
      status: "disconnected",
      missingCredentials: envCheck.missingCredentials,
      storageTarget: ".env",
      credentials: {
        VITE_SUPABASE_URL: "",
        VITE_SUPABASE_ANON_KEY: "",
        hasServiceRoleKey: false
      }
    });
  }

  const persistentStatus = getPersistentDatabaseStatus();

  return res.json({
    envExists: true,
    isConfigured: true,
    isConnected: persistentStatus.connected,
    status: persistentStatus.status,
    connectedAt: persistentStatus.connectedAt,
    lastVerifiedAt: persistentStatus.lastVerifiedAt,
    missingCredentials: [],
    storageTarget: ".env",
    credentials: {
      VITE_SUPABASE_URL: envCheck.url,
      VITE_SUPABASE_ANON_KEY: envCheck.anonKey,
      hasServiceRoleKey: Boolean(envCheck.serviceKey && envCheck.serviceKey.length > 15)
    }
  });
});

router.post("/api/reset-supabase-config", (req, res) => {
  try {
    clearDatabaseCredentials();
    clearPersistentDatabaseStatus();

    return res.json({
      success: true,
      message: "Database credentials cleared and persistent status reset",
      isConfigured: false,
      isConnected: false
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || "Failed to reset database credentials" });
  }
});

router.get("/api/supabase-config", (req, res) => {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  const serviceKey = getSupabaseServiceKey();

  const isConfigured = Boolean(
    url && 
    key && 
    serviceKey &&
    url !== "https://placeholder.supabase.co" && 
    key !== "placeholder_key" && 
    url.startsWith("https://") && 
    key.length > 10 &&
    serviceKey.length > 10
  );
  res.json({ 
    url, 
    key, 
    isConfigured, 
    hasServiceRoleKey: Boolean(serviceKey && serviceKey.length > 10),
    envExists: true
  });
});

/**
 * Saves database credentials securely to application state & database
 */
router.post("/api/save-supabase-config", async (req, res) => {
  const { url, key, anonKey, serviceRoleKey } = req.body || {};
  const targetUrl = (url || "").trim();
  const targetAnonKey = (anonKey || key || "").trim();
  const targetServiceKey = (serviceRoleKey || "").trim();

  if (!targetUrl || !targetAnonKey || !targetServiceKey) {
    return res.status(400).json({ 
      success: false, 
      error: "All 3 initial database credentials (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY) are required." 
    });
  }

  if (!targetUrl.startsWith("https://")) {
    return res.status(400).json({ success: false, error: "Supabase Project URL must start with https://" });
  }

  try {
    setDatabaseCredentials(targetUrl, targetAnonKey, targetServiceKey);

    await persistDatabaseConnectionStatus(true, {
      url: targetUrl,
      hasServiceRoleKey: Boolean(targetServiceKey && targetServiceKey.length > 10),
      storageTarget: "Database & Secure Storage"
    });

    console.log("[Server API] Database credentials saved securely:", targetUrl);
    return res.json({
      success: true,
      message: "Database connection credentials saved and verified successfully!",
      isConfigured: true,
      storageTarget: "Database & Secure Storage",
      url: targetUrl
    });
  } catch (err: any) {
    console.error("[Server API] Error saving supabase config:", err);
    return res.status(500).json({ success: false, error: err?.message || "Failed to save Supabase configuration." });
  }
});

/**
 * Extensible Setup Credentials Endpoint:
 * Handles saving all credentials configured from the Setup Page.
 * - Database connection credentials are saved securely in application state & memory.
 * - Any application secrets/tokens are saved securely in the Supabase database.
 */
router.post("/api/save-setup-credentials", async (req, res) => {
  const payload = req.body || {};
  const values: Record<string, string> = payload.credentials || payload;

  const existingServiceKey = getSupabaseServiceKey();
  const existingAnonKey = getSupabaseAnonKey();
  const existingUrl = getSupabaseUrl();

  const url = (values.VITE_SUPABASE_URL || values.url || existingUrl || "").trim();
  const anonKey = (values.VITE_SUPABASE_ANON_KEY || values.anonKey || values.key || existingAnonKey || "").trim();
  const serviceKey = (values.SUPABASE_SERVICE_ROLE_KEY || values.serviceRoleKey || existingServiceKey || "").trim();

  if (!url || !anonKey || !serviceKey) {
    return res.status(400).json({
      success: false,
      error: "All 3 initial database credentials (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY) are required."
    });
  }

  if (!url.startsWith("https://")) {
    return res.status(400).json({
      success: false,
      error: "Supabase Project URL must start with https://"
    });
  }

  try {
    // 1. Verify connection with Supabase before persisting
    const { createClient } = await import("@supabase/supabase-js");
    const testClient = createClient(url, serviceKey || anonKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const startTime = Date.now();
    const { error: testErr } = await testClient
      .from("campaigns")
      .select("count", { count: "exact", head: true });

    if (testErr && testErr.message) {
      if (testErr.code === "PGRST301" || testErr.message.includes("JWT") || testErr.message.includes("key")) {
        return res.status(400).json({
          success: false,
          error: `Supabase authentication failed: ${testErr.message}. Please verify your Project URL and API keys.`
        });
      }
    }
    const latencyMs = Date.now() - startTime;

    // 2. Persist database credentials strictly to .env file
    setDatabaseCredentials(url, anonKey, serviceKey);

    await persistDatabaseConnectionStatus(true, {
      url,
      hasServiceRoleKey: Boolean(serviceKey && serviceKey.length > 10),
      storageTarget: ".env"
    });

    // 3. Save any non-database credentials to Supabase DB
    const nonDbKeys = Object.keys(values).filter(
      k => !["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "url", "anonKey", "key", "serviceRoleKey"].includes(k)
    );

    for (const k of nonDbKeys) {
      const v = (values[k] || "").trim();
      if (v) {
        await setAppCredentialInDB(k, v, `Configured via Setup Page on ${new Date().toLocaleDateString()}`);
      }
    }

    const hasServiceRoleKey = Boolean(serviceKey && serviceKey.length > 15);
    return res.json({
      success: true,
      message: hasServiceRoleKey
        ? "Connected to Supabase database successfully with full Admin (Service Role) privileges!"
        : "Connected to Supabase database successfully (Anon Key access)!",
      isConfigured: true,
      isConnected: true,
      storageTarget: ".env",
      latencyMs,
      hasServiceRoleKey,
      url
    });
  } catch (err: any) {
    console.error("[Server API] Error in save-setup-credentials:", err);
    return res.status(500).json({
      success: false,
      error: err?.message || "Failed to validate and save database credentials."
    });
  }
});

// App Credentials API - Manage and Test Secrets Stored Directly in Supabase DB
router.get("/api/app-credentials", async (req, res) => {
  try {
    const geminiVal = (await getAppCredentialFromDB("GEMINI_API_KEY")) || process.env.GEMINI_API_KEY || "";
    const gmailUserVal = (await getAppCredentialFromDB("GMAIL_USER")) || process.env.GMAIL_USER || "";
    const gmailPassVal = (await getAppCredentialFromDB("GMAIL_APP_PASSWORD")) || process.env.GMAIL_APP_PASSWORD || "";
    const sessionSecret = (await getAppCredentialFromDB("SESSION_SECRET")) || process.env.SESSION_SECRET || "";

    const url = getSupabaseUrl();
    const serviceKey = getSupabaseServiceKey() || getSupabaseAnonKey();

    let creds: any[] = [];
    if (url && serviceKey && url.startsWith("https://")) {
      try {
        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(url, serviceKey);
        const { data, error } = await supabase
          .from("app_credentials")
          .select("key, description, updated_at");
        if (!error && data) creds = data;
      } catch (e) {}
    }

    const map: Record<string, any> = {};
    const customKeys: string[] = [];

    creds.forEach(c => {
      map[c.key] = {
        configured: true,
        description: c.description,
        updated_at: c.updated_at
      };
      if (!["GEMINI_API_KEY", "GMAIL_USER", "GMAIL_APP_PASSWORD", "SESSION_SECRET"].includes(c.key)) {
        customKeys.push(c.key);
      }
    });

    const isPlaceholderPass = !gmailPassVal ||
      gmailPassVal === "your-16-character-app-password" ||
      gmailPassVal.includes("placeholder") ||
      gmailPassVal.includes("your-16-character");

    const isGmailConfigured = Boolean(
      gmailUserVal && 
      gmailUserVal.trim().length > 0 &&
      gmailPassVal &&
      !isPlaceholderPass
    );

    return res.json({
      success: true,
      credentials: {
        hasGeminiKey: Boolean(geminiVal),
        geminiConfigured: Boolean(geminiVal),
        gmailUser: gmailUserVal || "",
        gmailAppPassword: gmailPassVal || "",
        hasGmailPassword: Boolean(gmailPassVal && !isPlaceholderPass),
        isPlaceholderPassword: isPlaceholderPass,
        gmailConfigured: isGmailConfigured,
        hasSessionSecret: Boolean(sessionSecret),
        gmailUpdatedAt: map["GMAIL_USER"]?.updated_at || map["GMAIL_APP_PASSWORD"]?.updated_at || null,
        ...map
      },
      customKeys
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/api/save-app-credential", async (req, res) => {
  const { key, value, description, type, user, pass } = req.body || {};

  // Support direct Gmail credentials save
  if (type === "gmail" || key === "GMAIL_CREDENTIALS") {
    const gmailUser = (user || "").trim();
    let gmailPass = (pass || "").trim();

    if (!gmailUser) {
      return res.status(400).json({ success: false, error: "Sender email is required." });
    }

    if (!gmailPass) {
      gmailPass = (await getAppCredentialFromDB("GMAIL_APP_PASSWORD")) || process.env.GMAIL_APP_PASSWORD || "";
      gmailPass = gmailPass.trim().replace(/\s+/g, "").replace(/["']/g, "");
    }

    try {
      await setAppCredentialInDB("GMAIL_USER", gmailUser, "Gmail SMTP Notification User");
      if (gmailPass) {
        await setAppCredentialInDB("GMAIL_APP_PASSWORD", gmailPass, "Gmail SMTP App Password");
      }
      process.env.GMAIL_USER = gmailUser;
      if (gmailPass) {
        process.env.GMAIL_APP_PASSWORD = gmailPass;
      }
      saveToEnvFile({
        GMAIL_USER: gmailUser,
        ...(gmailPass ? { GMAIL_APP_PASSWORD: gmailPass } : {})
      });
      return res.json({
        success: true,
        message: "Gmail Dispatcher credentials saved and stored in database successfully!",
        gmailUser,
        gmailAppPassword: gmailPass
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  if (!key || !value) {
    return res.status(400).json({ success: false, error: "Key and Value are required." });
  }

  try {
    const saved = await setAppCredentialInDB(key.trim(), value.trim(), description);
    if (!saved) {
      return res.status(500).json({ success: false, error: "Failed to store credential in database." });
    }

    return res.json({
      success: true,
      message: `Credential ${key} saved securely in the database!`
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Test credential against real service, then store directly in Supabase DB if valid.
 */
router.post("/api/test-app-credential", async (req, res) => {
  const { type, key, value, user, pass, action } = req.body || {};

  try {
    if (type === "gemini") {
      const apiKey = (value || "").trim();
      if (!apiKey) {
        return res.status(400).json({ success: false, error: "Gemini API Key is required." });
      }

      if (action === "save") {
        await setAppCredentialInDB("GEMINI_API_KEY", apiKey, "Google Gemini AI API Key");
        return res.json({
          success: true,
          message: "Gemini API Key saved securely in database!"
        });
      }

      // Test Gemini API key directly with a lightweight ping
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey });
      await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: "Respond with the word 'OK' only."
      });

      // Save directly into Supabase database
      await setAppCredentialInDB("GEMINI_API_KEY", apiKey, "Google Gemini AI API Key");

      return res.json({
        success: true,
        message: "Gemini API Key verified and stored securely in database!"
      });
    }

    if (type === "gmail") {
      const gmailUser = (user || "").trim().toLowerCase();
      let gmailPass = (pass || "").trim().replace(/\s+/g, "").replace(/["']/g, "");

      if (!gmailUser) {
        return res.status(400).json({ success: false, error: "Gmail sender email is required." });
      }

      // If user did not re-type password, pull existing stored password
      if (!gmailPass) {
        gmailPass = (await getAppCredentialFromDB("GMAIL_APP_PASSWORD")) || process.env.GMAIL_APP_PASSWORD || "";
        gmailPass = gmailPass.trim().replace(/\s+/g, "").replace(/["']/g, "");
      }

      // Direct Save action: persist immediately without blocking on external SMTP handshake
      if (action === "save") {
        await setAppCredentialInDB("GMAIL_USER", gmailUser, "Gmail SMTP Notification User");
        if (gmailPass) {
          await setAppCredentialInDB("GMAIL_APP_PASSWORD", gmailPass, "Gmail SMTP App Password");
        }
        process.env.GMAIL_USER = gmailUser;
        if (gmailPass) {
          process.env.GMAIL_APP_PASSWORD = gmailPass;
        }
        saveToEnvFile({
          GMAIL_USER: gmailUser,
          ...(gmailPass ? { GMAIL_APP_PASSWORD: gmailPass } : {})
        });
        return res.json({
          success: true,
          message: "Gmail Dispatcher credentials saved and stored successfully!",
          gmailUser,
          gmailAppPassword: gmailPass
        });
      }

      if (!gmailPass) {
        return res.status(400).json({ success: false, error: "Gmail 16-character App Password is required to test SMTP." });
      }

      const isPlaceholder = 
        gmailPass === "your-16-character-app-password" ||
        gmailPass.includes("placeholder") ||
        gmailPass.includes("your-16-character");
      if (isPlaceholder) {
        return res.status(400).json({
          success: false,
          error: "The App Password is currently set to the default placeholder ('your-16-character-app-password'). Please enter your actual 16-character Google App Password (generated at myaccount.google.com/apppasswords) and click Save or Test."
        });
      }

      try {
        // Verify SMTP handshake with nodemailer on port 465 SSL
        const transporter = nodemailer.createTransport({
          host: "smtp.gmail.com",
          port: 465,
          secure: true,
          auth: {
            user: gmailUser,
            pass: gmailPass
          },
          connectionTimeout: 12000,
          greetingTimeout: 12000,
          socketTimeout: 12000
        });

        await transporter.verify();

        // Save directly into Supabase database & runtime environment
        await setAppCredentialInDB("GMAIL_USER", gmailUser, "Gmail SMTP Notification User");
        await setAppCredentialInDB("GMAIL_APP_PASSWORD", gmailPass, "Gmail SMTP App Password");
        process.env.GMAIL_USER = gmailUser;
        process.env.GMAIL_APP_PASSWORD = gmailPass;
        saveToEnvFile({
          GMAIL_USER: gmailUser,
          GMAIL_APP_PASSWORD: gmailPass
        });

        return res.json({
          success: true,
          message: `Gmail SMTP verified successfully! Ready to dispatch QA approvals from ${gmailUser}.`,
          gmailUser,
          gmailAppPassword: gmailPass
        });
      } catch (smtpErr: any) {
        console.warn("[Server API] SMTP verification test failed:", smtpErr.message);
        let errDesc = smtpErr.message || "Failed to verify Gmail SMTP connection.";
        if (smtpErr.message?.includes("535") || smtpErr.message?.includes("Username and Password not accepted")) {
          errDesc = "Google Authentication Failed (535-5.7.8): Username or App Password rejected by Gmail. Please ensure 2-Step Verification is active on your Google account and enter a 16-character App Password (generated at myaccount.google.com/apppasswords), NOT your regular Gmail account password.";
        }
        return res.status(400).json({
          success: false,
          error: errDesc
        });
      }
    }

    if (type === "custom") {
      const customKey = (key || "").trim();
      const customVal = (value || "").trim();
      if (!customKey || !customVal) {
        return res.status(400).json({ success: false, error: "Secret key and value are required." });
      }

      await setAppCredentialInDB(customKey, customVal, "Custom Application Secret");

      return res.json({
        success: true,
        message: `Secret ${customKey} saved securely in database!`
      });
    }

    return res.status(400).json({ success: false, error: "Invalid credential type." });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      error: `Test failed: ${err.message || "Could not verify credentials."}`
    });
  }
});

/**
 * Diagnostic tool: Runs comprehensive SMTP verification on Port 465 (SSL) and Port 587 (STARTTLS)
 * using credentials stored in Supabase DB (app_credentials).
 */
router.all(["/api/smtp/diagnostics"], async (req, res) => {
  const { user, pass } = req.body || {};
  try {
    const diag = await runSmtpDiagnostics(user, pass);
    return res.json({ success: true, ...diag });
  } catch (err: any) {
    console.error("[SMTP Diagnostics API] Error:", err.message);
    return res.status(500).json({
      success: false,
      overallStatus: "failed",
      error: err.message || "Failed to run SMTP diagnostics"
    });
  }
});

/**
 * Diagnostic tool: Dispatches a real test email to verify end-to-end delivery using DB credentials.
 */
router.post("/api/smtp/test-email", async (req, res) => {
  const { to, user, pass } = req.body || {};
  const recipient = (to || "").trim();

  if (!recipient || !recipient.includes("@")) {
    return res.status(400).json({
      success: false,
      error: "Please provide a valid recipient email address (e.g. your email) to receive the test message."
    });
  }

  try {
    const result = await sendTestEmail(recipient, user, pass);
    return res.json({
      success: true,
      message: result.message,
      port: result.port,
      user: result.user,
      host: result.host,
      messageId: result.messageId,
      latencyMs: result.latencyMs
    });
  } catch (err: any) {
    console.error("[SMTP Test Email API] Delivery failed:", err.message);
    let suggestion = "Check your sender email and Google 16-character App Password in Settings.";
    if (err.message?.includes("535")) {
      suggestion = "Google rejected the authentication. Ensure 2-Step Verification is active and generate a new App Password at myaccount.google.com/apppasswords.";
    } else if (err.message?.includes("ETIMEDOUT") || err.message?.includes("ECONNREFUSED")) {
      suggestion = "Outbound connection timed out. If running on a restricted cloud host, verify outbound ports 465 and 587 are not blocked.";
    }
    return res.status(400).json({
      success: false,
      error: err.message || "Failed to send test email.",
      suggestion
    });
  }
});

router.post("/api/test-db-connection", async (req, res) => {
  const startTime = Date.now();
  const targetUrl = (req.body?.url || getSupabaseUrl() || "").trim();
  const targetKey = (req.body?.key || req.body?.anonKey || getSupabaseServiceKey() || getSupabaseAnonKey() || "").trim();

  if (!targetUrl || !targetKey) {
    return res.status(400).json({ success: false, message: "Missing Supabase URL or Key to test." });
  }

  try {
    const { createClient } = await import("@supabase/supabase-js");
    const testClient = createClient(targetUrl, targetKey);

    const tablesFound: string[] = [];
    const tablesToCheck = ["campaigns", "app_users", "teams", "activity_logs", "checklists", "countries", "folders"];
    
    for (const tbl of tablesToCheck) {
      try {
        const { error } = await testClient.from(tbl).select("count", { count: "exact", head: true });
        if (!error || error.code !== "42P01") {
          tablesFound.push(tbl);
        }
      } catch (e) {}
    }

    const latencyMs = Date.now() - startTime;
    return res.json({
      success: true,
      connected: true,
      latencyMs,
      tablesFound,
      totalTablesChecked: tablesToCheck.length,
      url: targetUrl
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      connected: false,
      latencyMs: Date.now() - startTime,
      error: err?.message || "Connection test failed."
    });
  }
});

router.get("/api/export-migration-data", async (req, res) => {
  try {
    const supabaseUrl = getSupabaseUrl();
    const supabaseKey = getSupabaseServiceKey();
    let campaigns: any[] = [];
    let users: any[] = getCurrentAppState().users || [];
    let logs: any[] = [];
    let folders: any[] = [];
    let checklists: any[] = [];

    if (supabaseUrl && supabaseKey) {
      const { createClient } = await import("@supabase/supabase-js");
      const client = createClient(supabaseUrl, supabaseKey);
      try {
        const { data: cData } = await client.from("campaigns").select("*");
        if (cData) campaigns = cData;
      } catch (e) {}
      try {
        const { data: uData } = await client.from("app_users").select("*");
        if (uData && uData.length > 0) users = uData;
      } catch (e) {}
      try {
        const { data: lData } = await client.from("activity_logs").select("*").order("created_at", { ascending: false }).limit(500);
        if (lData) logs = lData;
      } catch (e) {}
      try {
        const { data: fData } = await client.from("folders").select("*");
        if (fData) folders = fData;
      } catch (e) {}
      try {
        const { data: chkData } = await client.from("checklists").select("*");
        if (chkData) checklists = chkData;
      } catch (e) {}
    }

    const exportBundle = {
      exportVersion: "2.0-enterprise",
      manifest: {
        backupId: `hpqa-bak-${Date.now()}`,
        exportedAt: new Date().toISOString(),
        environment: "HP QA Platform v5",
        generator: "HP QA Platform Data Management Console",
        recordCounts: {
          campaigns: campaigns.length,
          users: users.length,
          folders: folders.length,
          logs: logs.length,
          checklists: checklists.length
        }
      },
      appState: {
        quick_login_enabled: getCurrentAppState().quick_login_enabled
      },
      campaigns,
      users,
      folders,
      checklists,
      logs
    };

    res.setHeader("Content-Disposition", `attachment; filename="hp_qa_database_backup_${new Date().toISOString().slice(0, 10)}.json"`);
    res.setHeader("Content-Type", "application/json");
    return res.json(exportBundle);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to export migration data" });
  }
});

router.post("/api/import-migration-data", async (req, res) => {
  try {
    const bundle = req.body;
    if (!bundle) {
      return res.status(400).json({ error: "Invalid backup bundle format" });
    }

    if (bundle.appState?.quick_login_enabled !== undefined) {
      getCurrentAppState().quick_login_enabled = Boolean(bundle.appState.quick_login_enabled);
    }
    if (Array.isArray(bundle.users) && bundle.users.length > 0) {
      getCurrentAppState().users = bundle.users;
    }
    saveAppState(getCurrentAppState());

    let insertedCampaigns = 0;
    let insertedFolders = 0;
    let insertedUsers = 0;
    let insertedChecklists = 0;
    let insertedLogs = 0;

    const supabaseUrl = getSupabaseUrl();
    const supabaseKey = getSupabaseServiceKey();
    if (supabaseUrl && supabaseKey) {
      const { createClient } = await import("@supabase/supabase-js");
      const client = createClient(supabaseUrl, supabaseKey);

      // 1. Restore Folders first (so campaigns can reference folder_id)
      if (Array.isArray(bundle.folders) && bundle.folders.length > 0) {
        for (const folder of bundle.folders) {
          try {
            await client.from("folders").upsert(folder);
            insertedFolders++;
          } catch (e) {}
        }
      }

      // 2. Restore Campaigns
      if (Array.isArray(bundle.campaigns) && bundle.campaigns.length > 0) {
        for (const camp of bundle.campaigns) {
          try {
            await client.from("campaigns").upsert(camp);
            insertedCampaigns++;
          } catch (e) {}
        }
      }

      // 3. Restore App Users
      if (Array.isArray(bundle.users) && bundle.users.length > 0) {
        for (const user of bundle.users) {
          try {
            await client.from("app_users").upsert(user);
            insertedUsers++;
          } catch (e) {}
        }
      }

      // 4. Restore Checklists if present
      if (Array.isArray(bundle.checklists) && bundle.checklists.length > 0) {
        for (const chk of bundle.checklists) {
          try {
            await client.from("checklists").upsert(chk);
            insertedChecklists++;
          } catch (e) {}
        }
      }

      // 5. Restore Activity Logs if present
      if (Array.isArray(bundle.logs) && bundle.logs.length > 0) {
        for (const log of bundle.logs.slice(0, 100)) {
          try {
            await client.from("activity_logs").upsert(log);
            insertedLogs++;
          } catch (e) {}
        }
      }

      // Log the database restoration event
      try {
        await client.from("activity_logs").insert([{
          id: `restore-${Date.now()}`,
          action: "Database Restored",
          details: `Manual backup restored: ${insertedCampaigns} campaigns, ${insertedFolders} folders, ${insertedUsers} users`,
          created_at: new Date().toISOString()
        }]);
      } catch (e) {}
    }

    console.log(`[Server API] Database restoration completed: ${insertedCampaigns} campaigns, ${insertedFolders} folders, ${insertedUsers} users.`);

    return res.json({
      success: true,
      message: `Database successfully restored! Synchronized ${insertedCampaigns} campaigns, ${insertedFolders} folders, ${insertedUsers} users, and ${insertedChecklists} checklists. Existing credentials and connection settings remain intact.`,
      stats: {
        campaigns: insertedCampaigns,
        folders: insertedFolders,
        users: insertedUsers,
        checklists: insertedChecklists,
        logs: insertedLogs
      }
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to import migration data" });
  }
});

router.get("/api/app-settings", async (req, res) => {
  try {
    const supabaseUrl = getSupabaseUrl();
    const supabaseKey = getSupabaseServiceKey() || getSupabaseAnonKey();
    if (supabaseUrl && supabaseKey && supabaseUrl.startsWith("https://")) {
      const { createClient } = await import("@supabase/supabase-js");
      const client = createClient(supabaseUrl, supabaseKey);
      const { data: dbSettings } = await client
        .from("app_settings")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (dbSettings && dbSettings.quick_login_enabled !== undefined && dbSettings.quick_login_enabled !== null) {
        getCurrentAppState().quick_login_enabled = Boolean(dbSettings.quick_login_enabled);
        saveAppState(getCurrentAppState());
      }
    }
  } catch (e) {}

  res.json({ quick_login_enabled: getCurrentAppState().quick_login_enabled });
});

router.post("/api/app-settings", async (req, res) => {
  if (req.body && req.body.quick_login_enabled !== undefined) {
    const newEnabled = Boolean(req.body.quick_login_enabled);
    getCurrentAppState().quick_login_enabled = newEnabled;

    // If master toggle is turned off, disable quick login for all users as well
    if (!newEnabled && Array.isArray(getCurrentAppState().users)) {
      getCurrentAppState().users = getCurrentAppState().users.map((u: any) => ({
        ...u,
        quick_login_enabled: false
      }));
    }

    saveAppState(getCurrentAppState());

    try {
      const supabaseUrl = getSupabaseUrl();
      const supabaseKey = getSupabaseServiceKey() || getSupabaseAnonKey();
      if (supabaseUrl && supabaseKey && supabaseUrl.startsWith("https://")) {
        const { createClient } = await import("@supabase/supabase-js");
        const client = createClient(supabaseUrl, supabaseKey);
        
        const { data: rows } = await client.from("app_settings").select("id").limit(10);
        if (rows && rows.length > 0) {
          for (const row of rows) {
            await client.from("app_settings").update({
              quick_login_enabled: newEnabled,
              updated_at: new Date().toISOString()
            }).eq("id", row.id);
          }
        } else {
          await client.from("app_settings").insert([{
            quick_login_enabled: newEnabled,
            updated_at: new Date().toISOString()
          }]);
        }

        // If master toggle is turned off, update all users in Supabase app_users table to false
        if (!newEnabled) {
          try {
            await client.from("app_users").update({
              quick_login_enabled: false
            }).neq("status", "banned_never_match_placeholder");
          } catch (uErr) {
            console.warn("[Server] Note updating app_users quick_login_enabled:", uErr);
          }
        }
      }
    } catch (e) {
      console.warn("[Server] Notice updating Supabase app_settings:", e);
    }
  }
  res.json({ success: true, quick_login_enabled: getCurrentAppState().quick_login_enabled, users: getCurrentAppState().users });
});

export default router;

