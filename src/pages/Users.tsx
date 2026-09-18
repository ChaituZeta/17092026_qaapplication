import React, { useState, useEffect, useRef } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { 
  Users, UserPlus, Search, Shield, User, Mail, Building2, 
  Trash2, Edit2, CheckCircle2, XCircle, RefreshCw, Send, AlertTriangle, Lock,
  Copy, Link as LinkIcon, Check, ExternalLink, Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export interface AppUser {
  id?: string;
  name: string;
  email: string;
  role: "admin" | "user";
  team: string;
  status: "active" | "banned" | "pending" | "invited";
  invite_token?: string;
  quick_login_enabled?: boolean;
  last_login?: string;
  created_at?: string;
}

export function UsersList({ role, userEmail }: { role: string; userEmail?: string }) {
  const isAdmin = role === "admin";
  const [searchParams, setSearchParams] = useSearchParams();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);

  const searchQuery = searchParams.get("q") || "";
  const teamFilter = searchParams.get("team") || "all";
  const roleFilter = searchParams.get("role") || "all";

  const setSearchQuery = (q: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (q) next.set("q", q);
      else next.delete("q");
      return next;
    }, { replace: true });
  };

  const setTeamFilter = (team: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (team && team !== "all") next.set("team", team);
      else next.delete("team");
      return next;
    }, { replace: true });
  };

  const setRoleFilter = (r: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (r && r !== "all") next.set("role", r);
      else next.delete("role");
      return next;
    }, { replace: true });
  };

  // Invite Modal State
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "user">("user");
  const [inviteTeam, setInviteTeam] = useState("HP-APJ");
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [modalMessage, setModalMessage] = useState<{
    type: "success" | "error" | "warning";
    text: string;
    suggestion?: string;
    errorCode?: string;
    isSmtpIssue?: boolean;
  } | null>(null);
  const [createdInviteUrl, setCreatedInviteUrl] = useState<string | null>(null);
  const [copiedModalLink, setCopiedModalLink] = useState(false);

  // Toast Notification State
  const [toastNotification, setToastNotification] = useState<{
    id: number;
    type: "success" | "warning" | "error";
    title: string;
    message: string;
    details?: string;
  } | null>(null);
  const toastTimerRef = useRef<any>(null);

  const triggerToast = (
    type: "success" | "warning" | "error",
    title: string,
    message: string,
    details?: string
  ) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToastNotification({
      id: Date.now(),
      type,
      title,
      message,
      details
    });
    toastTimerRef.current = setTimeout(() => {
      setToastNotification(null);
    }, 7000);
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  // Row Action State
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  const [resendingEmail, setResendingEmail] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ email: string; text: string; success: boolean } | null>(null);

  // Edit User State
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      // 1. Try fetching from Supabase
      const { data: dbUsers, error } = await supabase
        .from("app_users")
        .select("*")
        .order("created_at", { ascending: false });

      if (!error && Array.isArray(dbUsers) && dbUsers.length > 0) {
        setUsers(dbUsers);
      } else {
        // Fallback to server API
        const response = await fetch("/api/app-users");
        if (response.ok) {
          const json = await response.json();
          setUsers(json.users || []);
        }
      }
    } catch (e) {
      console.error("Failed to load users:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // Generate a cryptographically secure client-side token as guaranteed fallback
  const generateClientInviteToken = (): string => {
    try {
      const bytes = new Uint8Array(24);
      crypto.getRandomValues(bytes);
      return "inv_" + Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
    } catch {
      return "inv_" + Math.random().toString(36).substring(2) + Date.now().toString(36);
    }
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = inviteName.trim();
    const cleanEmail = inviteEmail.trim().toLowerCase();

    if (!cleanName || !cleanEmail) {
      setModalMessage({ type: "error", text: "Please provide both full name and email address." });
      triggerToast("error", "Missing Information", "Please provide both the user's full name and corporate email address.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      setModalMessage({ type: "error", text: `"${cleanEmail}" is not a valid email address format.` });
      triggerToast("error", "Invalid Email Format", `The email "${cleanEmail}" does not appear to be valid. Please check and try again.`);
      return;
    }

    setIsSendingInvite(true);
    setModalMessage(null);

    const dynamicOrigin = window.location.origin;
    const clientToken = generateClientInviteToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const newUser: AppUser = {
      name: cleanName,
      email: cleanEmail,
      role: inviteRole,
      team: inviteTeam,
      status: "invited",
      invite_token: clientToken,
      last_login: "Never",
      created_at: new Date().toISOString()
    };

    // Pre-seed guaranteed fallback link with valid token immediately
    const fallbackInviteUrl = `${dynamicOrigin}/signup?token=${clientToken}`;
    setCreatedInviteUrl(fallbackInviteUrl);

    try {
      // 1. Save user to Supabase app_users table with invite_token
      try {
        await supabase.from("app_users").upsert({
          name: newUser.name,
          email: newUser.email,
          role: newUser.role,
          team: newUser.team,
          status: "invited",
          invite_token: clientToken,
          last_login: "Never"
        }, { onConflict: "email" });
      } catch (dbErr) {
        console.warn("[Invite] Supabase app_users sync notice:", dbErr);
      }

      // 2. Also record in Supabase invitations table if available
      try {
        await supabase.from("invitations").upsert({
          token: clientToken,
          email: cleanEmail,
          name: newUser.name,
          role: newUser.role,
          team: newUser.team,
          status: "pending",
          expires_at: expiresAt
        }, { onConflict: "token" });
      } catch (invErr) {
        // Invitations table may not exist in user schema yet, continue
      }

      // 3. Notify server-side app-users state
      try {
        await fetch("/api/app-users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user: newUser })
        });
      } catch {}

      // 4. Send email invitation using secure unique token via server API
      let inviteData: any = {};
      let isNetworkOrServerCrash = false;

      try {
        const inviteRes = await fetch("/api/invite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: newUser.name,
            email: newUser.email,
            role: newUser.role,
            team: newUser.team,
            origin: dynamicOrigin,
            token: clientToken
          })
        });

        if (inviteRes.ok) {
          inviteData = await inviteRes.json().catch(() => ({}));
        } else {
          try {
            inviteData = await inviteRes.json();
          } catch {
            isNetworkOrServerCrash = true;
          }
        }
      } catch (netErr) {
        isNetworkOrServerCrash = true;
      }

      // Resolve final token and invite URL (Guaranteed to have valid token)
      const finalToken = (inviteData?.token && typeof inviteData.token === "string" && inviteData.token.startsWith("inv_"))
        ? inviteData.token
        : clientToken;

      const effectiveInviteUrl = (inviteData?.inviteUrl && inviteData.inviteUrl.includes("token=inv_"))
        ? inviteData.inviteUrl
        : `${dynamicOrigin}/signup?token=${finalToken}`;

      setCreatedInviteUrl(effectiveInviteUrl);

      // Check delivery status
      const isEmailSent = Boolean(
        inviteData?.success && (inviteData?.emailSent !== false) && (inviteData?.deliveredVia === "smtp" || inviteData?.deliveredVia === "gmail" || !inviteData?.deliveredVia)
      );

      if (isEmailSent) {
        setModalMessage({ 
          type: "success", 
          text: `Invitation email dispatched successfully to ${cleanEmail} with a secure unique token link!`,
          isSmtpIssue: false
        });
        triggerToast(
          "success",
          "Invitation Email Dispatched",
          `Invitation email successfully dispatched to ${cleanEmail} via SMTP.`,
          `Security Token: ${finalToken.substring(0, 16)}... | Role: ${inviteRole.toUpperCase()} | Team: ${inviteTeam}`
        );
        fetchUsers();
      } else {
        const rawError = inviteData?.error || inviteData?.message || (isNetworkOrServerCrash ? "SMTP Mailer service unreachable on serverless host" : "SMTP credentials rejected or connection timed out");
        const cleanMsg = String(rawError).replace(/\.+$/, "");
        const suggestion = inviteData?.smtpSuggestion || "Verify your SMTP Sender Email and 16-character Google App Password in Admin Settings > Credentials.";
        setModalMessage({ 
          type: "warning", 
          text: `User created & token active in database! However, the automated invitation email could not be delivered through SMTP: ${cleanMsg}`,
          suggestion: suggestion,
          errorCode: inviteData?.errorCode || "SMTP_ERROR",
          isSmtpIssue: true
        });
        triggerToast(
          "warning",
          "SMTP Email Delivery Notice",
          `User created & active in database, but the email could not be sent to ${cleanEmail}.`,
          `Error: ${cleanMsg}\n\nSuggested Fix: ${suggestion}`
        );
        fetchUsers();
      }
    } catch (err: any) {
      console.warn("Email invite sending error:", err);
      const errMsg = err?.message || "Unexpected failure during invitation process.";
      setModalMessage({ 
        type: "error", 
        text: `Invitation processing error: ${errMsg}. You can still copy the secure invitation link below:`,
        suggestion: "Verify database connectivity and check network status.",
        isSmtpIssue: true
      });
      triggerToast(
        "error",
        "Invitation Failed",
        `Failed to complete the user invitation process for ${cleanEmail}.`,
        `Error Details: ${errMsg}`
      );
      fetchUsers();
    } finally {
      setIsSendingInvite(false);
    }
  };

  const handleCopyUserSignupLink = async (u: AppUser) => {
    try {
      const dynamicOrigin = window.location.origin;
      let token = u.invite_token || "";

      // If user doesn't already have an invite token, generate one and persist
      if (!token) {
        token = generateClientInviteToken();
        try {
          if (u.id) {
            await supabase.from("app_users").update({ invite_token: token }).eq("id", u.id);
          } else {
            await supabase.from("app_users").update({ invite_token: token }).eq("email", u.email);
          }
          await supabase.from("invitations").upsert({
            token,
            email: u.email.toLowerCase(),
            name: u.name,
            role: u.role,
            team: u.team,
            status: "pending",
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
          }, { onConflict: "token" });
        } catch {}
      }

      // Also request server to ensure token is synced in app state
      try {
        const res = await fetch("/api/invite/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: u.email,
            name: u.name,
            role: u.role,
            team: u.team,
            token,
            origin: dynamicOrigin
          })
        });
        const data = await res.json().catch(() => ({}));
        if (data.token && typeof data.token === "string" && data.token.startsWith("inv_")) {
          token = data.token;
        }
      } catch {}

      const signupUrl = `${dynamicOrigin}/signup?token=${token}`;
      await navigator.clipboard.writeText(signupUrl);
      setCopiedEmail(u.email);
      setTimeout(() => setCopiedEmail(null), 2500);
    } catch {
      // Guaranteed fallback with user's token or fallback
      const token = u.invite_token || generateClientInviteToken();
      window.prompt("Secure signup link for " + u.email, `${window.location.origin}/signup?token=${token}`);
    }
  };

  const handleResendUserInvite = async (u: AppUser) => {
    setResendingEmail(u.email);
    setActionFeedback(null);
    const dynamicOrigin = window.location.origin;
    const cleanEmail = u.email.trim().toLowerCase();

    // Ensure we have a valid token
    let token = u.invite_token;
    if (!token) {
      token = generateClientInviteToken();
      try {
        if (u.id) {
          await supabase.from("app_users").update({ invite_token: token }).eq("id", u.id);
        } else {
          await supabase.from("app_users").update({ invite_token: token }).eq("email", cleanEmail);
        }
        await supabase.from("invitations").upsert({
          token,
          email: cleanEmail,
          name: u.name,
          role: u.role,
          team: u.team,
          status: "pending",
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        }, { onConflict: "token" });
      } catch {}
    }

    try {
      const res = await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: u.name,
          email: cleanEmail,
          role: u.role,
          team: u.team,
          origin: dynamicOrigin,
          token
        })
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success && data.emailSent !== false) {
        setActionFeedback({ email: u.email, text: "Invitation email sent successfully via SMTP!", success: true });
        triggerToast("success", "Invitation Resent", `Invitation email successfully resent to ${cleanEmail} via SMTP.`);
      } else {
        const rawErr = data.error || data.message || "Email dispatch issue (SMTP credentials or timeout). Token link is active.";
        const cleanErr = String(rawErr).replace(/\.+$/, "");
        setActionFeedback({ 
          email: u.email, 
          text: cleanErr, 
          success: false 
        });
        triggerToast(
          "warning",
          "Email Delivery Issue",
          `Invitation could not be dispatched to ${cleanEmail}.`,
          `Error: ${cleanErr}`
        );
      }
    } catch (err: any) {
      const errMsg = err.message || "Failed to send email";
      setActionFeedback({ email: u.email, text: errMsg, success: false });
      triggerToast("error", "Email Resend Failed", `Failed to send email to ${cleanEmail}.`, errMsg);
    } finally {
      setResendingEmail(null);
      setTimeout(() => setActionFeedback(null), 5000);
    }
  };

  const handleSaveEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    setIsUpdating(true);
    try {
      // 1. Update Supabase
      if (editingUser.id) {
        await supabase.from("app_users").update(editingUser).eq("id", editingUser.id);
      } else {
        await supabase.from("app_users").update(editingUser).eq("email", editingUser.email);
      }

      // 2. Update Server State
      await fetch("/api/app-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: editingUser })
      });

      setEditingUser(null);
      fetchUsers();
    } catch (err) {
      console.error("Failed to update user:", err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteUser = async (userToDelete: AppUser) => {
    if (!window.confirm(`Are you sure you want to remove ${userToDelete.name || userToDelete.email}?`)) {
      return;
    }

    try {
      if (userToDelete.id) {
        await supabase.from("app_users").delete().eq("id", userToDelete.id);
      } else {
        await supabase.from("app_users").delete().eq("email", userToDelete.email);
      }

      await fetch("/api/app-users/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: userToDelete.id, email: userToDelete.email })
      });

      setUsers(prev => prev.filter(u => u.email !== userToDelete.email));
    } catch (err) {
      console.error("Failed to delete user:", err);
    }
  };

  const handleToggleBan = async (u: AppUser) => {
    const newStatus = u.status === "banned" ? "active" : "banned";
    const updated = { ...u, status: newStatus as any };

    try {
      if (u.id) {
        await supabase.from("app_users").update({ status: newStatus }).eq("id", u.id);
      } else {
        await supabase.from("app_users").update({ status: newStatus }).eq("email", u.email);
      }

      await fetch("/api/app-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: updated })
      });

      setUsers(prev => prev.map(item => item.email === u.email ? updated : item));
    } catch (e) {
      console.error("Failed to toggle status:", e);
    }
  };

  const handleToggleQuickLogin = async (u: AppUser) => {
    const newQuick = !u.quick_login_enabled;
    const updated = { ...u, quick_login_enabled: newQuick };

    try {
      if (u.id) {
        await supabase.from("app_users").update({ quick_login_enabled: newQuick }).eq("id", u.id);
      } else {
        await supabase.from("app_users").update({ quick_login_enabled: newQuick }).eq("email", u.email);
      }

      await fetch("/api/app-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: updated })
      });

      setUsers(prev => prev.map(item => item.email === u.email ? updated : item));
      setActionFeedback({
        email: u.email,
        text: `Quick Login profile ${newQuick ? "enabled" : "disabled"} for this user.`,
        success: true
      });
      setTimeout(() => setActionFeedback(null), 4000);
    } catch (e: any) {
      console.error("Failed to toggle quick login:", e);
      setActionFeedback({
        email: u.email,
        text: `Error updating quick login: ${e?.message || "unknown"}`,
        success: false
      });
    }
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch =
      (u.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.email || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTeam = teamFilter === "all" || u.team === teamFilter;
    const matchesRole = roleFilter === "all" || u.role === roleFilter;
    return matchesSearch && matchesTeam && matchesRole;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <Users className="w-6 h-6 text-[#2b61d6]" />
            User Management
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage team members, roles, permissions, and platform invitations
          </p>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchUsers}
              className="gap-1.5 text-xs font-semibold"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setCreatedInviteUrl(null);
                setModalMessage(null);
                setShowInviteModal(true);
              }}
              className="gap-1.5 bg-[#2b61d6] hover:bg-[#2250b8] text-white text-xs font-semibold shadow-xs"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Invite Member
            </Button>
          </div>
        )}
      </div>

      {/* Action Feedback Banner */}
      {actionFeedback && (
        <div className={`p-3 rounded-lg text-xs font-medium flex items-center justify-between gap-2 shadow-xs transition-all ${
          actionFeedback.success 
            ? "bg-emerald-50 text-emerald-800 border border-emerald-200" 
            : "bg-amber-50 text-amber-900 border border-amber-200"
        }`}>
          <div className="flex items-center gap-2">
            {actionFeedback.success ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            )}
            <span>
              <strong>{actionFeedback.email}:</strong> {actionFeedback.text}
            </span>
          </div>
          <button 
            onClick={() => setActionFeedback(null)} 
            className="text-slate-400 hover:text-slate-600 text-xs px-1 font-bold"
          >
            &times;
          </button>
        </div>
      )}

      {/* Filters Bar */}
      <Card className="shadow-xs border-slate-200">
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <Input
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="h-9 px-3 rounded-md border border-slate-300 text-xs text-slate-700 bg-white"
            >
              <option value="all">All Teams</option>
              <option value="HP-APJ">HP-APJ</option>
              <option value="HP-EMEA">HP-EMEA</option>
              <option value="HP-AMS">HP-AMS</option>
              <option value="Cheetah Digital">Cheetah Digital</option>
            </select>

            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="h-9 px-3 rounded-md border border-slate-300 text-xs text-slate-700 bg-white"
            >
              <option value="all">All Roles</option>
              <option value="admin">Admins</option>
              <option value="user">QA Users</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card className="shadow-xs border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3.5 px-4">User</th>
                <th className="py-3.5 px-4">Team</th>
                <th className="py-3.5 px-4">Role</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-center">Quick Login</th>
                <th className="py-3.5 px-4">Last Active</th>
                {isAdmin && <th className="py-3.5 px-4 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-400" />
                    Loading users...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    No users found matching your filters.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u, i) => (
                  <tr key={u.email || i} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-600 uppercase text-xs">
                          {u.name ? u.name.charAt(0) : u.email.charAt(0)}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">{u.name || "Unnamed User"}</p>
                          <p className="text-slate-500 text-[11px]">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-[11px] font-medium">
                        <Building2 className="w-3 h-3 text-slate-400" />
                        {u.team || "HP-APJ"}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {u.role === "admin" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800">
                          <Shield className="w-3 h-3" /> Admin
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700">
                          <User className="w-3 h-3" /> QA Analyst
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {u.status === "banned" ? (
                        <span className="inline-flex items-center gap-1 text-rose-700 bg-rose-50 px-2 py-0.5 rounded text-[11px] font-semibold">
                          <XCircle className="w-3 h-3" /> Suspended
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-[11px] font-medium">
                          <CheckCircle2 className="w-3 h-3" /> Active
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleQuickLogin(u)}
                        disabled={!isAdmin}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${
                          u.quick_login_enabled
                            ? "bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100"
                            : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100"
                        } ${isAdmin ? "cursor-pointer" : "cursor-default opacity-70"}`}
                        title={isAdmin ? "Toggle Quick Login profile for this user" : "Quick Login status"}
                      >
                        <Zap className={`w-3 h-3 ${u.quick_login_enabled ? "text-amber-500 fill-amber-500" : "text-slate-400"}`} />
                        <span>{u.quick_login_enabled ? "Enabled" : "Off"}</span>
                      </button>
                    </td>
                    <td className="py-3 px-4 text-slate-500 text-[11px]">
                      {u.last_login ? (
                        u.last_login === "Never" ? "Never" : new Date(u.last_login).toLocaleDateString()
                      ) : "Never"}
                    </td>
                    {isAdmin && (
                      <td className="py-3 px-4 text-right space-x-1">
                        <button
                          type="button"
                          onClick={() => handleCopyUserSignupLink(u)}
                          className="p-1.5 text-slate-400 hover:text-[#2b61d6] hover:bg-slate-100 rounded transition-colors"
                          title="Copy Signup Link (Current Domain)"
                        >
                          {copiedEmail === u.email ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleResendUserInvite(u)}
                          disabled={resendingEmail === u.email}
                          className="p-1.5 text-slate-400 hover:text-[#2b61d6] hover:bg-slate-100 rounded transition-colors disabled:opacity-50"
                          title="Resend Invitation Email"
                        >
                          <Send className={`w-3.5 h-3.5 ${resendingEmail === u.email ? "animate-pulse text-[#2b61d6]" : ""}`} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingUser(u)}
                          className="p-1.5 text-slate-400 hover:text-[#2b61d6] hover:bg-slate-100 rounded transition-colors"
                          title="Edit User"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleBan(u)}
                          className={`p-1.5 rounded transition-colors ${
                            u.status === "banned"
                              ? "text-emerald-600 hover:bg-emerald-50"
                              : "text-amber-600 hover:bg-amber-50"
                          }`}
                          title={u.status === "banned" ? "Unban User" : "Suspend User"}
                        >
                          <Lock className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteUser(u)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                          title="Delete User"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Invite Member Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-[#2b61d6]" />
              Invite Team Member
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Send an email invitation and grant QA platform access.
            </p>

            {/* Live Progress Spinner & Status Indicator */}
            {isSendingInvite && (
              <div className="mt-4 p-3.5 bg-blue-50/90 border border-blue-200 rounded-xl flex items-center gap-3">
                <RefreshCw className="w-5 h-5 text-blue-600 animate-spin shrink-0" />
                <div className="text-xs text-blue-900 space-y-0.5">
                  <div className="font-bold flex items-center gap-1.5">
                    <span>Processing User Invitation...</span>
                  </div>
                  <div className="text-[11px] text-blue-700 leading-normal">
                    Registering user in database, generating cryptographic token, and contacting SMTP mailer.
                  </div>
                </div>
              </div>
            )}

            {/* Modal Feedback Message */}
            {modalMessage && !isSendingInvite && (
              modalMessage.isSmtpIssue ? (
                <div className="mt-4 p-3.5 rounded-xl border border-amber-300 bg-amber-50/90 text-xs space-y-2.5">
                  <div className="flex items-start gap-2 text-amber-950">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold text-[12px] text-amber-900">User Registered — SMTP Email Delivery Notice</div>
                      <p className="mt-1 text-amber-800 leading-relaxed text-[11px]">
                        {modalMessage.text}
                      </p>
                    </div>
                  </div>

                  {modalMessage.suggestion && (
                    <div className="p-2.5 bg-white/90 border border-amber-200/90 rounded-lg text-slate-700 space-y-1.5">
                      <div className="font-semibold text-amber-900 text-[11px] flex items-center gap-1.5">
                        <Lock className="w-3 h-3 text-amber-700" />
                        Guided SMTP Resolution:
                      </div>
                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        {modalMessage.suggestion}
                      </p>
                      <div className="pt-1 flex items-center gap-3">
                        <Link
                          to="/settings?tab=credentials"
                          className="text-[11px] font-bold text-blue-700 hover:text-blue-900 flex items-center gap-1 underline cursor-pointer"
                        >
                          Open Credentials in Admin Settings <ExternalLink className="w-3 h-3" />
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div
                  className={`mt-4 p-3 rounded-lg text-xs font-medium ${
                    modalMessage.type === "success"
                      ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                      : "bg-rose-50 text-rose-800 border border-rose-200"
                  }`}
                >
                  {modalMessage.text}
                </div>
              )
            )}

            {createdInviteUrl && (
              <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-700 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-emerald-600" />
                    Secure Invitation Link (Invite-Only & Locked)
                  </span>
                  <div className="flex items-center gap-2">
                    <a
                      href={createdInviteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1 transition-colors"
                      title="Open invitation in new tab to test"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Test
                    </a>
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(createdInviteUrl);
                        setCopiedModalLink(true);
                        setTimeout(() => setCopiedModalLink(false), 2500);
                      }}
                      className="text-[11px] font-semibold text-[#2b61d6] hover:text-[#1e4499] flex items-center gap-1 transition-colors"
                    >
                      {copiedModalLink ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" /> Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" /> Copy Link
                        </>
                      )}
                    </button>
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded p-2 text-[11px] font-mono text-slate-700 break-all select-all">
                  {createdInviteUrl}
                </div>
                <p className="text-[10px] text-slate-400 italic">
                  Token is activated in database. The invited user can open this link to set their password.
                </p>
              </div>
            )}

            <form onSubmit={handleSendInvite} className="mt-4 space-y-3.5">
              <div>
                <Label className="text-xs font-semibold text-slate-700">Full Name</Label>
                <Input
                  required
                  disabled={isSendingInvite}
                  placeholder="e.g. John Smith"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  className="mt-1 h-9 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700">Email Address</Label>
                <Input
                  type="email"
                  required
                  disabled={isSendingInvite}
                  placeholder="john.smith@hp.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="mt-1 h-9 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Team / Region</Label>
                  <select
                    disabled={isSendingInvite}
                    value={inviteTeam}
                    onChange={(e) => setInviteTeam(e.target.value)}
                    className="mt-1 flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs shadow-xs disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <option value="HP-APJ">HP-APJ</option>
                    <option value="HP-EMEA">HP-EMEA</option>
                    <option value="HP-AMS">HP-AMS</option>
                    <option value="Cheetah Digital">Cheetah Digital</option>
                  </select>
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700">Account Role</Label>
                  <select
                    disabled={isSendingInvite}
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as any)}
                    className="mt-1 flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs shadow-xs disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <option value="user">QA User</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowInviteModal(false);
                    setCreatedInviteUrl(null);
                    setModalMessage(null);
                  }}
                  disabled={isSendingInvite}
                  className="disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {createdInviteUrl ? "Done" : "Cancel"}
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSendingInvite}
                  className="bg-[#2b61d6] hover:bg-[#2250b8] text-white flex items-center gap-1.5 disabled:opacity-75 disabled:cursor-not-allowed min-w-[145px] justify-center shadow-xs"
                >
                  {isSendingInvite ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Sending Invitation...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Send Invitation</span>
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Floating Status Toast */}
      {toastNotification && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-6 right-6 z-[100] p-4 rounded-xl shadow-2xl border max-w-md w-full transition-all animate-in slide-in-from-bottom-5 duration-300 ${
            toastNotification.type === "success" 
              ? "bg-white border-slate-200 border-l-4 border-l-emerald-500 text-slate-900 shadow-emerald-950/10" 
              : toastNotification.type === "warning"
              ? "bg-white border-slate-200 border-l-4 border-l-amber-500 text-slate-900 shadow-amber-950/10"
              : "bg-white border-slate-200 border-l-4 border-l-rose-500 text-slate-900 shadow-rose-950/10"
          }`}
        >
          <div className="flex items-start gap-3">
            {toastNotification.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            ) : toastNotification.type === "warning" ? (
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            ) : (
              <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 text-xs">
              <div className="font-bold text-slate-900 text-[13px]">{toastNotification.title}</div>
              <div className="text-slate-600 mt-1 leading-relaxed">{toastNotification.message}</div>
              {toastNotification.details && (
                <div className="mt-2.5 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-mono text-slate-700 whitespace-pre-wrap break-words max-h-36 overflow-y-auto leading-relaxed">
                  {toastNotification.details}
                </div>
              )}
            </div>
            <button
              onClick={() => {
                if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
                setToastNotification(null);
              }}
              className="text-slate-400 hover:text-slate-600 text-xs font-bold p-1 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
              title="Close notification"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Edit2 className="w-5 h-5 text-[#2b61d6]" />
              Edit User: {editingUser.email}
            </h3>

            <form onSubmit={handleSaveEditUser} className="mt-4 space-y-3.5">
              <div>
                <Label className="text-xs font-semibold text-slate-700">Full Name</Label>
                <Input
                  required
                  value={editingUser.name || ""}
                  onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                  className="mt-1 h-9 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Team / Region</Label>
                  <select
                    value={editingUser.team}
                    onChange={(e) => setEditingUser({ ...editingUser, team: e.target.value })}
                    className="mt-1 flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs shadow-xs"
                  >
                    <option value="HP-APJ">HP-APJ</option>
                    <option value="HP-EMEA">HP-EMEA</option>
                    <option value="HP-AMS">HP-AMS</option>
                    <option value="Cheetah Digital">Cheetah Digital</option>
                  </select>
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700">Account Role</Label>
                  <select
                    value={editingUser.role}
                    onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value as any })}
                    className="mt-1 flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs shadow-xs"
                  >
                    <option value="user">QA User</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700">Account Status</Label>
                <select
                  value={editingUser.status}
                  onChange={(e) => setEditingUser({ ...editingUser, status: e.target.value as any })}
                  className="mt-1 flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs shadow-xs"
                >
                  <option value="active">Active</option>
                  <option value="banned">Suspended / Banned</option>
                </select>
              </div>

              <div className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 bg-slate-50 mt-1">
                <input
                  type="checkbox"
                  id="edit-user-quick-login"
                  checked={Boolean(editingUser.quick_login_enabled)}
                  onChange={(e) => setEditingUser({ ...editingUser, quick_login_enabled: e.target.checked })}
                  className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 h-4 w-4"
                />
                <Label htmlFor="edit-user-quick-login" className="text-xs font-semibold text-slate-700 cursor-pointer flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                  Enable One-Click Quick Login profile for this user
                </Label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingUser(null)}
                  disabled={isUpdating}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isUpdating}
                  className="bg-[#2b61d6] hover:bg-[#2250b8] text-white"
                >
                  {isUpdating ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
export default UsersList;
