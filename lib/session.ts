import { supabase, isSupabaseConfigured } from "./supabase";

export interface ActiveUserSession {
  email: string;
  role: string;
  name: string;
  team?: string;
  status?: string;
  avatar?: string;
  timestamp: string;
}

export const PRIMARY_SESSION_KEY = "hpqa_active_session";
export const LEGACY_SESSION_KEY = "activeSession";

// Hydrate session synchronously from local storage on load
let currentSession: ActiveUserSession | null = (() => {
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(PRIMARY_SESSION_KEY) || localStorage.getItem(LEGACY_SESSION_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.email) {
          return parsed;
        }
      }
    } catch (e) {}
  }
  return null;
})();

/**
 * Automatically clears 'activeSession' (and 'hpqa_active_session') from localStorage
 * when the application detects that the user's Supabase auth token has expired or is invalid
 * to prevent stale state issues.
 */
export function cleanupExpiredSession(reason = "Supabase auth token expired or invalid"): void {
  console.warn(`[SessionManager] Cleaning up expired/invalid session: ${reason}`);
  currentSession = null;

  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(LEGACY_SESSION_KEY);
      localStorage.removeItem(PRIMARY_SESSION_KEY);
      localStorage.removeItem("supabase.auth.token");
    } catch (e) {
      console.warn("[SessionManager] Error clearing session from localStorage:", e);
    }
  }

  fetch('/api/session/logout', {
    method: 'POST'
  }).catch(() => {});

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("supabase_token_expired", { detail: { reason } }));
    window.dispatchEvent(new Event("app_auth_changed"));
  }
}

/**
 * Gets the current active session.
 */
export function getActiveSession(): ActiveUserSession | null {
  if (currentSession && currentSession.email) {
    return currentSession;
  }

  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(PRIMARY_SESSION_KEY) || localStorage.getItem(LEGACY_SESSION_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.email) {
          currentSession = parsed;
          return currentSession;
        }
      }
    } catch (e) {}
  }
  return currentSession;
}

/**
 * Sets the active session, persists to storage, syncs to server API, and notifies components.
 */
export function setActiveSession(session: ActiveUserSession | null): void {
  currentSession = session;

  if (typeof window !== "undefined") {
    try {
      if (session && session.email) {
        const json = JSON.stringify(session);
        localStorage.setItem(PRIMARY_SESSION_KEY, json);
        localStorage.setItem(LEGACY_SESSION_KEY, json);
      } else {
        localStorage.removeItem(PRIMARY_SESSION_KEY);
        localStorage.removeItem(LEGACY_SESSION_KEY);
      }
    } catch (e) {}
  }

  if (session && session.email) {
    fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session })
    }).catch((e) => console.warn("[Session] Error syncing session to server:", e));
  } else {
    fetch('/api/session/logout', {
      method: 'POST'
    }).catch(() => {});
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("app_auth_changed"));
  }
}

/**
 * Resolves authentication status from memory, storage, server session endpoint, or Supabase Auth.
 */
export async function resolveCurrentSession(): Promise<ActiveUserSession | null> {
  // 1. If session is already active in memory or localStorage, validate it
  const active = getActiveSession();
  if (active && active.email) {
    // Check DB for latest role/status if configured
    if (isSupabaseConfigured()) {
      (async () => {
        try {
          const { data: appUser } = await supabase
            .from("app_users")
            .select("*")
            .eq("email", active.email.trim().toLowerCase())
            .maybeSingle();

          if (appUser) {
            if (appUser.status === "banned") {
              cleanupExpiredSession("User account status is banned");
              return;
            }
            if (appUser.role && appUser.role !== active.role) {
              active.role = appUser.role;
              active.name = appUser.name || active.name;
              active.team = appUser.team || active.team;
              currentSession = { ...active };
              try {
                const json = JSON.stringify(currentSession);
                localStorage.setItem(PRIMARY_SESSION_KEY, json);
                localStorage.setItem(LEGACY_SESSION_KEY, json);
              } catch (e) {}
              if (typeof window !== "undefined") {
                window.dispatchEvent(new Event("app_auth_changed"));
              }
            }
          }
        } catch (e) {}
      })();
    }

    return active;
  }

  // 2. Query server-persisted session store
  try {
    const res = await fetch('/api/session');
    if (res.ok) {
      const data = await res.json();
      if (data && data.session && data.session.email) {
        currentSession = data.session;
        try {
          const json = JSON.stringify(data.session);
          localStorage.setItem(PRIMARY_SESSION_KEY, json);
          localStorage.setItem(LEGACY_SESSION_KEY, json);
        } catch (e) {}
        return currentSession;
      }
    }
  } catch (e) {}

  // 3. Check Supabase Auth session directly from client with token expiration and validity check
  if (isSupabaseConfigured()) {
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        const msg = (sessionError.message || "").toLowerCase();
        if (msg.includes("expired") || msg.includes("invalid") || msg.includes("refresh_token") || (sessionError as any).status === 401) {
          cleanupExpiredSession(`Supabase session error: ${sessionError.message}`);
          return null;
        }
      }

      if (session) {
        // Check if token has expired based on expires_at
        if (session.expires_at && (session.expires_at * 1000 <= Date.now())) {
          console.warn("[SessionManager] Supabase auth token expired. Attempting token refresh...");
          const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
          if (refreshErr || !refreshData.session) {
            cleanupExpiredSession(`Supabase token expired and refresh failed: ${refreshErr?.message || "unknown"}`);
            return null;
          }
        }

        // Verify token with server
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError) {
          const uMsg = (userError.message || "").toLowerCase();
          if (uMsg.includes("expired") || uMsg.includes("invalid") || (userError as any).status === 401) {
            cleanupExpiredSession(`Supabase user verification failed: ${userError.message}`);
            return null;
          }
        }

        if (session.user && session.user.email) {
          const email = session.user.email.trim().toLowerCase();
          let role = session.user.user_metadata?.role;
          let name = session.user.user_metadata?.name;

          const { data: appUser } = await supabase
            .from("app_users")
            .select("*")
            .eq("email", email)
            .maybeSingle();

          if (appUser) {
            if (appUser.status === "banned") {
              cleanupExpiredSession("User account status is banned in app_users");
              return null;
            }
            role = appUser.role || role;
            name = appUser.name || name;
          }

          const newSession: ActiveUserSession = {
            email,
            role: role || "user",
            name: name || email.split("@")[0],
            team: appUser?.team || "HP-APJ",
            avatar: appUser?.avatar,
            timestamp: new Date().toISOString()
          };

          currentSession = newSession;
          try {
            const json = JSON.stringify(newSession);
            localStorage.setItem(PRIMARY_SESSION_KEY, json);
            localStorage.setItem(LEGACY_SESSION_KEY, json);
          } catch (e) {}
          return newSession;
        }
      }
    } catch (e: any) {
      const eMsg = (e?.message || "").toLowerCase();
      if (eMsg.includes("expired") || eMsg.includes("invalid") || e?.status === 401) {
        cleanupExpiredSession(`Supabase exception invalid/expired: ${e.message}`);
        return null;
      }
      console.warn("[Session] Error resolving Supabase Auth session:", e);
    }
  }

  return null;
}

/**
 * Validates whether the current Supabase token is still valid.
 * Automatically cleans up 'activeSession' from localStorage if expired or invalid.
 */
export async function validateSupabaseAuthToken(): Promise<boolean> {
  if (!isSupabaseConfigured()) return true;

  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
      const msg = (error.message || "").toLowerCase();
      if (msg.includes("expired") || msg.includes("invalid") || (error as any).status === 401) {
        cleanupExpiredSession(`Supabase token error: ${error.message}`);
        return false;
      }
    }

    if (session) {
      if (session.expires_at && session.expires_at * 1000 <= Date.now()) {
        const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
        if (refreshErr || !refreshed.session) {
          cleanupExpiredSession("Supabase token expired and refresh failed");
          return false;
        }
      }

      const { error: userError } = await supabase.auth.getUser();
      if (userError) {
        const uMsg = (userError.message || "").toLowerCase();
        if (uMsg.includes("expired") || uMsg.includes("invalid") || (userError as any).status === 401) {
          cleanupExpiredSession(`Supabase user verification invalid: ${userError.message}`);
          return false;
        }
      }
    }
    return true;
  } catch (err: any) {
    const errStr = (err?.message || "").toLowerCase();
    if (errStr.includes("expired") || errStr.includes("invalid") || err?.status === 401) {
      cleanupExpiredSession(`Supabase token error: ${err.message}`);
      return false;
    }
    return true;
  }
}

/**
 * Clears current session from memory, storage, and server.
 */
export function clearActiveSession(): void {
  currentSession = null;
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(PRIMARY_SESSION_KEY);
      localStorage.removeItem(LEGACY_SESSION_KEY);
    } catch (e) {}
  }
  fetch('/api/session/logout', {
    method: 'POST'
  }).catch(() => {});
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("app_auth_changed"));
  }
}


