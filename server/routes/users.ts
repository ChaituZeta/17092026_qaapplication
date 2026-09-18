import { Router } from "express";
import crypto from "crypto";
import { getCurrentAppState, saveAppState } from "../utils/state.ts";

const currentAppState = getCurrentAppState();
import { getSupabaseServiceKey, getSupabaseUrl, getSupabaseAnonKey } from "../utils/db.ts";
import { getAppCredentialFromDB } from "../utils/credentials.ts";
import { inviteEmailTemplate, escapeHtml, isPrivateOrInternalUrl, resolveUserFullNameServer, sanitizeGreetingName } from "../utils/helpers.ts";
import { buildDynamicSignupUrl, resolveRequestOrigin, sendEmailWithAutoFallback } from "../utils/mailer.ts";

export const router = Router();

/**
 * Persists an invitation token across all storage tiers:
 * 1. app_credentials (INVITE_${token}) - 100% resilient across serverless instances and lambdas
 * 2. invitations table (if exists in user's Supabase schema)
 * 3. app_users table (with fallback if invite_token column does not exist)
 */
async function persistInvitationTokenInDb(
  client: any,
  inv: {
    token: string;
    email: string;
    name: string;
    role: string;
    team: string;
    expires_at: string;
  }
) {
  if (!client) return;

  // 1. Store in app_credentials (globally accessible across all serverless function instances)
  try {
    const credKey = `INVITE_${inv.token}`;
    const credPayload = JSON.stringify({
      token: inv.token,
      email: inv.email,
      name: inv.name,
      role: inv.role,
      team: inv.team,
      status: "pending",
      created_at: new Date().toISOString(),
      expires_at: inv.expires_at
    });
    const { error: credErr } = await client.from("app_credentials").upsert({
      key: credKey,
      value: credPayload,
      description: `User Invitation Token for ${inv.email}`,
      updated_at: new Date().toISOString()
    }, { onConflict: "key" });

    if (credErr) {
      console.warn(`[Invite Persist] app_credentials upsert note: ${credErr.message}`);
    } else {
      console.log(`[Invite Persist] Successfully persisted ${credKey} to app_credentials.`);
    }
  } catch (e: any) {
    console.warn(`[Invite Persist] app_credentials exception: ${e.message}`);
  }

  // 2. Also try invitations table (if created in Supabase)
  try {
    const { error: invErr } = await client.from("invitations").upsert({
      token: inv.token,
      email: inv.email,
      name: inv.name,
      role: inv.role,
      team: inv.team,
      status: "pending",
      expires_at: inv.expires_at
    }, { onConflict: "token" });
    if (!invErr) {
      console.log(`[Invite Persist] Successfully stored invitation in invitations table.`);
    }
  } catch {}

  // 3. Upsert user into app_users table with status 'invited'
  try {
    const fullPayload = {
      name: inv.name,
      email: inv.email,
      role: inv.role,
      team: inv.team,
      status: "invited",
      invite_token: inv.token,
      last_login: "Never"
    };
    const { error: uErr } = await client.from("app_users").upsert(fullPayload, { onConflict: "email" });
    if (uErr) {
      console.log(`[Invite Persist] app_users upsert with invite_token returned note: ${uErr.message}. Retrying with standard columns...`);
      // Retry without invite_token column so user record is reliably created in app_users
      const { invite_token, ...standardPayload } = fullPayload;
      const { error: retryErr } = await client.from("app_users").upsert(standardPayload, { onConflict: "email" });
      if (retryErr) {
        console.error(`[Invite Persist] app_users standard upsert error: ${retryErr.message}`);
      } else {
        console.log(`[Invite Persist] Successfully created user record in app_users (standard schema).`);
      }
    } else {
      console.log(`[Invite Persist] Successfully created user record in app_users with invite_token.`);
    }
  } catch (err: any) {
    console.error(`[Invite Persist] app_users exception: ${err.message}`);
  }
}

/**
 * Retrieves invitation data by token checking:
 * 1. app_credentials (INVITE_${token})
 * 2. invitations table
 * 3. app_users table (invite_token column)
 * 4. in-memory appState
 */
async function lookupInvitationToken(client: any, token: string): Promise<any | null> {
  // 1. Check in Supabase app_credentials
  if (client) {
    try {
      const { data: credRow, error: credErr } = await client
        .from("app_credentials")
        .select("value")
        .eq("key", `INVITE_${token}`)
        .maybeSingle();
      if (!credErr && credRow?.value) {
        try {
          const parsed = JSON.parse(credRow.value);
          if (parsed && parsed.email) {
            console.log(`[Invite Lookup] Found valid token in app_credentials for: ${parsed.email}`);
            return parsed;
          }
        } catch {}
      }
    } catch (e: any) {
      console.warn(`[Invite Lookup] app_credentials check note: ${e.message}`);
    }

    // 2. Check in invitations table
    try {
      const { data: dbInv, error: invErr } = await client
        .from("invitations")
        .select("*")
        .eq("token", token)
        .maybeSingle();
      if (!invErr && dbInv) {
        console.log(`[Invite Lookup] Found valid token in invitations table for: ${dbInv.email}`);
        return dbInv;
      }
    } catch {}

    // 3. Check in app_users table
    try {
      const { data: dbUser, error: userErr } = await client
        .from("app_users")
        .select("*")
        .eq("invite_token", token)
        .maybeSingle();
      if (!userErr && dbUser) {
        console.log(`[Invite Lookup] Found valid token in app_users table for: ${dbUser.email}`);
        return {
          token,
          email: dbUser.email,
          name: dbUser.name,
          role: dbUser.role,
          team: dbUser.team,
          status: dbUser.status === "active" ? "accepted" : "pending"
        };
      }
    } catch {}
  }

  // 4. Check in server state
  if (Array.isArray(currentAppState.invitations)) {
    const memInv = currentAppState.invitations.find((i: any) => i.token === token);
    if (memInv) {
      console.log(`[Invite Lookup] Found token in local server state for: ${memInv.email}`);
      return memInv;
    }
  }

  return null;
}

/**
 * Marks an invitation token as accepted
 */
async function consumeInvitationToken(client: any, token: string) {
  if (client) {
    try {
      const credKey = `INVITE_${token}`;
      const { data: credRow } = await client.from("app_credentials").select("value").eq("key", credKey).maybeSingle();
      if (credRow?.value) {
        try {
          const parsed = JSON.parse(credRow.value);
          parsed.status = "accepted";
          parsed.accepted_at = new Date().toISOString();
          await client.from("app_credentials").upsert({
            key: credKey,
            value: JSON.stringify(parsed),
            description: `Accepted User Invitation Token`,
            updated_at: new Date().toISOString()
          }, { onConflict: "key" });
        } catch {}
      }
    } catch {}

    try {
      await client.from("invitations").update({
        status: "accepted",
        accepted_at: new Date().toISOString()
      }).eq("token", token);
    } catch {}
  }

  if (Array.isArray(currentAppState.invitations)) {
    const invIdx = currentAppState.invitations.findIndex((i: any) => i.token === token);
    if (invIdx >= 0) {
      currentAppState.invitations[invIdx].status = "accepted";
      currentAppState.invitations[invIdx].accepted_at = new Date().toISOString();
      saveAppState(currentAppState);
    }
  }
}

router.post("/api/invite", async (req, res) => {
  const { name, email, role, team, origin, token: providedToken } = req.body || {};

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  let cleanName = String(name || "").trim();
  if (!cleanName || cleanName.includes("@") || /^qa\s*user$/i.test(cleanName)) {
    cleanName = await resolveUserFullNameServer(cleanEmail, "Team Member");
  }
  cleanName = sanitizeGreetingName(cleanName, "Team Member");

  console.log(`[Invite API] [1/5] Incoming invitation request for: "${cleanEmail}" (name: "${cleanName}", role: "${role || 'user'}", team: "${team || 'HP-APJ'}")`);

  // Use provided client token if valid, or generate cryptographically unique invitation token
  const token = (providedToken && typeof providedToken === "string" && providedToken.startsWith("inv_"))
    ? providedToken.trim()
    : "inv_" + crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  console.log(`[Invite API] [2/5] Token generated: ${token.substring(0, 10)}... (Expires: ${expiresAt})`);

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

  // Sync token to Supabase across all resilient tiers
  console.log(`[Invite API] [3/5] Persisting invitation and user record to Supabase...`);
  const supabaseUrl = getSupabaseUrl();
  const supabaseKey = getSupabaseServiceKey() || getSupabaseAnonKey();
  if (supabaseUrl && supabaseKey) {
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const client = createClient(supabaseUrl, supabaseKey);
      await persistInvitationTokenInDb(client, {
        token,
        email: cleanEmail,
        name: cleanName,
        role: role || "user",
        team: team || "HP-APJ",
        expires_at: expiresAt
      });
    } catch (dbErr: any) {
      console.warn("[Invite API] Supabase persistence error note:", dbErr.message);
    }
  }

  // Construct secure tokenized URL: strictly no email query parameter
  const reqOrigin = resolveRequestOrigin(req, origin);
  const effectiveInviteUrl = `${reqOrigin}/signup?token=${token}`;

  console.log(`[Invite API] [4/5] Generated invitation URL: ${effectiveInviteUrl}`);
  console.log(`[Invite API] [5/5] Attempting automated email delivery via SMTP...`);

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

    console.log(`[Invite API] Email successfully delivered to ${cleanEmail} via ${mailResult.host}:${mailResult.port} (Sender: ${mailResult.user})`);

    return res.json({
      success: true,
      emailSent: true,
      deliveredVia: "smtp",
      port: mailResult.port,
      sender: mailResult.user,
      token,
      inviteUrl: effectiveInviteUrl,
      message: `Invitation email sent successfully to ${cleanEmail} via Gmail SMTP (${mailResult.user})!`
    });
  } catch (error: any) {
    console.error(`[Invite API] SMTP delivery failure for ${cleanEmail}: ${error.message} (code: ${error.code || 'UNKNOWN'})`);
    let suggestion = "Check your SMTP sender email and Google 16-character App Password in Settings > Credentials.";
    if (error.message?.includes("535")) {
      suggestion = "Gmail authentication rejected (Error 535). Please verify your Google 16-character App Password at myaccount.google.com/apppasswords.";
    } else if (error.message?.includes("ETIMEDOUT") || error.message?.includes("ECONNREFUSED")) {
      suggestion = "Connection to SMTP server timed out. Check outbound port accessibility or network firewall.";
    }

    // Return HTTP 200 with structured status so the invitation link remains valid and accessible
    return res.status(200).json({
      success: true,
      emailSent: false,
      deliveredVia: "none",
      token,
      inviteUrl: effectiveInviteUrl,
      error: error.message || "Failed to send invitation email via SMTP.",
      errorCode: error.code || "SMTP_ERROR",
      smtpSuggestion: suggestion,
      message: `User created & token active in database, but automated email failed: ${error.message}. You can share the invitation link directly.`
    });
  }
});

/**
 * Generates or retrieves an existing pending invitation token for a user.
 * Used by admin "Copy Invite Link" and "Resend Invite" to ensure unique tokenized links.
 */
router.post("/api/invite/token", async (req, res) => {
  const { email, name, role, team, origin, token: providedToken } = req.body || {};
  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }
  const cleanEmail = String(email).trim().toLowerCase();

  let token = (providedToken && typeof providedToken === "string" && providedToken.startsWith("inv_"))
    ? providedToken.trim()
    : "";

  const supabaseUrl = getSupabaseUrl();
  const supabaseKey = getSupabaseServiceKey() || getSupabaseAnonKey();
  let client: any = null;
  if (supabaseUrl && supabaseKey) {
    try {
      const { createClient } = await import("@supabase/supabase-js");
      client = createClient(supabaseUrl, supabaseKey);
    } catch {}
  }

  if (!token && Array.isArray(currentAppState.invitations)) {
    const existing = currentAppState.invitations.find(
      (i: any) => i.email === cleanEmail && i.status === "pending" && (!i.expires_at || new Date(i.expires_at) > new Date())
    );
    if (existing) {
      token = existing.token;
    }
  }

  if (!token) {
    token = "inv_" + crypto.randomBytes(24).toString("hex");
  }

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

  if (client) {
    await persistInvitationTokenInDb(client, {
      token,
      email: cleanEmail,
      name: name || cleanEmail.split("@")[0],
      role: role || "user",
      team: team || "HP-APJ",
      expires_at: expiresAt
    });
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

  const supabaseUrl = getSupabaseUrl();
  const supabaseKey = getSupabaseServiceKey() || getSupabaseAnonKey();
  let client: any = null;
  if (supabaseUrl && supabaseKey) {
    try {
      const { createClient } = await import("@supabase/supabase-js");
      client = createClient(supabaseUrl, supabaseKey);
    } catch {}
  }

  const invitation = await lookupInvitationToken(client, token);

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

  const supabaseUrl = getSupabaseUrl();
  const supabaseKey = getSupabaseServiceKey() || getSupabaseAnonKey();
  let client: any = null;
  if (supabaseUrl && supabaseKey) {
    try {
      const { createClient } = await import("@supabase/supabase-js");
      client = createClient(supabaseUrl, supabaseKey);
    } catch {}
  }

  // Look up invitation strictly by token
  const invitation = await lookupInvitationToken(client, token);

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

  // 2. Activate user in app_users table (with graceful fallback if invite_token column missing)
  const baseUserPayload = {
    name: cleanName,
    email: cleanEmail,
    role: cleanRole,
    team: cleanTeam,
    status: "active",
    last_login: new Date().toISOString()
  };

  if (client) {
    try {
      const { error: upErr } = await client.from("app_users").upsert({ ...baseUserPayload, invite_token: null }, { onConflict: "email" });
      if (upErr) {
        await client.from("app_users").upsert(baseUserPayload, { onConflict: "email" });
      }
    } catch (e) {
      try {
        await client.from("app_users").upsert(baseUserPayload, { onConflict: "email" });
      } catch (err2) {
        console.warn("[Server API] app_users activation note:", err2);
      }
    }
    // Mark invitation as accepted across all tiers
    await consumeInvitationToken(client, token);
  } else {
    await consumeInvitationToken(null, token);
  }

  // 3. Update server state
  currentAppState.users = currentAppState.users || [];
  const uIdx = currentAppState.users.findIndex((u: any) => (u.email || "").toLowerCase() === cleanEmail);
  if (uIdx >= 0) {
    currentAppState.users[uIdx] = { ...currentAppState.users[uIdx], ...baseUserPayload };
  } else {
    currentAppState.users.push(baseUserPayload as any);
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

