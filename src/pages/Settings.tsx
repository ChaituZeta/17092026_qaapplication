import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { 
  Database, Settings as SettingsIcon, Download, Upload, Shield, 
  CheckCircle2, XCircle, RefreshCw, Server, Key, Globe, Image as ImageIcon,
  Save, AlertTriangle, Code, Terminal, Check, Lock, Sparkles, Mail
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function Settings({ role, userEmail }: { role: string; userEmail?: string }) {
  const isAdmin = role === "admin";
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") || "credentials";
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

  // General Settings Tab State
  const [quickLoginEnabled, setQuickLoginEnabled] = useState(true);
  const [expandedLogo, setExpandedLogo] = useState("https://zetaglobal.com/wp-content/uploads/2023/02/zeta_logoPrimary.svg");
  const [collapsedLogo, setCollapsedLogo] = useState("https://companieslogo.com/img/orig/ZETA-424536bc.png");
  const [isSavingGeneral, setIsSavingGeneral] = useState(false);
  const [generalSaveMsg, setGeneralSaveMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Migration Tab State
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

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

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      const response = await fetch("/api/export-migration-data");
      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `hp_qa_platform_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err: any) {
      alert("Failed to export backup: " + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        setIsImporting(true);
        setImportResult(null);
        const parsed = JSON.parse(event.target?.result as string);
        const response = await fetch("/api/import-migration-data", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed)
        });
        const data = await response.json();
        if (data.success) {
          setImportResult(data.message || "Import completed successfully!");
        } else {
          setImportResult("Error: " + (data.error || "Failed to import data"));
        }
      } catch (err: any) {
        setImportResult("Failed to parse JSON file: " + err.message);
      } finally {
        setIsImporting(false);
      }
    };
    reader.readAsText(file);
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
          onClick={() => switchTab("migration")}
          className={`pb-3 border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === "migration"
              ? "border-[#2b61d6] text-[#2b61d6] font-bold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Server className="w-4 h-4" />
          Backup & Migration
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

      {/* Tab: Migration */}
      {activeTab === "migration" && (
        <div className="space-y-6">
          <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200/80 text-emerald-950 text-xs flex items-start gap-3">
            <Shield className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Migration Preservation Guarantee:</span> Database migrations and snapshot imports strictly preserve your existing <code>.env</code> file and credentials intact. Your database connection settings are never overwritten, replaced, or deleted during migrations.
            </div>
          </div>

          <Card className="border-slate-200 shadow-xs">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50">
              <CardTitle className="text-base text-slate-900 flex items-center gap-2">
                <Server className="w-4 h-4 text-[#2b61d6]" />
                Backup & Data Migration
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Export and import complete database snapshots including campaigns, folders, users, and activity logs.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              {importResult && (
                <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-xs font-medium">
                  {importResult}
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-6">
                {/* Export Card */}
                <div className="p-5 border border-slate-200 rounded-xl bg-white space-y-3">
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Download className="w-4 h-4 text-[#2b61d6]" />
                    Export Full Platform Snapshot
                  </h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Download a standardized JSON archive with all campaigns, QA results, users, folders, and audit logs.
                  </p>
                  <Button
                    onClick={handleExportData}
                    disabled={isExporting}
                    variant="outline"
                    className="w-full text-xs font-semibold gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {isExporting ? "Exporting..." : "Download JSON Backup"}
                  </Button>
                </div>

                {/* Import Card */}
                <div className="p-5 border border-slate-200 rounded-xl bg-white space-y-3">
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Upload className="w-4 h-4 text-[#2b61d6]" />
                    Import Snapshot
                  </h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Restore previously exported campaigns and user state from a JSON backup file.
                  </p>
                  <label className="flex items-center justify-center gap-2 w-full h-9 px-4 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer shadow-xs transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    {isImporting ? "Importing..." : "Select Backup JSON File"}
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleImportFile}
                      disabled={isImporting}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
export default Settings;
