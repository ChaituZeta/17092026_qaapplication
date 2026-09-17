import { supabase } from "@/lib/supabase";
import { clearPostLoginRedirectUrl } from "@/lib/url-redirect";
import { clearActiveSession, getActiveSession } from "@/lib/session";
import { clearPersistedActiveRoute } from "@/lib/route-persistence";

export async function logoutUser(): Promise<void> {
  // 0. Log logout event to server audit logs with IP
  const session = getActiveSession();
  if (session?.email) {
    try {
      await fetch("/api/log-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userEmail: session.email,
          actionType: "User Logout",
          details: `User ${session.name || session.email} logged out from session`,
          role: session.role
        })
      }).catch(() => {});
    } catch (e) {}
  }

  // 1. Clear in-memory session
  clearActiveSession();

  // 2. Clear redirect history & persisted route state
  clearPostLoginRedirectUrl();
  clearPersistedActiveRoute();

  // 3. Sign out explicitly from Supabase Auth
  try {
    if (import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_URL !== 'https://placeholder.supabase.co') {
      await supabase.auth.signOut();
    }
  } catch (e) {
    console.warn("[Auth] Supabase signOut warning:", e);
  }

  // 4. Notify app components
  window.dispatchEvent(new Event("app_auth_changed"));

  // 5. Hard redirect to '/login' so browser URL clears current page & parameters completely
  window.location.href = "/login";
}
