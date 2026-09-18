import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { 
  Database, Settings as SettingsIcon, Download, Upload, Shield, 
  CheckCircle2, XCircle, RefreshCw, Server, Key, Globe, Image as ImageIcon,
  Save, AlertTriangle, Code, Terminal, Check, Lock, Sparkles, Mail,
  Activity, Send, Wifi, AlertCircle, ExternalLink
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
  const [isTestingGmail, setIsTestingGmail] = useState(false);
  const [isSavingGmail, setIsSavingGmail] = useState(false);
  const [gmailStatus, setGmailStatus] = useState<{ success?: boolean; message?: string } | null>(null);

  const [storedCreds, setStoredCreds] = useState<any>({});
  const [isLoadingCreds, setIsLoadingCreds] = useState(false);

  // SMTP Diagnostics & Test Email State
  const [testEmailRecipient, setTestEmailRecipient] = useState(userEmail || "cbogineni@gmail.com");
  const [isRunningDiagnostics, setIsRunningDiagnostics] = useState(false);
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<any>(null);
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
      const res = await fetch("/api/app-credentials");
      if (res.ok) {
        const data = await res.json();
        if (data.credentials) {
          setStoredCreds(data.credentials);
          if (data.credentials.gmailUser) {
            setGmailUserInput(data.credentials.gmailUser);
          }
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
    if (!cleanUser) {
      setGmailStatus({ success: false, message: "Please enter a sender email address." });
      return;
    }
    setIsSavingGmail(true);
    setGmailStatus(null);
    try {
      const res = await fetch("/api/test-app-credential", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "gmail",
          action: "save",
          user: cleanUser,
          pass: gmailPassInput.trim()
        })
      });
      const data = await res.json();
      if (data.success) {
        setGmailStatus({
          success: true,
          message: data.message || "Gmail Dispatcher credentials saved and stored in database successfully!"
        });
        setGmailPassInput("");
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

  const handleTestGmail = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanUser = gmailUserInput.trim();
    if (!cleanUser) {
      setGmailStatus({ success: false, message: "Please enter a sender email address." });
      return;
    }
    setIsTestingGmail(true);
    setGmailStatus(null);
    try {
      const res = await fetch("/api/test-app-credential", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "gmail",
          user: cleanUser,
          pass: gmailPassInput.trim()
        })
      });
      const data = await res.json();
      if (data.success) {
        setGmailStatus({
          success: true,
          message: data.message || "Gmail SMTP credentials verified and stored in database!"
        });
        setGmailPassInput("");
        await loadAppCredentials();
      } else {
        setGmailStatus({ success: false, message: data.error || "Failed to verify SMTP credentials." });
      }
    } catch (err: any) {
      setGmailStatus({ success: false, message: err.message || "SMTP verification failed." });
    } finally {
      setIsTestingGmail(false);
    }
  };

  const handleRunDiagnostics = async () => {
    setIsRunningDiagnostics(true);
    setDiagnosticResult(null);
    try {
      const res = await fetch("/api/smtp/diagnostics", {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const data = await res.json();
      setDiagnosticResult(data);
    } catch (err: any) {
      setDiagnosticResult({
        success: false,
        overallStatus: "failed",
        details: err.message || "Failed to reach diagnostics endpoint.",
        ports: []
      });
    } finally {
      setIsRunningDiagnostics(false);
    }
  };

  const handleSendTestEmail = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanRecipient = (testEmailRecipient || userEmail || "").trim();
    if (!cleanRecipient) {
      setTestEmailResult({
        success: false,
        error: "Please specify a recipient email address to send the test message."
      });
      return;
    }

    setIsSendingTestEmail(true);
    setTestEmailResult(null);
    try {
      const res = await fetch("/api/smtp/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: cleanRecipient })
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
                  {storedCreds.gmailConfigured || Boolean(storedCreds.gmailUser) ? (
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Configured & Ready
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-slate-100 text-slate-600 border border-slate-200">
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
                {storedCreds.gmailUser && (
                  <div className="p-3 bg-blue-50/60 border border-blue-200/80 rounded-lg text-xs space-y-1.5">
                    <div className="flex items-center justify-between text-blue-900 text-[11px] font-semibold">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" /> Stored SMTP Sender
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-100 text-blue-800 font-medium">
                        Stored in DB
                      </span>
                    </div>
                    <div className="font-mono text-[12px] font-semibold text-slate-800 flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-blue-600" />
                      {storedCreds.gmailUser}
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-1">
                      <span>Password:</span>
                      <span className="font-mono text-slate-700">
                        {storedCreds.isPlaceholderPassword ? (
                          <span className="text-amber-700 font-semibold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                            Placeholder detected — enter real 16-char App Password below
                          </span>
                        ) : storedCreds.hasGmailPassword ? (
                          "•••••••••••••••• (16-character App Password stored)"
                        ) : (
                          "Not provided"
                        )}
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
                    <Label className="text-xs font-semibold text-slate-700">16-char App Password</Label>
                    <Input
                      type="password"
                      placeholder={storedCreds.hasGmailPassword ? "•••••••••••••••• (Stored in DB - leave blank to keep)" : "xxxx xxxx xxxx xxxx"}
                      value={gmailPassInput}
                      onChange={(e) => setGmailPassInput(e.target.value)}
                      className="mt-1 h-9 text-xs font-mono"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      Generate an App Password at <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">myaccount.google.com/apppasswords</a>
                    </p>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      type="button"
                      onClick={handleSaveGmail}
                      disabled={isSavingGmail || !gmailUserInput.trim()}
                      className="flex-1 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold gap-1.5 cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {isSavingGmail ? "Saving..." : "Save Credentials"}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => handleTestGmail()}
                      disabled={isTestingGmail || !gmailUserInput.trim() || (!gmailPassInput.trim() && !storedCreds.hasGmailPassword)}
                      variant="outline"
                      className="flex-1 text-xs font-semibold gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50 cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isTestingGmail ? "animate-spin" : ""}`} />
                      {isTestingGmail ? "Verifying..." : "Test SMTP"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* SMTP Diagnostics & Live Test Email Suite */}
          <Card className="border-slate-200 shadow-xs">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-blue-600" />
                  <CardTitle className="text-sm text-slate-900">
                    SMTP Diagnostics & Live Email Verification
                  </CardTitle>
                </div>
                <div>
                  {diagnosticResult ? (
                    diagnosticResult.overallStatus === "healthy" ? (
                      <span className="px-2.5 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" /> All Ports Operational
                      </span>
                    ) : diagnosticResult.overallStatus === "degraded" ? (
                      <span className="px-2.5 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-amber-600" /> Port Degraded
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 text-[10px] font-bold rounded-full bg-rose-100 text-rose-800 border border-rose-200 flex items-center gap-1">
                        <XCircle className="w-3 h-3 text-rose-600" /> Connection Failed
                      </span>
                    )
                  ) : (
                    <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                      Diagnostics Ready
                    </span>
                  )}
                </div>
              </div>
              <CardDescription className="text-xs text-slate-500 mt-1">
                Inspect live dual-port SMTP handshakes (Port 465 SSL Direct & Port 587 STARTTLS) and dispatch live test emails using credentials stored in the database.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 space-y-5">
              {/* Dual Action Grid */}
              <div className="grid md:grid-cols-2 gap-5">
                {/* Action 1: Network Handshake Diagnostics */}
                <div className="p-4 bg-slate-50/70 border border-slate-200/80 rounded-xl space-y-3">
                  <div className="flex items-center gap-2">
                    <Wifi className="w-4 h-4 text-blue-600" />
                    <h4 className="text-xs font-bold text-slate-800">1. Dual-Port Socket Handshake</h4>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Performs synchronous socket connection tests against Google SMTP servers on both SSL (465) and STARTTLS (587) with aggressive timeout guards.
                  </p>
                  <Button
                    type="button"
                    onClick={handleRunDiagnostics}
                    disabled={isRunningDiagnostics}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold gap-1.5 h-9 cursor-pointer shadow-xs"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRunningDiagnostics ? "animate-spin" : ""}`} />
                    {isRunningDiagnostics ? "Testing Port 465 & 587..." : "Run Port Diagnostics"}
                  </Button>
                </div>

                {/* Action 2: Send Test Email */}
                <form onSubmit={handleSendTestEmail} className="p-4 bg-slate-50/70 border border-slate-200/80 rounded-xl space-y-3">
                  <div className="flex items-center gap-2">
                    <Send className="w-4 h-4 text-emerald-600" />
                    <h4 className="text-xs font-bold text-slate-800">2. Dispatch Live Test Email</h4>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold text-slate-700">Recipient Email</Label>
                    <Input
                      type="email"
                      required
                      placeholder="user@example.com"
                      value={testEmailRecipient}
                      onChange={(e) => setTestEmailRecipient(e.target.value)}
                      className="h-8 text-xs bg-white"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={isSendingTestEmail || !testEmailRecipient.trim()}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold gap-1.5 h-9 cursor-pointer shadow-xs"
                  >
                    <Send className={`w-3.5 h-3.5 ${isSendingTestEmail ? "animate-pulse" : ""}`} />
                    {isSendingTestEmail ? "Dispatching Message..." : "Send Test Email"}
                  </Button>
                </form>
              </div>

              {/* Diagnostic Results Section */}
              {diagnosticResult && (
                <div className="space-y-3 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-blue-600" />
                      Diagnostic Handshake Results
                    </span>
                    {diagnosticResult.recommendedPort && (
                      <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                        Recommended: Port {diagnosticResult.recommendedPort}
                      </span>
                    )}
                  </div>

                  <div className="grid sm:grid-cols-2 gap-3">
                    {Array.isArray(diagnosticResult.ports) && diagnosticResult.ports.map((p: any) => (
                      <div
                        key={p.port}
                        className={`p-3.5 rounded-lg border text-xs space-y-1.5 ${
                          p.status === "connected"
                            ? "bg-emerald-50/70 border-emerald-200 text-emerald-950"
                            : "bg-rose-50/70 border-rose-200 text-rose-950"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold font-mono text-[13px]">
                            Port {p.port}
                          </span>
                          <span
                            className={`px-2 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wider ${
                              p.status === "connected"
                                ? "bg-emerald-200 text-emerald-800"
                                : "bg-rose-200 text-rose-800"
                            }`}
                          >
                            {p.status}
                          </span>
                        </div>
                        <div className="text-[11px] opacity-80 font-medium">
                          Mode: {p.mode}
                        </div>
                        {p.latencyMs ? (
                          <div className="text-[11px] opacity-90 font-mono">
                            Latency: {p.latencyMs}ms
                          </div>
                        ) : null}
                        {p.error && (
                          <div className="text-[11px] text-rose-700 font-mono mt-1 break-words">
                            Error: {p.error}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {diagnosticResult.details && (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                      <span>{diagnosticResult.details}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Test Email Result Section */}
              {testEmailResult && (
                <div className="pt-2 border-t border-slate-100">
                  {testEmailResult.success ? (
                    <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2 text-xs text-emerald-900">
                      <div className="flex items-center gap-2 font-bold text-emerald-800 text-sm">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        Test Message Successfully Dispatched!
                      </div>
                      <p className="text-emerald-700">
                        {testEmailResult.message}
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px]">
                        <div className="bg-emerald-100/60 p-1.5 rounded">
                          <span className="text-emerald-700 block text-[10px] font-sans font-semibold">Port</span>
                          {testEmailResult.port}
                        </div>
                        <div className="bg-emerald-100/60 p-1.5 rounded">
                          <span className="text-emerald-700 block text-[10px] font-sans font-semibold">Latency</span>
                          {testEmailResult.latencyMs ? `${testEmailResult.latencyMs}ms` : "N/A"}
                        </div>
                        <div className="bg-emerald-100/60 p-1.5 rounded col-span-2 truncate">
                          <span className="text-emerald-700 block text-[10px] font-sans font-semibold">Sender</span>
                          {testEmailResult.sender}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-2.5 text-xs text-rose-900">
                      <div className="flex items-center gap-2 font-bold text-rose-800 text-sm">
                        <AlertCircle className="w-4 h-4 text-rose-600" />
                        Test Email Delivery Failed
                      </div>
                      <div className="p-2.5 bg-rose-100/70 rounded font-mono text-[11px] text-rose-800 break-words">
                        {testEmailResult.error}
                      </div>
                      {testEmailResult.suggestion && (
                        <div className="p-2.5 bg-amber-50 border border-amber-200 rounded text-amber-900 space-y-1">
                          <div className="font-semibold flex items-center gap-1.5 text-amber-800">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            How to Resolve:
                          </div>
                          <p className="text-[11px] leading-relaxed">
                            {testEmailResult.suggestion}
                          </p>
                          <a
                            href="https://myaccount.google.com/apppasswords"
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 hover:underline mt-1"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Open Google App Passwords settings
                          </a>
                        </div>
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
