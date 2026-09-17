import fs from "fs";
import path from "path";
import { getSupabaseUrl, getSupabaseAnonKey, getSupabaseServiceKey, checkEnvDbCredentials } from "./db.ts";
import { setAppCredentialInDB } from "./credentials.ts";

const TMP_STATUS_FILE = path.join("/tmp", "hp_qa_db_status.json");

export interface DatabaseConnectionStatus {
  connected: boolean;
  status: "connected" | "disconnected";
  url: string;
  connectedAt?: string;
  lastVerifiedAt?: string;
  storageTarget: string;
  hasServiceRoleKey: boolean;
  source: "hidden_file" | "database" | "environment" | "initial";
}

function readHiddenConfigFile(): Partial<DatabaseConnectionStatus> | null {
  try {
    if (fs.existsSync(TMP_STATUS_FILE)) {
      const raw = fs.readFileSync(TMP_STATUS_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
    }
  } catch {}
  return null;
}

function writeHiddenConfigFile(data: DatabaseConnectionStatus): boolean {
  try {
    fs.writeFileSync(TMP_STATUS_FILE, JSON.stringify(data, null, 2), "utf-8");
    return true;
  } catch {}
  return false;
}

/**
 * Persistently records the 'Database Connected' status.
 */
export async function persistDatabaseConnectionStatus(
  connected: boolean,
  details?: {
    url?: string;
    hasServiceRoleKey?: boolean;
    storageTarget?: string;
  }
): Promise<DatabaseConnectionStatus> {
  const now = new Date().toISOString();
  const existing = readHiddenConfigFile() || {};
  const currentUrl = details?.url || existing.url || getSupabaseUrl();
  const hasServiceRoleKey = details?.hasServiceRoleKey !== undefined
    ? details.hasServiceRoleKey
    : Boolean(getSupabaseServiceKey() && getSupabaseServiceKey().length > 10);

  const statusObj: DatabaseConnectionStatus = {
    connected,
    status: connected ? "connected" : "disconnected",
    url: connected ? currentUrl : "",
    connectedAt: connected ? (existing.connectedAt || now) : undefined,
    lastVerifiedAt: now,
    storageTarget: details?.storageTarget || existing.storageTarget || ".env",
    hasServiceRoleKey: connected ? hasServiceRoleKey : false,
    source: "environment"
  };

  writeHiddenConfigFile(statusObj);

  if (connected && currentUrl && currentUrl.startsWith("https://")) {
    try {
      await setAppCredentialInDB(
        "DATABASE_CONNECTED_STATUS",
        JSON.stringify({
          connected: true,
          status: "connected",
          url: currentUrl,
          connectedAt: statusObj.connectedAt,
          lastVerifiedAt: statusObj.lastVerifiedAt,
          storageTarget: statusObj.storageTarget
        }),
        "Persistent tracking of database connected status for /setup confirmation view"
      );
    } catch (dbErr) {
      console.warn("[dbStatus] Note recording status to database table:", dbErr);
    }
  }

  return statusObj;
}

/**
 * Reads database connection status strictly by validating credentials in .env.
 */
export function getPersistentDatabaseStatus(): DatabaseConnectionStatus {
  const envCheck = checkEnvDbCredentials();

  if (!envCheck.isConfigured) {
    clearPersistentDatabaseStatus();
    return {
      connected: false,
      status: "disconnected",
      url: "",
      storageTarget: ".env",
      hasServiceRoleKey: false,
      source: "environment"
    };
  }

  const hiddenData = readHiddenConfigFile();
  const statusObj: DatabaseConnectionStatus = {
    connected: true,
    status: "connected",
    url: envCheck.url,
    connectedAt: hiddenData?.connectedAt || new Date().toISOString(),
    lastVerifiedAt: new Date().toISOString(),
    storageTarget: ".env",
    hasServiceRoleKey: Boolean(envCheck.serviceKey && envCheck.serviceKey.length > 15),
    source: "environment"
  };
  writeHiddenConfigFile(statusObj);
  return statusObj;
}

/**
 * Clears database connection status
 */
export function clearPersistentDatabaseStatus() {
  const resetObj: DatabaseConnectionStatus = {
    connected: false,
    status: "disconnected",
    url: "",
    storageTarget: ".env",
    hasServiceRoleKey: false,
    source: "initial"
  };
  writeHiddenConfigFile(resetObj);
  try {
    if (fs.existsSync(TMP_STATUS_FILE)) fs.unlinkSync(TMP_STATUS_FILE);
    const legacyFile = path.join(process.cwd(), ".db_status.json");
    if (fs.existsSync(legacyFile)) fs.unlinkSync(legacyFile);
  } catch {}
}
