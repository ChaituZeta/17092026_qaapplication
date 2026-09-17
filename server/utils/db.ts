import fs from "fs";
import path from "path";
import dotenv from "dotenv";

/**
 * Returns the path to the .env file in the current working directory.
 */
export function getEnvFilePath(): string {
  return path.join(process.cwd(), ".env");
}

/**
 * Parses the .env file directly from disk.
 * Returns { exists: boolean, env: Record<string, string> }.
 */
export function readEnvDirectly(): { exists: boolean; env: Record<string, string> } {
  const envPath = getEnvFilePath();
  if (!fs.existsSync(envPath)) {
    return { exists: false, env: {} };
  }
  try {
    const raw = fs.readFileSync(envPath, "utf-8");
    const parsed = dotenv.parse(raw) || {};
    // Also parse YAML-style 'KEY: VALUE' lines if dotenv didn't capture them
    raw.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      if (!trimmed.includes("=") && trimmed.includes(":")) {
        const colonIdx = trimmed.indexOf(":");
        const k = trimmed.slice(0, colonIdx).trim();
        const v = trimmed.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, "");
        if (k && v && !parsed[k]) {
          parsed[k] = v;
        }
      }
    });
    return { exists: true, env: parsed };
  } catch (err) {
    console.error("[DB Utils] Error reading .env file:", err);
    return { exists: true, env: {} };
  }
}

/**
 * Inspects whether the .env file exists and contains all required DB credentials.
 */
export const checkEnvDbCredentials = (): {
  envExists: boolean;
  isConfigured: boolean;
  missingCredentials: string[];
  url: string;
  anonKey: string;
  serviceKey: string;
} => {
  const { exists, env } = readEnvDirectly();
  const url = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  const anonKey = (env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "").trim();
  const serviceKey = (env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || "").trim();

  const missing: string[] = [];
  if (!url || !url.startsWith("https://") || url === "https://placeholder.supabase.co") {
    missing.push("VITE_SUPABASE_URL");
  }
  if (!anonKey || anonKey.length < 15 || anonKey === "placeholder_key") {
    missing.push("VITE_SUPABASE_ANON_KEY");
  }
  if (!serviceKey || serviceKey.length < 15 || serviceKey === "placeholder_key") {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }

  const isConfigured = missing.length === 0;

  return {
    envExists: exists,
    isConfigured,
    missingCredentials: missing,
    url: isConfigured ? url : (url.startsWith("https://") ? url : ""),
    anonKey: isConfigured ? anonKey : (anonKey.length >= 15 ? anonKey : ""),
    serviceKey: isConfigured ? serviceKey : (serviceKey.length >= 15 ? serviceKey : (anonKey.length >= 15 ? anonKey : ""))
  };
};

/**
 * Gets Supabase URL strictly from configured .env. Returns empty string if not configured.
 */
export const getSupabaseUrl = (): string => {
  const { isConfigured, url } = checkEnvDbCredentials();
  return isConfigured ? url : "";
};

/**
 * Gets Supabase Anon Key strictly from configured .env. Returns empty string if not configured.
 */
export const getSupabaseAnonKey = (): string => {
  const { isConfigured, anonKey } = checkEnvDbCredentials();
  return isConfigured ? anonKey : "";
};

/**
 * Gets Supabase Service Role Key strictly from configured .env. Returns empty string if not configured.
 */
export const getSupabaseServiceKey = (): string => {
  const { isConfigured, serviceKey } = checkEnvDbCredentials();
  return isConfigured ? serviceKey : "";
};

/**
 * Saves database credentials EXCLUSIVELY to the .env file.
 * If .env does not exist, it creates the file.
 * If .env exists, it updates or adds the database credentials while preserving any other existing keys.
 */
export function saveToEnvFile(entries: Record<string, string>): string {
  const envPath = getEnvFilePath();
  const { env: existing } = readEnvDirectly();
  const merged: Record<string, string> = { ...existing };

  for (const [k, v] of Object.entries(entries)) {
    const trimmedVal = (v || "").trim();
    if (trimmedVal) {
      merged[k] = trimmedVal;
      process.env[k] = trimmedVal;
    } else {
      delete merged[k];
      delete process.env[k];
    }
  }

  // Strictly enforce that ONLY database connection credentials belong in .env
  const lines: string[] = [];
  const dbOnlyKeys = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
  for (const key of dbOnlyKeys) {
    if (merged[key]) {
      lines.push(`${key}=${merged[key]}`);
    }
  }

  try {
    fs.writeFileSync(envPath, lines.join("\n").trim() + "\n", "utf-8");
  } catch (fsErr) {
    // In serverless environments (e.g. Vercel / AWS Lambda), the filesystem outside /tmp is read-only.
    // process.env has already been updated in memory above.
    console.warn("[DB Utils] Could not write to .env file on disk (read-only filesystem):", fsErr);
  }

  try {
    dotenv.config({ path: envPath, override: true });
  } catch {}

  return envPath;
}

/**
 * Persists database credentials strictly to .env file.
 */
export const setDatabaseCredentials = (url: string, anonKey: string, serviceRoleKey?: string): void => {
  saveToEnvFile({
    VITE_SUPABASE_URL: (url || "").trim(),
    VITE_SUPABASE_ANON_KEY: (anonKey || "").trim(),
    SUPABASE_SERVICE_ROLE_KEY: (serviceRoleKey || "").trim()
  });
};

/**
 * Clears database credentials from .env file and in-memory process.env.
 */
export const clearDatabaseCredentials = (): void => {
  delete process.env.VITE_SUPABASE_URL;
  delete process.env.SUPABASE_URL;
  delete process.env.VITE_SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

  saveToEnvFile({
    VITE_SUPABASE_URL: "",
    VITE_SUPABASE_ANON_KEY: "",
    SUPABASE_SERVICE_ROLE_KEY: ""
  });
};

// Purge any container-injected DB credentials if .env does not have them configured
(() => {
  const check = checkEnvDbCredentials();
  if (!check.isConfigured) {
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.SUPABASE_URL;
    delete process.env.VITE_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
  }
})();

export { getAppCredentialFromDB } from "./credentials.ts";
