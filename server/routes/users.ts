import { Router } from "express";
import crypto from "crypto";
import { getCurrentAppState, saveAppState } from "../utils/state.ts";

const currentAppState = getCurrentAppState();
import { getSupabaseServiceKey, getSupabaseUrl, getSupabaseAnonKey } from "../utils/db.ts";
import { getAppCredentialFromDB } from "../utils/credentials.ts";
import { inviteEmailTemplate, escapeHtml, isPrivateOrInternalUrl, resolveUserFullNameServer, sanitizeGreetingName } from "../utils/helpers.ts";
import { buildDynamicSignupUrl, resolveRequestOrigin, sendEmailWithAutoFallback } from "../utils/mailer.ts";

export const router = Router();

router.post("/api/invite", async (req, res) => {
  const { name, email, role, team, origin } = req.body || {};

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  let cleanName = String(name || "").trim();
  if (!cleanName || cleanName.includes("@") || /^qa\s*user$/i.test(cleanName)) {
    cleanName = await resolveUserFullNameServer(cleanEmail, "Team Member");
  }
  cleanName = sanitizeGreetingName(cleanName, "Team Member");

  // Generate cryptographically unique invitation token
  const token = "inv_" + crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  // Save to server app state
  currentAppState.invitations = currentAppState.invitations || [];
  currentAppState.invitations = currentAppState.invitations.filter((i: any) => i.email !== cleanEmail);
  currentAppState.invitations.push({
    token,
    email: cleanEmail,
    name: cleanName,
    role: role || "user",
    team: team || "HP-APJ",
    status: "pending",
    created_at: new Date().toISOString(),
    expires_at: expiresAt
  });
  saveAppState(currentAppState);

  // Sync token to Supabase if configured
  const supabaseUrl = getSupabaseUrl();
  const supabaseKey = getSupabaseServiceKey() || getSupabaseAnonKey();
  if (supabaseUrl && supabaseKey) {
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const client = createClient(supabaseUrl, supabaseKey);

      // 1. Try to record in invitations table
      try {
        await client.from("invitations").upsert({
          token,
          email: cleanEmail,
          name: cleanName,
          role: role || "user",
          team: team || "HP-APJ",
          status: "pending",
          expires_at: expiresAt
        }, { onConflict: "token" });
      } catch (invErr) {
        // invitations table may not exist yet in user's schema, continue
      }

      // 2. Also record in app_users table
      try {
        await client.from("app_users").upsert({
          name: cleanName,
          email: cleanEmail,
          role: role || "user",
          team: team || "HP-APJ",
          status: "invited",
          invite_token: token
        }, { onConflict: "email" });
      } catch (uErr) {
        // app_users fallback
      }
    } catch (dbErr) {
      console.warn("[Invite API] Supabase invite token sync warning:", dbErr);
    }
  }

  // Construct secure tokenized URL: strictly no email query parameter
  const reqOrigin = resolveRequestOrigin(req, origin);
  const effectiveInviteUrl = `${reqOrigin}/signup?token=${token}`;

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
      token,
      inviteUrl: effectiveInviteUrl,
      message: `Invitation email sent successfully to ${cleanEmail} via Gmail SMTP (${mailResult.user})!`
    });
  } catch (error: any) {
    console.error("[Invite API] Error sending invitation email:", error.message);
    return res.status(500).json({
      success: false,
      deliveredVia: "none",
      token,
      error: error.message || "Failed to send invitation email via SMTP.",
      inviteUrl: effectiveInviteUrl,
      message: `Failed to send email: ${error.message}. You can manually share the secure signup link.`
    });
  }
});

/**
 * Generates or retrieves an existing pending invitation token for a user.
 * Used by admin "Copy Invite Link" and "Resend Invite" to ensure unique tokenized links.
 */
router.post("/api/invite/token", async (req, res) => {
  const { email, name, role, team, origin } = req.body || {};
  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }
  const cleanEmail = String(email).trim().toLowerCase();

  let token = "";
  if (Array.isArray(currentAppState.invitations)) {
    const existing = currentAppState.invitations.find(
      (i: any) => i.email === cleanEmail && i.status === "pending" && (!i.expires_at || new Date(i.expires_at) > new Date())
    );
    if (existing) {
      token = existing.token;
    }
  }

  if (!token) {
    token = "inv_" + crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    currentAppState.invitations = currentAppState.invitations || [];
    currentAppState.invitations = currentAppState.invitations.filter((i: any) => i.email !== cleanEmail);
    currentAppState.invitations.push({
      token,
      email: cleanEmail,
      name: name || cleanEmail.split("@")[0],
      role: role || "user",
      team: team || "HP-APJ",
      status: "pending",
      created_at: new Date().toISOString(),
      expires_at: expiresAt
    });
    saveAppState(currentAppState);

    const supabaseUrl = getSupabaseUrl();
    const supabaseKey = getSupabaseServiceKey() || getSupabaseAnonKey();
    if (supabaseUrl && supabaseKey) {
      try {
        const { createClient } = await import("@supabase/supabase-js");
        const client = createClient(supabaseUrl, supabaseKey);
        try {
          await client.from("invitations").upsert({
            token,
            email: cleanEmail,
            name: name || cleanEmail.split("@")[0],
            role: role || "user",
            team: team || "HP-APJ",
            status: "pending",
            expires_at: expiresAt
          }, { onConflict: "token" });
        } catch {}

        try {
          await client.from("app_users").upsert({
            email: cleanEmail,
            invite_token: token,
            status: "invited"
          }, { onConflict: "email" });
        } catch {}
      } catch {}
    }
  }

  const reqOrigin = resolveRequestOrigin(req, origin);
  const inviteUrl = `${reqOrigin}/signup?token=${token}`;
  return res.json({ success: true, token, inviteUrl });
});

/**
 * Validates an invitation token for the Signup page.
 * Returns the exact invited email so the form can lock it in as read-only.
 */
router.get("/api/invite/verify", async (req, res) => {
  const token = String(req.query.token || "").trim();
  if (!token) {
    return res.status(400).json({ valid: false, error: "Invitation token is required." });
  }

  // 1. Check in server state
  let invitation: any = null;
  if (Array.isArray(currentAppState.invitations)) {
    invitation = currentAppState.invitations.find((i: any) => i.token === token);
  }

  // 2. Check in Supabase
  const supabaseUrl = getSupabaseUrl();
  const supabaseKey = getSupabaseServiceKey() || getSupabaseAnonKey();
  if (supabaseUrl && supabaseKey) {
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const client = createClient(supabaseUrl, supabaseKey);

      const { data: dbInv } = await client
        .from("invitations")
        .select("*")
        .eq("token", token)
        .maybeSingle();

      if (dbInv) {
        invitation = dbInv;
      } else {
        const { data: dbUser } = await client
          .from("app_users")
          .select("*")
          .eq("invite_token", token)
          .maybeSingle();
        if (dbUser) {
          invitation = {
            token,
            email: dbUser.email,
            name: dbUser.name,
            role: dbUser.role,
            team: dbUser.team,
            status: dbUser.status === "active" ? "accepted" : "pending"
          };
        }
      }
    } catch (e) {
      console.warn("[Invite Verify API] Note checking Supabase:", e);
    }
  }

  if (!invitation) {
    return res.status(404).json({
      valid: false,
      error: "Invalid invitation link. This invitation does not exist or was revoked."
    });
  }

  if (invitation.status === "accepted") {
    return res.status(400).json({
      valid: false,
      error: "This invitation link has already been used. Please sign in with your password."
    });
  }

  if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
    return res.status(400).json({
      valid: false,
      error: "This invitation link has expired. Please contact your administrator for a new invitation."
    });
  }

  return res.json({
    valid: true,
    email: invitation.email,
    name: invitation.name || "",
    role: invitation.role || "user",
    team: invitation.team || "HP-APJ"
  });
});

/**
 * Strict Invitation-Only Signup
 * Validates token, enforces that ONLY the invited email can sign up, sets password,
 * marks token accepted, and activates session.
 */
router.post("/api/signup", async (req, res) => {
  const { token, name, password, team } = req.body || {};

  if (!token) {
    return res.status(400).json({
      error: "Direct signup without an invitation token is not permitted. Zeta QA Platform is invite-only."
    });
  }

  if (!password || password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters." });
  }

  // Look up invitation strictly by token
  let invitation: any = null;
  if (Array.isArray(currentAppState.invitations)) {
    invitation = currentAppState.invitations.find((i: any) => i.token === token);
  }

  const supabaseUrl = getSupabaseUrl();
  const supabaseKey = getSupabaseServiceKey() || getSupabaseAnonKey();
  let client: any = null;
  if (supabaseUrl && supabaseKey) {
    try {
      const { createClient } = await import("@supabase/supabase-js");
      client = createClient(supabaseUrl, supabaseKey);
      const { data: dbInv } = await client.from("invitations").select("*").eq("token", token).maybeSingle();
      if (dbInv) {
        invitation = dbInv;
      } else {
        const { data: dbUser } = await client.from("app_users").select("*").eq("invite_token", token).maybeSingle();
        if (dbUser) {
          invitation = {
            token,
            email: dbUser.email,
            name: dbUser.name,
            role: dbUser.role,
            team: dbUser.team,
            status: dbUser.status === "active" ? "accepted" : "pending"
          };
        }
      }
    } catch (e) {}
  }

  if (!invitation) {
    return res.status(400).json({ error: "Invalid invitation token. Registration cannot proceed." });
  }

  if (invitation.status === "accepted") {
    return res.status(400).json({ error: "This invitation link has already been used. Please sign in." });
  }

  // STRICT ENFORCEMENT: Email is derived strictly from the server invitation record!
  // Any user-supplied email in the request is completely ignored.
  const cleanEmail = invitation.email.trim().toLowerCase();
  const cleanName = (name || invitation.name || cleanEmail.split("@")[0]).trim();
  const cleanRole = invitation.role || "user";
  const cleanTeam = team || invitation.team || "HP-APJ";

  // 1. Create or update user in Supabase Auth if available
  if (client) {
    try {
      if (client.auth?.admin?.createUser) {
        await client.auth.admin.createUser({
          email: cleanEmail,
          password: password,
          email_confirm: true,
          user_metadata: { name: cleanName, role: cleanRole, team: cleanTeam }
        }).catch(() => {
          return client.auth.admin.updateUserById(cleanEmail, { password }).catch(() => {});
        });
      } else if (client.auth?.signUp) {
        await client.auth.signUp({
          email: cleanEmail,
          password: password,
          options: { data: { name: cleanName, role: cleanRole, team: cleanTeam } }
        }).catch(() => {});
      }
    } catch (authErr) {
      console.warn("[Server API] Supabase Auth creation note:", authErr);
    }
  }

  // 2. Activate user in app_users table
  const userPayload = {
    name: cleanName,
    email: cleanEmail,
    role: cleanRole,
    team: cleanTeam,
    status: "active",
    invite_token: null, // Token consumed
    last_login: new Date().toISOString()
  };

  if (client) {
    try {
      await client.from("app_users").upsert(userPayload, { onConflict: "email" });
    } catch (e) {
      console.warn("[Server API] app_users upsert note:", e);
    }
    // Mark invitation as accepted
    try {
      await client.from("invitations").update({
        status: "accepted",
        accepted_at: new Date().toISOString()
      }).eq("token", token);
    } catch (e) {}
  }

  // 3. Update server state
  currentAppState.users = currentAppState.users || [];
  const uIdx = currentAppState.users.findIndex((u: any) => (u.email || "").toLowerCase() === cleanEmail);
  if (uIdx >= 0) {
    currentAppState.users[uIdx] = { ...currentAppState.users[uIdx], ...userPayload };
  } else {
    currentAppState.users.push(userPayload as any);
  }

  if (Array.isArray(currentAppState.invitations)) {
    const invIdx = currentAppState.invitations.findIndex((i: any) => i.token === token);
    if (invIdx >= 0) {
      currentAppState.invitations[invIdx].status = "accepted";
      currentAppState.invitations[invIdx].accepted_at = new Date().toISOString();
    }
  }
  saveAppState(currentAppState);

  // 4. Set active session
  (req.session as any).active_session = {
    email: cleanEmail,
    role: cleanRole,
    name: cleanName,
    team: cleanTeam,
    status: "active",
    avatar: "",
    timestamp: new Date().toISOString()
  };

  return res.json({
    success: true,
    message: "Account registered successfully!",
    user: {
      email: cleanEmail,
      name: cleanName,
      role: cleanRole,
      team: cleanTeam
    },
    session: (req.session as any).active_session
  });
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

