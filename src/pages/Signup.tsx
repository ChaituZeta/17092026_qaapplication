import React, { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { setActiveSession } from "@/lib/session";
import { executePostLoginRedirect } from "@/lib/url-redirect";
import { AuthShell } from "../components/auth/AuthShell";
import { 
  Mail, Lock, User, CheckCircle2, AlertCircle, 
  ArrowRight, ShieldCheck, ShieldAlert, Loader2, KeyRound,
  Eye, EyeOff, ArrowLeft
} from "lucide-react";
import { Button } from "@/components/ui/button";

type TokenState = "VERIFYING" | "VALID" | "NO_TOKEN" | "INVALID_TOKEN";

export function Signup() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = (searchParams.get("token") || "").trim();

  const [tokenStatus, setTokenStatus] = useState<TokenState>("VERIFYING");
  const [tokenError, setTokenError] = useState<string | null>(null);

  // Form State
  const [invitedEmail, setInvitedEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [team, setTeam] = useState("HP-APJ");
  const [role, setRole] = useState("user");

  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Validate the invitation token on mount
  useEffect(() => {
    async function verifyInvitation() {
      if (!token) {
        setTokenStatus("NO_TOKEN");
        setTokenError(
          "Direct registration is restricted. Zeta QA Platform is invite-only. You must use the unique secure link provided by your administrator."
        );
        return;
      }

      setTokenStatus("VERIFYING");
      setTokenError(null);

      try {
        // 1. Verify token via backend API
        const res = await fetch(`/api/invite/verify?token=${encodeURIComponent(token)}`);
        const data = await res.json().catch(() => ({}));

        if (res.ok && data.valid && data.email) {
          setInvitedEmail(data.email.toLowerCase());
          setName(data.name || "");
          setTeam(data.team || "HP-APJ");
          setRole(data.role || "user");
          setTokenStatus("VALID");
          return;
        }

        // 2. Direct Supabase Fallback (if backend is offline or in serverless edge)
        try {
          // Check invitations table
          const { data: invData } = await supabase
            .from("invitations")
            .select("*")
            .eq("token", token)
            .maybeSingle();

          if (invData && invData.email) {
            if (invData.status === "accepted") {
              setTokenStatus("INVALID_TOKEN");
              setTokenError(
                "This invitation link has already been used to create an account. Please sign in with your credentials."
              );
              return;
            }
            if (invData.expires_at && new Date(invData.expires_at) < new Date()) {
              setTokenStatus("INVALID_TOKEN");
              setTokenError(
                "This invitation link has expired. Please request a new invitation from your QA administrator."
              );
              return;
            }
            setInvitedEmail(invData.email.toLowerCase());
            setName(invData.name || "");
            setTeam(invData.team || "HP-APJ");
            setRole(invData.role || "user");
            setTokenStatus("VALID");
            return;
          }

          // Check app_users table with invite_token
          const { data: uData } = await supabase
            .from("app_users")
            .select("*")
            .eq("invite_token", token)
            .maybeSingle();

          if (uData && uData.email) {
            if (uData.status === "active") {
              setTokenStatus("INVALID_TOKEN");
              setTokenError("This invitation has already been redeemed. Please sign in with your email.");
              return;
            }
            setInvitedEmail(uData.email.toLowerCase());
            setName(uData.name || "");
            setTeam(uData.team || "HP-APJ");
            setRole(uData.role || "user");
            setTokenStatus("VALID");
            return;
          }
        } catch (dbFallbackErr) {
          console.warn("[Signup] Supabase fallback check notice:", dbFallbackErr);
        }

        // Token was not valid
        setTokenStatus("INVALID_TOKEN");
        setTokenError(data.error || "This invitation link is invalid, expired, or has already been used.");
      } catch (err: any) {
        console.warn("[Signup] Error validating invitation token:", err);
        setTokenStatus("INVALID_TOKEN");
        setTokenError(
          "Unable to verify invitation link. Please check your network connection or request a new invitation from your QA administrator."
        );
      }
    }

    verifyInvitation();
  }, [token]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError("Please enter your full name.");
      return;
    }

    if (!password.trim() || password.length < 6) {
      setFormError("Password must contain at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setFormError("Passwords do not match. Please verify your entry.");
      return;
    }

    setLoading(true);
    const cleanEmail = invitedEmail.trim().toLowerCase();

    try {
      // 1. Submit strictly with token to the server API
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          name: name.trim(),
          password,
          team
        })
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        // Active session is created by server, also mirror to local session
        const sessionObj = {
          email: cleanEmail,
          role: data.user?.role || role || "user",
          name: name.trim(),
          team: team,
          status: "active",
          timestamp: new Date().toISOString()
        };
        setActiveSession(sessionObj);
        window.dispatchEvent(new Event("app_auth_changed"));

        setSuccess(true);
        setTimeout(() => {
          executePostLoginRedirect(navigate);
        }, 1200);
        return;
      }

      // If server returned a distinct error
      if (!res.ok && data.error) {
        throw new Error(data.error);
      }

      // 2. Client-side database fallback if server returned network failure
      try {
        await supabase.auth.signUp({
          email: cleanEmail,
          password: password,
          options: {
            data: { name: name.trim(), team, role }
          }
        }).catch(() => {});

        const userPayload = {
          name: name.trim(),
          email: cleanEmail,
          role: role,
          team: team,
          status: "active",
          invite_token: null, // Clear token
          last_login: new Date().toISOString()
        };
        await supabase.from("app_users").upsert(userPayload, { onConflict: "email" });

        try {
          await supabase.from("invitations").update({
            status: "accepted",
            accepted_at: new Date().toISOString()
          }).eq("token", token);
        } catch {}

        const sessionObj = {
          email: cleanEmail,
          role: role,
          name: name.trim(),
          team: team,
          status: "active",
          timestamp: new Date().toISOString()
        };
        setActiveSession(sessionObj);
        window.dispatchEvent(new Event("app_auth_changed"));

        setSuccess(true);
        setTimeout(() => {
          executePostLoginRedirect(navigate);
        }, 1200);
        return;
      } catch (fallbackErr: any) {
        throw new Error(fallbackErr.message || "Failed to complete account registration.");
      }
    } catch (err: any) {
      setFormError(err.message || "Failed to create account. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      {/* STATE 1: VERIFYING INVITATION TOKEN */}
      {tokenStatus === "VERIFYING" && (
        <div className="text-center py-10 space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 text-[#2b61d6] flex items-center justify-center mx-auto border border-blue-200/80 shadow-xs">
            <Loader2 className="w-7 h-7 animate-spin" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Verifying Invitation
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1.5 font-medium">
              Validating your secure platform access credentials...
            </p>
          </div>
        </div>
      )}

      {/* STATE 2: NO TOKEN PROVIDED */}
      {tokenStatus === "NO_TOKEN" && (
        <div className="text-left space-y-5">
          <div>
            <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-200/80 mb-3 shadow-xs">
              <KeyRound className="w-5 h-5" />
            </div>
            <h1 className="text-2xl sm:text-[26px] font-bold text-slate-900 tracking-tight">
              Invitation Required
            </h1>
            <p className="text-xs sm:text-sm font-medium text-slate-500 mt-1">
              HP APJ Campaign Quality Assurance Platform
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-amber-50/70 border border-amber-200/80 text-xs text-slate-700 leading-relaxed space-y-1.5">
            <p className="font-semibold text-amber-900">
              Registration is by private invitation only.
            </p>
            <p className="text-slate-600">
              Direct signups are restricted to ensure platform security. Please check your corporate email for an authorized invitation link.
            </p>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-600 space-y-2">
            <p className="font-semibold text-slate-800 text-[11px] uppercase tracking-wider">
              Need Access?
            </p>
            <ul className="space-y-1 text-slate-600 list-disc list-inside">
              <li>Contact your QA Lead or Platform Administrator</li>
              <li>Request an invitation dispatched to your official email</li>
              <li>Click the unique, personalized link in the email</li>
            </ul>
          </div>

          <div className="pt-2 space-y-2.5">
            <Button
              type="button"
              onClick={() => navigate("/login")}
              className="w-full h-11 bg-[#2b61d6] hover:bg-[#2250b8] text-white font-semibold text-sm rounded-lg shadow-sm transition-colors cursor-pointer flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Return to Sign In
            </Button>
          </div>
        </div>
      )}

      {/* STATE 3: INVALID OR EXPIRED TOKEN */}
      {tokenStatus === "INVALID_TOKEN" && (
        <div className="text-left space-y-5">
          <div>
            <div className="w-11 h-11 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-200/80 mb-3 shadow-xs">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <h1 className="text-2xl sm:text-[26px] font-bold text-slate-900 tracking-tight">
              Invalid Invitation
            </h1>
            <p className="text-xs sm:text-sm font-medium text-rose-600 mt-1">
              Access link is no longer valid
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-rose-50/80 border border-rose-200 flex items-start gap-2.5 text-xs text-rose-800 font-medium leading-relaxed">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{tokenError || "This invitation link is invalid or has expired."}</span>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-600 space-y-1.5">
            <p className="font-semibold text-slate-800 text-[11px] uppercase tracking-wider">
              Recommended Next Steps
            </p>
            <p>• If you already registered, please sign in with your email and password.</p>
            <p>• If this link has expired, ask your administrator to send a new invitation link.</p>
          </div>

          <div className="pt-2">
            <Button
              type="button"
              onClick={() => navigate("/login")}
              className="w-full h-11 bg-[#2b61d6] hover:bg-[#2250b8] text-white font-semibold text-sm rounded-lg shadow-sm transition-colors cursor-pointer flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Return to Sign In
            </Button>
          </div>
        </div>
      )}

      {/* STATE 4: TOKEN IS VALID - RENDER BRANDED REGISTRATION FORM */}
      {tokenStatus === "VALID" && (
        <div>
          {/* Branded Header */}
          <div className="mb-5 sm:mb-6 text-left">
            <h1 className="text-2xl sm:text-[28px] font-bold text-slate-900 tracking-tight">
              Activate Account
            </h1>
            <p className="text-xs sm:text-sm font-medium text-slate-500 mt-1">
              Complete your profile for HP APJ QA Platform
            </p>
          </div>

          {success ? (
            <div className="text-center py-6 sm:py-8 space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-200/80 shadow-xs">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h2 className="text-lg sm:text-xl font-bold text-slate-900">
                  Account Activated Successfully!
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 max-w-xs mx-auto">
                  Welcome aboard, <strong className="text-slate-800 font-semibold">{name || invitedEmail}</strong>. Redirecting you to your QA dashboard...
                </p>
              </div>
              <div className="pt-2 flex justify-center">
                <Loader2 className="w-5 h-5 text-[#2b61d6] animate-spin" />
              </div>
            </div>
          ) : (
            <form onSubmit={handleSignup} className="space-y-3.5 sm:space-y-4">
              {formError && (
                <div className="p-3 text-xs sm:text-sm rounded-lg bg-rose-50 text-rose-700 font-medium border border-rose-200 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Verified Invitation Banner with Email Pill */}
              <div className="p-2.5 sm:p-3 rounded-lg bg-emerald-50/90 border border-emerald-200 flex items-center gap-2.5">
                <ShieldCheck className="w-4 sm:w-5 h-4 sm:h-5 text-emerald-600 shrink-0" />
                <div className="text-left min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-emerald-900 uppercase tracking-wider">
                      Verified Platform Invitation
                    </span>
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  </div>
                  <p className="text-xs font-semibold text-emerald-950 truncate" title={invitedEmail}>
                    {invitedEmail}
                  </p>
                </div>
              </div>

              {/* Email Field - STRICTLY LOCKED & READONLY */}
              <div className="space-y-1 text-left">
                <div className="flex items-center justify-between">
                  <label htmlFor="signup-email" className="block text-xs font-semibold text-slate-700">
                    Invited Email Address
                  </label>
                  <span className="text-[10px] font-semibold text-slate-500 flex items-center gap-1">
                    <Lock className="w-3 h-3 text-slate-400" /> Locked to Invitation
                  </span>
                </div>
                <div className="relative flex items-center">
                  <input
                    id="signup-email"
                    type="email"
                    value={invitedEmail}
                    readOnly
                    disabled
                    tabIndex={-1}
                    className="w-full h-10 sm:h-11 border border-slate-200 bg-slate-100/80 rounded-lg pl-9 pr-3 text-xs sm:text-sm text-slate-700 font-semibold cursor-not-allowed select-all"
                  />
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3" />
                </div>
                <p className="text-[10px] text-slate-400">
                  Account is strictly restricted to this invited corporate address.
                </p>
              </div>

              {/* Full Name */}
              <div className="space-y-1 text-left">
                <label htmlFor="signup-name" className="block text-xs font-semibold text-slate-700">
                  Full Name
                </label>
                <div className="relative flex items-center">
                  <input
                    id="signup-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Chaithanya Bogineni"
                    className="w-full h-10 sm:h-11 border border-slate-200 bg-[#f8faff] rounded-lg pl-9 pr-3 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#306de4] focus:bg-white focus:ring-2 focus:ring-[#306de4]/20 transition-all shadow-xs"
                  />
                  <User className="w-4 h-4 text-slate-400 absolute left-3" />
                </div>
              </div>

              {/* Region / Team */}
              <div className="space-y-1 text-left">
                <label htmlFor="signup-team" className="block text-xs font-semibold text-slate-700">
                  Assigned Team / Region
                </label>
                <select
                  id="signup-team"
                  value={team}
                  onChange={(e) => setTeam(e.target.value)}
                  className="w-full h-10 sm:h-11 border border-slate-200 bg-[#f8faff] rounded-lg px-3 text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-[#306de4] focus:bg-white focus:ring-2 focus:ring-[#306de4]/20 transition-all shadow-xs"
                >
                  <option value="HP-APJ">HP-APJ (Asia Pacific & Japan)</option>
                  <option value="HP-EMEA">HP-EMEA (Europe, Middle East, Africa)</option>
                  <option value="HP-AMS">HP-AMS (Americas)</option>
                  <option value="Cheetah Digital">Cheetah Digital</option>
                </select>
              </div>

              {/* Create Password */}
              <div className="space-y-1 text-left">
                <label htmlFor="signup-password" className="block text-xs font-semibold text-slate-700">
                  Create Password
                </label>
                <div className="relative flex items-center">
                  <input
                    id="signup-password"
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="w-full h-10 sm:h-11 border border-slate-200 bg-[#f8faff] rounded-lg pl-9 pr-10 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#306de4] focus:bg-white focus:ring-2 focus:ring-[#306de4]/20 transition-all shadow-xs"
                  />
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3" />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 text-slate-400 hover:text-slate-600 focus:outline-none cursor-pointer p-0.5"
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div className="space-y-1 text-left">
                <label htmlFor="signup-confirm-password" className="block text-xs font-semibold text-slate-700">
                  Confirm Password
                </label>
                <div className="relative flex items-center">
                  <input
                    id="signup-confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat your password"
                    className="w-full h-10 sm:h-11 border border-slate-200 bg-[#f8faff] rounded-lg pl-9 pr-10 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#306de4] focus:bg-white focus:ring-2 focus:ring-[#306de4]/20 transition-all shadow-xs"
                  />
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3" />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 text-slate-400 hover:text-slate-600 focus:outline-none cursor-pointer p-0.5"
                    title={showConfirmPassword ? "Hide password" : "Show password"}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 bg-[#2b61d6] hover:bg-[#2250b8] text-white font-semibold text-sm rounded-lg shadow-sm transition-colors cursor-pointer flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Activating Account...
                    </>
                  ) : (
                    <>
                      Complete Setup & Sign In
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </div>

              <div className="pt-2 text-center text-xs text-slate-500">
                Already registered?{" "}
                <Link to="/login" className="text-[#2b61d6] font-semibold hover:underline">
                  Sign in to your account
                </Link>
              </div>
            </form>
          )}
        </div>
      )}
    </AuthShell>
  );
}

export default Signup;
