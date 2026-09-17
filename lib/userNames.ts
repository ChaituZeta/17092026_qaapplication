import { supabase, isSupabaseConfigured } from "@/lib/supabase";

export interface AppUserMeta {
  id?: string;
  name?: string;
  email?: string;
  role?: string;
  team?: string;
}

// In-memory cache of app_users metadata
let cachedAppUsers: AppUserMeta[] = [];
let lastFetchTime = 0;
const CACHE_DURATION_MS = 60 * 1000; // 1 minute cache

/**
 * Loads app_users metadata from Supabase with fallbacks to local state and API
 */
export async function loadAppUsersMetadata(): Promise<AppUserMeta[]> {
  const now = Date.now();
  if (cachedAppUsers.length > 0 && now - lastFetchTime < CACHE_DURATION_MS) {
    return cachedAppUsers;
  }

  try {
    if (isSupabaseConfigured()) {
      const { data, error } = await supabase
        .from("app_users")
        .select("id, name, email, role, team")
        .neq("status", "banned")
        .order("created_at", { ascending: true });

      if (!error && Array.isArray(data) && data.length > 0) {
        cachedAppUsers = data;
        lastFetchTime = now;
        try {
          localStorage.setItem("hp_app_users_cache", JSON.stringify(data));
        } catch {}
        return data;
      }
    }

    // Fallback to server endpoint
    const res = await fetch("/api/app-users");
    if (res.ok) {
      const json = await res.json();
      if (json.users && Array.isArray(json.users) && json.users.length > 0) {
        cachedAppUsers = json.users;
        lastFetchTime = now;
        try {
          localStorage.setItem("hp_app_users_cache", JSON.stringify(json.users));
        } catch {}
        return json.users;
      }
    }
  } catch (err) {
    console.warn("[userNames] Error fetching app_users metadata:", err);
  }

  // Fallback to localStorage
  try {
    const raw = localStorage.getItem("hp_app_users_cache");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        cachedAppUsers = parsed;
        return parsed;
      }
    }
  } catch {}

  return cachedAppUsers;
}

/**
 * Synchronously retrieves cached app users or empty array
 */
export function getCachedAppUsers(): AppUserMeta[] {
  if (cachedAppUsers.length > 0) return cachedAppUsers;
  try {
    const raw = localStorage.getItem("hp_app_users_cache");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        cachedAppUsers = parsed;
        return parsed;
      }
    }
  } catch {}
  return [];
}

/**
 * Resolves a clean, human full name (e.g. 'Chaithanya' or 'Chaithanya Bogineni')
 * by querying app_users metadata consistently, never returning a raw email address.
 */
export function resolveUserFullName(
  input?: string | null,
  usersListOrFallback?: AppUserMeta[] | string,
  defaultFallback = "Chaithanya"
): string {
  let usersList: AppUserMeta[] | undefined;
  let fallback = defaultFallback;

  if (typeof usersListOrFallback === "string") {
    fallback = usersListOrFallback;
  } else if (Array.isArray(usersListOrFallback)) {
    usersList = usersListOrFallback;
  }

  if (!input || typeof input !== "string") {
    return fallback;
  }

  const raw = input.trim();
  if (!raw) return fallback;

  // If already a clean name without @ and not a generic placeholder
  if (!raw.includes("@") && !/^qa\s*user$/i.test(raw) && !/^user$/i.test(raw) && !/^admin$/i.test(raw)) {
    return raw;
  }

  const users = usersList && usersList.length > 0 ? usersList : getCachedAppUsers();
  const lower = raw.toLowerCase();

  // 1. Search in app_users by exact email, id, or name match
  if (users.length > 0) {
    const matched = users.find(u => 
      (u.email && u.email.toLowerCase() === lower) ||
      (u.id && u.id.toLowerCase() === lower) ||
      (u.name && u.name.toLowerCase() === lower)
    );

    if (matched?.name && matched.name.trim()) {
      const cleanName = matched.name.trim();
      if (!/^qa\s*user$/i.test(cleanName) && !cleanName.includes("@")) {
        return cleanName;
      }
    }
  }

  // 2. Known team member pattern heuristics
  if (lower.includes("chaithanya") || lower.includes("bogineni")) {
    return "Chaithanya";
  }
  if (lower.includes("malik")) {
    return "Malik";
  }
  if (lower.includes("hpapj") || lower.includes("hp-apj")) {
    return "HP APJ QA Team";
  }

  // 3. Extract humanized name from email (never returning the raw email address)
  if (raw.includes("@")) {
    const localPart = raw.split("@")[0];
    if (localPart) {
      const parts = localPart.split(/[._\-\d]+/).filter(Boolean);
      if (parts.length > 0 && !parts[0].toLowerCase().includes("admin") && !parts[0].toLowerCase().includes("team")) {
        return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
      }
    }
  }

  return fallback;
}

/**
 * Resolves the first name (e.g. 'Chaithanya') for friendly greetings and sign-offs
 */
export function resolveUserFirstName(
  input?: string | null,
  usersListOrFallback?: AppUserMeta[] | string,
  defaultFallback = "Chaithanya"
): string {
  const full = resolveUserFullName(input, usersListOrFallback, defaultFallback);
  if (!full || full === defaultFallback) return defaultFallback;
  const first = full.split(/\s+/)[0];
  return first || defaultFallback;
}
