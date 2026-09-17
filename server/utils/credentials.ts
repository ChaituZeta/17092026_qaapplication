import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrl, getSupabaseServiceKey, getSupabaseAnonKey } from "./db.ts";

// In-memory runtime cache to minimize database roundtrips during active requests
const memoryCredentialsCache: Record<string, string> = {};

/**
 * Retrieves an application credential securely from the Supabase database.
 * Stored strictly in the database `app_credentials` table.
 */
export async function getAppCredentialFromDB(key: string): Promise<string> {
  // Check memory cache first
  if (memoryCredentialsCache[key]) {
    return memoryCredentialsCache[key];
  }

  const url = getSupabaseUrl();
  const serviceKey = getSupabaseServiceKey() || getSupabaseAnonKey();

  if (url && serviceKey && url.startsWith("https://")) {
    try {
      const supabase = createClient(url, serviceKey);
      const { data, error } = await supabase
        .from("app_credentials")
        .select("value")
        .eq("key", key)
        .maybeSingle();

      if (!error && data && data.value) {
        memoryCredentialsCache[key] = data.value;
        return data.value;
      }
    } catch (e) {
      // Database not ready or table missing
    }
  }

  // Fallback to process.env if set at startup/container level
  const envVal = process.env[key] || "";
  if (envVal) {
    memoryCredentialsCache[key] = envVal;
  }

  if (key === "GMAIL_USER") {
    const cleanUser = envVal.trim().toLowerCase();
    if (!cleanUser || cleanUser === "test@gmail.com" || cleanUser.includes("example.com")) {
      return "";
    }
    return cleanUser;
  }

  if (key === "GMAIL_APP_PASSWORD") {
    const cleanPass = envVal.trim().replace(/\s+/g, "").replace(/["']/g, "");
    if (!cleanPass || cleanPass === "abcdefghijklmnop" || cleanPass.length < 14) {
      return "";
    }
    return cleanPass;
  }

  return envVal;
}

/**
 * Stores an application credential securely in the database (app_credentials table).
 * Strictly keeps application secrets out of the .env file.
 */
export async function setAppCredentialInDB(key: string, value: string, description?: string): Promise<boolean> {
  let sanitizedVal = (value || "").trim();
  if (key === "GMAIL_USER") {
    sanitizedVal = sanitizedVal.toLowerCase();
  } else if (key === "GMAIL_APP_PASSWORD") {
    sanitizedVal = sanitizedVal.replace(/\s+/g, "").replace(/["']/g, "");
  }

  // Update in-memory runtime cache for the active node process
  memoryCredentialsCache[key] = sanitizedVal;
  process.env[key] = sanitizedVal;

  const url = getSupabaseUrl();
  const serviceKey = getSupabaseServiceKey() || getSupabaseAnonKey();

  if (!url || !serviceKey || !url.startsWith("https://")) {
    console.warn(`[Credentials] Cannot save ${key} to database: Supabase database is not configured yet.`);
    return true;
  }

  try {
    const supabase = createClient(url, serviceKey);

    const { error } = await supabase
      .from("app_credentials")
      .upsert({
        key,
        value: sanitizedVal,
        description: description || "",
        updated_at: new Date().toISOString()
      }, { onConflict: "key" });

    if (error) {
      console.error(`[Credentials] Failed to store ${key} in app_credentials table:`, error.message);
      return false;
    }

    return true;
  } catch (supabaseErr: any) {
    console.error(`[Credentials] Error saving credential ${key} to Supabase:`, supabaseErr?.message);
    return false;
  }
}
