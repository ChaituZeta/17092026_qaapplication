import { Router } from "express";
import { getCurrentAppState, saveAppState } from "../utils/state.ts";

const currentAppState = getCurrentAppState();
import { getSupabaseServiceKey, getSupabaseUrl, getSupabaseAnonKey } from "../utils/db.ts";
import { getAppCredentialFromDB } from "../utils/credentials.ts";
import { inviteEmailTemplate, escapeHtml, isPrivateOrInternalUrl, resolveUserFullNameServer, sanitizeGreetingName } from "../utils/helpers.ts";
import { buildDynamicSignupUrl, sendEmailWithAutoFallback } from "../utils/mailer.ts";

export const router = Router();

router.post("/api/invite", async (req, res) => {
  const { name, email, role, team, inviteUrl, origin } = req.body || {};

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  let cleanName = String(name || "").trim();
  if (!cleanName || cleanName.includes("@") || /^qa\s*user$/i.test(cleanName)) {
    cleanName = await resolveUserFullNameServer(cleanEmail, "Team Member");
  }
  cleanName = sanitizeGreetingName(cleanName, "Team Member");

  // Dynamically resolve invite URL pointing to current assigned domain
  const effectiveInviteUrl = buildDynamicSignupUrl(req, cleanEmail, inviteUrl, origin);

  try {
    const mailResult = await sendEmailWithAutoFallback({
      to: cleanEmail,
      subject: "Invitation to join Zeta QA Platform",
      html: inviteEmailTemplate({
        name: cleanName,
        email: cleanEmail,
        role: role || "user",
        team: team || "HP-APJ",
        inviteUrl: effectiveInviteUrl
      }),
    });

    return res.json({
      success: true,
      deliveredVia: "smtp",
      port: mailResult.port,
      sender: mailResult.user,
      inviteUrl: effectiveInviteUrl,
      message: `Invitation email sent successfully to ${cleanEmail} via Gmail SMTP (${mailResult.user})!`
    });
  } catch (error: any) {
    console.error("[Invite API] Error sending invitation email:", error.message);
    return res.status(500).json({
      success: false,
      deliveredVia: "none",
      error: error.message || "Failed to send invitation email via SMTP.",
      inviteUrl: effectiveInviteUrl,
      message: `Failed to send email: ${error.message}. You can manually share the signup link.`
    });
  }
});

router.get("/api/session", (req, res) => {
  res.json({ session: (req.session as any).active_session || null });
});

router.post("/api/session", (req, res) => {
  const session = req.body?.session || req.body;
  if (session && session.email) {
    (req.session as any).active_session = {
      email: (session.email || "").trim().toLowerCase(),
      role: session.role || "user",
      name: session.name || session.email.split("@")[0],
      team: session.team || "HP-APJ",
      status: session.status || "active",
      avatar: session.avatar || "",
      timestamp: session.timestamp || new Date().toISOString()
    };
  }
  res.json({ success: true, session: (req.session as any).active_session });
});

router.post("/api/session/logout", (req, res) => {
  req.session.destroy(() => {});
  res.json({ success: true, message: "Logged out" });
});

router.get("/api/app-users", async (req, res) => {
  try {
    const supabaseUrl = getSupabaseUrl();
    const supabaseKey = getSupabaseServiceKey() || getSupabaseAnonKey();
    if (supabaseUrl && supabaseKey && supabaseUrl.startsWith("https://")) {
      const { createClient } = await import("@supabase/supabase-js");
      const client = createClient(supabaseUrl, supabaseKey);
      const { data: dbUsers, error } = await client.from("app_users").select("*").order("created_at", { ascending: true });
      if (!error && Array.isArray(dbUsers)) {
        currentAppState.users = dbUsers;
        saveAppState(currentAppState);
        return res.json({ users: dbUsers });
      }
    }
  } catch (e) {
    console.warn("[Server API] Note fetching app_users from Supabase:", e);
  }
  res.json({ users: currentAppState.users || [] });
});

router.post("/api/app-users", async (req, res) => {
  const supabaseUrl = getSupabaseUrl();
  const supabaseKey = getSupabaseServiceKey() || getSupabaseAnonKey();

  if (req.body && Array.isArray(req.body.users)) {
    currentAppState.users = req.body.users;
    saveAppState(currentAppState);
  } else if (req.body && (req.body.user || req.body.email)) {
    const updatedUser = req.body.user || req.body;
    const targetEmail = (updatedUser.email || "").trim().toLowerCase();
    if (targetEmail) {
      const idx = currentAppState.users.findIndex(u => (u.email || "").trim().toLowerCase() === targetEmail);
      if (idx >= 0) {
        currentAppState.users[idx] = { ...currentAppState.users[idx], ...updatedUser };
      } else {
        currentAppState.users.push(updatedUser);
      }
      saveAppState(currentAppState);

      if (supabaseUrl && supabaseKey) {
        try {
          const { createClient } = await import("@supabase/supabase-js");
          const client = createClient(supabaseUrl, supabaseKey);
          await client.from("app_users").upsert(updatedUser, { onConflict: "email" });
        } catch (e) {}
      }
    }
  }
  res.json({ success: true, users: currentAppState.users });
});

router.post("/api/app-users/delete", async (req, res) => {
  const { email, id } = req.body || {};
  const targetEmail = (email || "").trim().toLowerCase();
  if (targetEmail || id) {
    currentAppState.users = (currentAppState.users || []).filter(u => {
      const uEmail = (u.email || "").trim().toLowerCase();
      if (targetEmail && uEmail === targetEmail) return false;
      if (id && u.id === id) return false;
      return true;
    });
    saveAppState(currentAppState);

    const supabaseUrl = getSupabaseUrl();
    const supabaseKey = getSupabaseServiceKey() || getSupabaseAnonKey();
    if (supabaseUrl && supabaseKey) {
      try {
        const { createClient } = await import("@supabase/supabase-js");
        const client = createClient(supabaseUrl, supabaseKey);
        if (id) {
          await client.from("app_users").delete().eq("id", id);
        }
        if (targetEmail) {
          await client.from("app_users").delete().eq("email", targetEmail);
        }
        console.log(`[Server API] Successfully deleted user ${targetEmail || id} from Supabase app_users table.`);
      } catch (e) {
        console.warn("[Server API] Note deleting user from Supabase app_users:", e);
      }
    }
  }
  res.json({ success: true, users: currentAppState.users });
});

export default router;

