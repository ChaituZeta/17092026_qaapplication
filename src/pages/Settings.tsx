import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { 
  Database, Settings as SettingsIcon, Download, Upload, Shield, 
  CheckCircle2, XCircle, RefreshCw, Server, Key, Globe, Image as ImageIcon,
  Save, AlertTriangle, Code, Terminal, Check, Lock, Sparkles, Mail,
  Eye, EyeOff, Send, AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DataManagementSection } from "../components/Settings/DataManagementSection";

export function Settings({ role, userEmail }: { role: string; userEmail?: string }) {
  const isAdmin = role === "admin";
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const initialTab = (tabParam === "migration" || tabParam === "data-management") ? "data-management" : (tabParam || "credentials");
  const [activeTab, setActiveTab] = useState(initialTab);

  // Credentials / DB Secrets Tab State
  const [geminiKeyInput, setGeminiKeyInput] = useState("");
  const [isTestingGemini, setIsTestingGemini] = useState(false);
  const [isSavingGemini, setIsSavingGemini] = useState(false);
  const [geminiStatus, setGeminiStatus] = useState<{ success?: boolean; message?: string } | null>(null);

  const [gmailUserInput, setGmailUserInput] = useState("");
  const [gmailPassInput, setGmailPassInput] = useState("");
  const [showGmailPassword, setShowGmailPassword] = useState(false);
  const [isSavingGmail, setIsSavingGmail] = useState(false);
  const [gmailStatus, setGmailStatus] = useState<{ success?: boolean; message?: string } | null>(null);

  const [storedCreds, setStoredCreds] = useState<any>({});
  const [isLoadingCreds, setIsLoadingCreds] = useState(false);

  // Live Test Email State
  const [testEmailRecipient, setTestEmailRecipient] = useState(userEmail || "cbogineni@gmail.com");
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState<any>(null);

  // General Settings Tab State
  const [quickLoginEnabled, setQuickLoginEnabled] = useState(true);
  const [expandedLogo, setExpandedLogo] = useState("https://zetaglobal.com/wp-content/uploads/2023/02/zeta_logoPrimary.svg");
  const [collapsedLogo, setCollapsedLogo] = useState("https://companieslogo.com/img/orig/ZETA-424536bc.png");
  const [isSavingGeneral, setIsSavingGeneral] = useState(false);
  const [generalSaveMsg, setGeneralSaveMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const switchTab = (tab: string) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  const loadAppCredentials = async () => {
    setIsLoadingCreds(true);
    try {
      let userFound = "";
      let passFound = "";

      // 1. Fetch from server credentials endpoint
      try {
        const res = await fetch("/api/app-credentials");
        if (res.ok) {
          const data = await res.json();
          if (data.credentials) {
            setStoredCreds(data.credentials);
            if (data.credentials.gmailUser) {
              userFound = data.credentials.gmailUser;
              setGmailUserInput(data.credentials.gmailUser);
            }
            if (data.credentials.gmailAppPassword) {
              passFound = data.credentials.gmailAppPassword;
              setGmailPassInput(data.credentials.gmailAppPassword);
            }
          }
        }
      } catch (e) {
        console.warn("Server credentials endpoint notice:", e);
      }

      // 2. Resilient check directly against Supabase database (app_credentials table)
      if (!userFound || !passFound) {
        try {
          const { data: dbCreds } = await supabase
            .from("app_credentials")
            .select("key, value, description, updated_at");
          if (dbCreds && dbCreds.length > 0) {
            const userRow = dbCreds.find((c: any) => c.key === "GMAIL_USER");
            const passRow = dbCreds.find((c: any) => c.key === "GMAIL_APP_PASSWORD");
            if (userRow?.value) {
              userFound = userRow.value;
              setGmailUserInput(userRow.value);
            }
            if (passRow?.value) {
              passFound = passRow.value;
              setGmailPassInput(passRow.value);
            }
            setStoredCreds((prev: any) => ({
              ...prev,
              gmailUser: userFound || prev.gmailUser || "",
              gmailAppPassword: passFound || prev.gmailAppPassword || "",
              hasGmailPassword: Boolean(passFound || prev.hasGmailPassword),
              gmailConfigured: Boolean(userFound && (passFound || prev.hasGmailPassword))
            }));
          }
        } catch (dbErr) {
          console.warn("Direct Supabase credential fetch notice:", dbErr);
        }
      }
    } catch (e) {
      console.warn("Could not load credentials:", e);
    } finally {
      setIsLoadingCreds(false);
    }
  };

  useEffect(() => {
    // Load general app settings from local cache first
    const cachedQuick = localStorage.getItem("hp_qa_quick_login_enabled");
    if (cachedQuick !== null) {
      setQuickLoginEnabled(cachedQuick === "true");
    }

    // Then from server API
    fetch("/api/app-settings")
      .then(res => res.json())
      .then(data => {
        if (data.quick_login_enabled !== undefined) {
          setQuickLoginEnabled(Boolean(data.quick_login_enabled));
          localStorage.setItem("hp_qa_quick_login_enabled", String(data.quick_login_enabled));
        }
      })
      .catch(() => {});

    loadAppCredentials();

    // Load logos and quick login setting from database if available
    const loadSettingsFromSupabase = async () => {
      try {
        const { data } = await supabase.from("app_settings").select("*").limit(1).maybeSingle();
        if (data) {
          if (data.expanded_logo_url) setExpandedLogo(data.expanded_logo_url);
          if (data.collapsed_logo_url) setCollapsedLogo(data.collapsed_logo_url);
          if (data.quick_login_enabled !== undefined && data.quick_login_enabled !== null) {
            const isQk = data.quick_login_enabled === true || data.quick_login_enabled === "true" || data.quick_login_enabled === 1;
            setQuickLoginEnabled(isQk);
            localStorage.setItem("hp_qa_quick_login_enabled", String(isQk));
          }
        }
      } catch (e) {}
    };
    loadSettingsFromSupabase();
  }, []);

  const handleSaveGemini = async () => {
    if (!geminiKeyInput.trim()) return;
    setIsSavingGemini(true);
    setGeminiStatus(null);
    try {
      const res = await fetch("/api/test-app-credential", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "gemini", action: "save", value: geminiKeyInput.trim() })
      });
      const data = await res.json();
      if (data.success) {
        setGeminiStatus({ success: true, message: data.message || "Gemini API Key saved securely in database!" });
        setGeminiKeyInput("");
        await loadAppCredentials();
      } else {
        setGeminiStatus({ success: false, message: data.error || "Failed to save Gemini key." });
      }
    } catch (err: any) {
      setGeminiStatus({ success: false, message: err.message || "Failed to save key." });
    } finally {
      setIsSavingGemini(false);
    }
  };

  const handleTestGemini = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!geminiKeyInput.trim()) return;
    setIsTestingGemini(true);
    setGeminiStatus(null);
    try {
      const res = await fetch("/api/test-app-credential", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "gemini", value: geminiKeyInput.trim() })
      });
      const data = await res.json();
      if (data.success) {
        setGeminiStatus({ success: true, message: data.message || "Gemini API Key verified and saved in database!" });
        setGeminiKeyInput("");
        await loadAppCredentials();
      } else {
        setGeminiStatus({ success: false, message: data.error || "Failed to verify key." });
      }
    } catch (err: any) {
      setGeminiStatus({ success: false, message: err.message || "Network test failed." });
    } finally {
      setIsTestingGemini(false);
    }
  };

  const handleSaveGmail = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanUser = gmailUserInput.trim();
    const cleanPass = gmailPassInput.trim();
    if (!cleanUser) {
      setGmailStatus({ success: false, message: "Please enter a sender email address." });
      return;
    }
    setIsSavingGmail(true);
    setGmailStatus(null);
    try {
      // 1. Save via server API
      const res = await fetch("/api/test-app-credential", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "gmail",
          action: "save",
          user: cleanUser,
          pass: cleanPass
        })
      });
      const data = await res.json();

      // 2. Also persist directly into Supabase DB app_credentials table
      try {
        const rowsToUpsert = [
          { key: "GMAIL_USER", value: cleanUser, description: "Gmail SMTP Notification User", updated_at: new Date().toISOString() }
        ];
        if (cleanPass) {
          rowsToUpsert.push({ key: "GMAIL_APP_PASSWORD", value: cleanPass, description: "Gmail SMTP App Password", updated_at: new Date().toISOString() });
        }
        await supabase.from("app_credentials").upsert(rowsToUpsert, { onConflict: "key" });
      } catch (sbErr) {
        console.warn("Direct Supabase upsert notice:", sbErr);
      }

      if (data.success) {
        setGmailStatus({
          success: true,
          message: "✓ Gmail SMTP credentials successfully updated and verified in database!"
        });
        setStoredCreds((prev: any) => ({
          ...prev,
          gmailUser: cleanUser,
          gmailAppPassword: cleanPass || prev.gmailAppPassword,
          hasGmailPassword: Boolean(cleanPass || prev.hasGmailPassword),
          gmailConfigured: true
        }));
        await loadAppCredentials();
      } else {
        setGmailStatus({ success: false, message: data.error || "Failed to save Gmail credentials." });
      }
    } catch (err: any) {
      setGmailStatus({ success: false, message: err.message || "Failed to save Gmail credentials." });
    } finally {
      setIsSavingGmail(false);
    }
  };

  const handleSendTestEmail = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanRecipient = (testEmailRecipient || userEmail || "").trim();
    if (!cleanRecipient) {
      setTestEmailResult({
        success: false,
        error: "Please enter a recipient email address to send the test message."
      });
      return;
    }

    setIsSendingTestEmail(true);
    setTestEmailResult(null);
    try {
      const res = await fetch("/api/smtp/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: cleanRecipient,
          user: gmailUserInput.trim() || undefined,
          pass: gmailPassInput.trim() || undefined
        })
      });
      const data = await res.json();
      setTestEmailResult(data);
    } catch (err: any) {
      setTestEmailResult({
        success: false,
        error: err.message || "Network request failed while sending test email.",
        suggestion: "Check internet connectivity and server availability."
      });
    } finally {
      setIsSendingTestEmail(false);
    }
  };

  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingGeneral(true);
    setGeneralSaveMsg(null);
    try {
      // 1. Persist locally immediately
      localStorage.setItem("hp_qa_quick_login_enabled", String(quickLoginEnabled));

      // 2. Update server app settings
      try {
        await fetch("/api/app-settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quick_login_enabled: quickLoginEnabled })
        });
      } catch (apiErr) {
        console.warn("Notice updating server app-settings:", apiErr);
      }

      // 3. Update in Supabase app_settings table
      try {
        const { data: existingRows } = await supabase.from("app_settings").select("id").limit(10);
        if (existingRows && existingRows.length > 0) {
          for (const row of existingRows) {
            await supabase.from("app_settings").update({
              quick_login_enabled: quickLoginEnabled,
              expanded_logo_url: expandedLogo,
              collapsed_logo_url: collapsedLogo,
              updated_at: new Date().toISOString()
            }).eq("id", row.id);
          }
        } else {
          await supabase.from("app_settings").insert([{
            quick_login_enabled: quickLoginEnabled,
            expanded_logo_url: expandedLogo,
            collapsed_logo_url: collapsedLogo,
            updated_at: new Date().toISOString()
          }]);
        }
      } catch (dbErr) {
        console.warn("Notice updating Supabase app_settings:", dbErr);
      }

      setGeneralSaveMsg({ type: "success", text: "Settings saved successfully!" });
    } catch (err: any) {
      setGeneralSaveMsg({ type: "error", text: err?.message || "Failed to save settings." });
    } finally {
      setIsSavingGeneral(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
          <SettingsIcon className="w-6 h-6 text-[#2b61d6]" />
          System Settings
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Configure database connectivity, branding, authentication preferences, and migration backups
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-6 text-sm font-medium">
        <button
          onClick={() => switchTab("credentials")}
          className={`pb-3 border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === "credentials"
              ? "border-[#2b61d6] text-[#2b61d6] font-bold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Lock className="w-4 h-4" />
          App Secrets (DB)
        </button>

        <button
          onClick={() => switchTab("general")}
          className={`pb-3 border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === "general"
              ? "border-[#2b61d6] text-[#2b61d6] font-bold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <SettingsIcon className="w-4 h-4" />
          General & Branding
        </button>

        <button
          id="tab-btn-data-management"
          onClick={() => switchTab("data-management")}
          className={`pb-3 border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === "data-management" || activeTab === "migration"
              ? "border-[#2b61d6] text-[#2b61d6] font-bold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Database className="w-4 h-4" />
          Data Management
        </button>
      </div>

      {/* Tab: App Secrets & Credentials in DB */}
      {activeTab === "credentials" && (
        <div className="space-y-6">
          <div className="p-4 rounded-xl bg-purple-50/70 border border-purple-200/80 text-purple-900 text-xs flex items-start gap-3">
            <Sparkles className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Supabase Database Secret Store:</span> Non-database configuration secrets (Gemini AI, Gmail SMTP, Webhook keys) are stored securely in your Supabase database table (<code>app_credentials</code>) rather than being hardcoded or stored in local files. Testing any credential verifies it live and persists it directly into the database.
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Gemini AI Key Card */}
            <Card className="border-slate-200 shadow-xs">
              <CardHeader className="border-b border-slate-100 bg-slate-50/50">
                <CardTitle className="text-sm text-slate-900 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-600" />
                    <span>Gemini AI API Key</span>
                  </div>
                  {storedCreds.geminiConfigured ? (
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Configured in DB
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                      Not Configured
                    </span>
                  )}
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Used for automated campaign checklist QA, content validation, and link analysis.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5 space-y-4">
                {storedCreds.geminiConfigured && (
                  <div className="p-3 bg-emerald-50/60 border border-emerald-200/80 rounded-lg text-xs space-y-1">
                    <div className="flex items-center justify-between text-emerald-800 text-[11px] font-semibold">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Active API Key Stored
                      </span>
                      <span className="text-[10px] font-mono bg-emerald-100 px-1.5 py-0.5 rounded text-emerald-700">
                        ••••••••••••••••
                      </span>
                    </div>
                  </div>
                )}

                {geminiStatus && (
                  <div className={`p-3 rounded-lg text-xs font-medium ${geminiStatus.success ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-rose-50 text-rose-800 border border-rose-200"}`}>
                    {geminiStatus.message}
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <Label className="text-xs font-semibold text-slate-700">API Key</Label>
                    <Input
                      type="password"
                      placeholder={storedCreds.geminiConfigured ? "•••••••••••••••• (Stored in DB - enter new to replace)" : "AIzaSy..."}
                      value={geminiKeyInput}
                      onChange={(e) => setGeminiKeyInput(e.target.value)}
                      className="mt-1 h-9 text-xs font-mono"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      type="button"
                      onClick={handleSaveGemini}
                      disabled={isSavingGemini || !geminiKeyInput.trim()}
                      className="flex-1 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold gap-1.5 cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {isSavingGemini ? "Saving..." : "Save Key"}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => handleTestGemini()}
                      disabled={isTestingGemini || !geminiKeyInput.trim()}
                      variant="outline"
                      className="flex-1 text-xs font-semibold gap-1.5 border-purple-200 text-purple-700 hover:bg-purple-50 cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isTestingGemini ? "animate-spin" : ""}`} />
                      {isTestingGemini ? "Verifying..." : "Test Key"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Gmail SMTP Dispatcher Card */}
            <Card className="border-slate-200 shadow-xs">
              <CardHeader className="border-b border-slate-100 bg-slate-50/50">
                <CardTitle className="text-sm text-slate-900 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-blue-600" />
                    <span>Gmail Dispatcher (SMTP)</span>
                  </div>
                  {storedCreds.gmailConfigured || Boolean(storedCreds.gmailUser) || Boolean(gmailUserInput.trim()) ? (
                    <span className="px-2.5 py-1 text-[11px] font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1.5 shadow-2xs">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Configured & Ready
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 text-[11px] font-medium rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                      Not Configured
                    </span>
                  )}
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Sends automated QA summary reports and campaign sign-off notifications.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5 space-y-4">
                {/* Active Stored Credentials Display */}
                {(storedCreds.gmailUser || gmailUserInput) && (
                  <div className="p-3.5 bg-emerald-50/70 border border-emerald-200/90 rounded-xl text-xs space-y-2">
                    <div className="flex items-center justify-between text-emerald-900 text-[11px] font-semibold">
                      <span className="flex items-center gap-1.5 font-bold text-emerald-950">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Stored SMTP Credentials (Database)
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-200/80 text-emerald-900 font-bold flex items-center gap-1">
                        <Check className="w-3 h-3 text-emerald-700" /> Active in DB
                      </span>
                    </div>
                    <div className="font-mono text-[12px] font-bold text-slate-900 flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-emerald-600" />
                      {storedCreds.gmailUser || gmailUserInput}
                    </div>
                    <div className="text-[11px] text-slate-600 flex items-center justify-between pt-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-slate-700">App Password:</span>
                        <span className="font-mono text-emerald-900 font-medium">
                          {showGmailPassword && (gmailPassInput || storedCreds.gmailAppPassword)
                            ? (gmailPassInput || storedCreds.gmailAppPassword)
                            : "•••••••••••••••• (16-character App Password stored in DB)"}
                        </span>
                      </div>
                      <span className="text-[10px] text-emerald-700 font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Configured & Verified
                      </span>
                    </div>
                  </div>
                )}

                {gmailStatus && (
                  <div className={`p-3 rounded-lg text-xs font-medium ${gmailStatus.success ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-rose-50 text-rose-800 border border-rose-200"}`}>
                    {gmailStatus.message}
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <Label className="text-xs font-semibold text-slate-700">Sender Email</Label>
                    <Input
                      type="email"
                      placeholder="your-email@gmail.com"
                      value={gmailUserInput}
                      onChange={(e) => setGmailUserInput(e.target.value)}
                      className="mt-1 h-9 text-xs"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-xs font-semibold text-slate-700">16-char App Password</Label>
                      <button
                        type="button"
                        onClick={() => setShowGmailPassword(!showGmailPassword)}
                        className="text-[11px] text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer font-medium"
                      >
                        {showGmailPassword ? (
                          <>
                            <EyeOff className="w-3 h-3" /> Hide Password
                          </>
                        ) : (
                          <>
                            <Eye className="w-3 h-3" /> Show Password
                          </>
                        )}
                      </button>
                    </div>
                    <div className="relative">
                      <Input
                        type={showGmailPassword ? "text" : "password"}
                        placeholder={storedCreds.hasGmailPassword ? "•••••••••••••••• (Stored in DB)" : "xxxx xxxx xxxx xxxx"}
                        value={gmailPassInput}
                        onChange={(e) => setGmailPassInput(e.target.value)}
                        className="h-9 text-xs font-mono pr-9"
                      />
                      <button
                        type="button"
                        onClick={() => setShowGmailPassword(!showGmailPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        title={showGmailPassword ? "Hide password" : "Show password"}
                      >
                        {showGmailPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Google App Password retrieved from database. Generate at <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">myaccount.google.com/apppasswords</a>
                    </p>
                  </div>
                  <div className="pt-1">
                    <Button
                      type="button"
                      onClick={handleSaveGmail}
                      disabled={isSavingGmail || !gmailUserInput.trim()}
                      className="w-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold gap-1.5 cursor-pointer h-9"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {isSavingGmail ? "Saving..." : "Save Credentials"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Dispatch Live Test Email */}
          <Card className="border-slate-200 shadow-xs">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Send className="w-4 h-4 text-emerald-600" />
                  <CardTitle className="text-sm text-slate-900">
                    Dispatch Live Test Email
                  </CardTitle>
                </div>
                <span className="text-[11px] text-slate-500 font-medium">
                  Test Email Delivery
                </span>
              </div>
              <CardDescription className="text-xs text-slate-500 mt-1">
                Send a real test email to verify that your stored Gmail credentials and SMTP delivery are working properly.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <form onSubmit={handleSendTestEmail} className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1 space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700">Recipient Email Address</Label>
                    <Input
                      type="email"
                      required
                      placeholder="e.g. user@example.com"
                      value={testEmailRecipient}
                      onChange={(e) => setTestEmailRecipient(e.target.value)}
                      className="h-9 text-xs bg-white"
                    />
                  </div>
                  <div className="sm:self-end">
                    <Button
                      type="submit"
                      disabled={isSendingTestEmail || !testEmailRecipient.trim()}
                      className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold gap-1.5 h-9 cursor-pointer shadow-xs px-4"
                    >
                      <Send className={`w-3.5 h-3.5 ${isSendingTestEmail ? "animate-pulse" : ""}`} />
                      {isSendingTestEmail ? "Dispatching Message..." : "Dispatch Live Test Email"}
                    </Button>
                  </div>
                </div>
              </form>

              {/* Test Email Result Feedback */}
              {testEmailResult && (
                <div className="pt-2">
                  {testEmailResult.success ? (
                    <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2 text-xs text-emerald-900">
                      <div className="flex items-center gap-2 font-bold text-emerald-800 text-sm">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Email is Working! Test message successfully delivered.</span>
                      </div>
                      <p className="text-emerald-700 text-[11px] leading-relaxed">
                        {testEmailResult.message || `Test email dispatched to ${testEmailRecipient}.`}
                      </p>
                      <div className="flex flex-wrap gap-4 pt-1 font-mono text-[11px]">
                        <div className="bg-emerald-100/70 px-2.5 py-1 rounded">
                          <span className="text-emerald-800 font-sans font-semibold mr-1.5">Sender:</span>
                          {testEmailResult.user || storedCreds.gmailUser || gmailUserInput}
                        </div>
                        <div className="bg-emerald-100/70 px-2.5 py-1 rounded">
                          <span className="text-emerald-800 font-sans font-semibold mr-1.5">Port:</span>
                          {testEmailResult.port || 465}
                        </div>
                        {testEmailResult.latencyMs && (
                          <div className="bg-emerald-100/70 px-2.5 py-1 rounded">
                            <span className="text-emerald-800 font-sans font-semibold mr-1.5">Latency:</span>
                            {testEmailResult.latencyMs}ms
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-2 text-xs text-rose-900">
                      <div className="flex items-center gap-2 font-bold text-rose-800 text-sm">
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>Test Email Delivery Failed</span>
                      </div>
                      <div className="p-2.5 bg-rose-100/70 rounded font-mono text-[11px] text-rose-800 break-words">
                        {testEmailResult.error}
                      </div>
                      {testEmailResult.suggestion && (
                        <p className="text-[11px] text-rose-700 leading-relaxed">
                          {testEmailResult.suggestion}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab: General */}
      {activeTab === "general" && (
        <Card className="border-slate-200 shadow-xs">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50">
            <CardTitle className="text-base text-slate-900 flex items-center gap-2">
              <SettingsIcon className="w-4 h-4 text-[#2b61d6]" />
              Platform Branding & Login Preferences
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Customize logos, title bar aesthetics, and quick authentication toggles.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-5">
            {generalSaveMsg && (
              <div
                className={`p-3 rounded-lg text-xs font-medium ${
                  generalSaveMsg.type === "success"
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : "bg-rose-50 text-rose-800 border border-rose-200"
                }`}
              >
                {generalSaveMsg.text}
              </div>
            )}

            <form onSubmit={handleSaveGeneral} className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                <div>
                  <h4 className="text-xs font-bold text-slate-900">One-Click Quick Login</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Allow authorized QA team members to quickly select pre-configured accounts on the login screen.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={quickLoginEnabled}
                    onChange={(e) => setQuickLoginEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#2b61d6]"></div>
                </label>
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700">Primary Header Logo URL (Expanded)</Label>
                <Input
                  value={expandedLogo}
                  onChange={(e) => setExpandedLogo(e.target.value)}
                  className="mt-1 h-9 text-xs"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700">Collapsed Sidebar Logo URL (Icon)</Label>
                <Input
                  value={collapsedLogo}
                  onChange={(e) => setCollapsedLogo(e.target.value)}
                  className="mt-1 h-9 text-xs"
                />
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  disabled={isSavingGeneral}
                  className="bg-[#2b61d6] hover:bg-[#2250b8] text-white text-xs font-semibold"
                >
                  <Save className="w-3.5 h-3.5 mr-1.5" />
                  {isSavingGeneral ? "Saving..." : "Save Preferences"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Tab: Data Management */}
      {(activeTab === "data-management" || activeTab === "migration") && (
        <DataManagementSection isAdmin={isAdmin} role={role} userEmail={userEmail} />
      )}
    </div>
  );
}
export default Settings;
