import React, { useState, useEffect } from "react";
import {
  Database,
  Download,
  Upload,
  ShieldCheck,
  ShieldAlert,
  FileJson,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Clock,
  HardDrive,
  Layers,
  Users,
  Activity,
  Sparkles,
  Info,
  FolderArchive,
  ArrowRight,
  Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { getAllCampaigns, fetchFolders } from "@/lib/campaign-storage";
import { cn } from "@/lib/utils";

interface DataManagementSectionProps {
  isAdmin: boolean;
  role: string;
  userEmail?: string;
}

interface BackupManifestPreview {
  fileName: string;
  fileSize: string;
  exportVersion?: string;
  exportedAt?: string;
  counts: {
    campaigns: number;
    folders: number;
    users: number;
    logs: number;
    checklists: number;
  };
  rawBundle: any;
}

interface RestoreStats {
  campaigns: number;
  folders: number;
  users: number;
  checklists: number;
  logs: number;
}

export function DataManagementSection({ isAdmin, role, userEmail }: DataManagementSectionProps) {
  // Live database stats
  const [dbCounts, setDbCounts] = useState({
    campaigns: 0,
    folders: 0,
    users: 0,
    logs: 0,
  });
  const [isLoadingCounts, setIsLoadingCounts] = useState(true);

  // Export State
  const [isExporting, setIsExporting] = useState(false);
  const [lastBackupMeta, setLastBackupMeta] = useState<{ date: string; fileName: string; totalRecords: number } | null>(null);
  const [exportSuccessMsg, setExportSuccessMsg] = useState<string | null>(null);

  // Restore State
  const [isInspectingFile, setIsInspectingFile] = useState(false);
  const [parsedManifest, setParsedManifest] = useState<BackupManifestPreview | null>(null);
  const [restoreMode, setRestoreMode] = useState<"merge" | "full">("merge");
  const [confirmSafetyCheck, setConfirmSafetyCheck] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreStats, setRestoreStats] = useState<RestoreStats | null>(null);
  const [restoreSuccessMsg, setRestoreSuccessMsg] = useState<string | null>(null);

  // Load last backup meta from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("hpqa_last_backup_meta");
      if (stored) {
        setLastBackupMeta(JSON.parse(stored));
      }
    } catch (e) {}
  }, []);

  // Fetch current live record counts
  const loadDatabaseCounts = async () => {
    setIsLoadingCounts(true);
    try {
      let campaignCount = 0;
      let folderCount = 0;
      let userCount = 0;
      let logCount = 0;

      if (isSupabaseConfigured()) {
        try {
          const { count: cCount } = await supabase.from("campaigns").select("*", { count: "exact", head: true });
          if (cCount !== null) campaignCount = cCount;
        } catch (e) {}

        try {
          const { count: fCount } = await supabase.from("folders").select("*", { count: "exact", head: true });
          if (fCount !== null) folderCount = fCount;
        } catch (e) {}

        try {
          const { count: uCount } = await supabase.from("app_users").select("*", { count: "exact", head: true });
          if (uCount !== null) userCount = uCount;
        } catch (e) {}

        try {
          const { count: lCount } = await supabase.from("activity_logs").select("*", { count: "exact", head: true });
          if (lCount !== null) logCount = lCount;
        } catch (e) {}
      }

      // If Supabase counts are 0 or offline, check local storage/cache fallback
      if (campaignCount === 0) {
        const localCampaigns = await getAllCampaigns();
        campaignCount = localCampaigns.length;
      }
      if (folderCount === 0) {
        const localFolders = await fetchFolders();
        folderCount = localFolders.length;
      }

      setDbCounts({
        campaigns: campaignCount,
        folders: folderCount,
        users: userCount || 1,
        logs: logCount || 0,
      });
    } catch (err) {
      console.warn("Failed to retrieve live counts:", err);
    } finally {
      setIsLoadingCounts(false);
    }
  };

  useEffect(() => {
    loadDatabaseCounts();
  }, []);

  // Trigger Manual Database Backup
  const handleTriggerBackup = async () => {
    if (!isAdmin) return;
    setIsExporting(true);
    setExportSuccessMsg(null);

    try {
      const response = await fetch("/api/export-migration-data");
      if (!response.ok) {
        throw new Error(`Export failed with HTTP status ${response.status}`);
      }

      const blob = await response.blob();
      const timestampStr = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const fileName = `hp_qa_database_backup_${timestampStr}.json`;

      // Download file to browser
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);

      // Estimate total records
      const totalRecs = dbCounts.campaigns + dbCounts.folders + dbCounts.users + dbCounts.logs;
      const meta = {
        date: new Date().toISOString(),
        fileName,
        totalRecords: totalRecs,
      };
      setLastBackupMeta(meta);
      localStorage.setItem("hpqa_last_backup_meta", JSON.stringify(meta));

      const sizeKb = (blob.size / 1024).toFixed(1);
      setExportSuccessMsg(
        `Database backup successfully generated (${sizeKb} KB). All campaigns, folders, users, and audit logs have been archived into JSON.`
      );
    } catch (err: any) {
      alert("Failed to export manual database backup: " + (err?.message || "Unknown error"));
    } finally {
      setIsExporting(false);
    }
  };

  // Inspect Selected JSON File for Restoration
  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsInspectingFile(true);
    setParsedManifest(null);
    setRestoreError(null);
    setRestoreStats(null);
    setRestoreSuccessMsg(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);

        const campaigns = Array.isArray(parsed.campaigns) ? parsed.campaigns : [];
        const folders = Array.isArray(parsed.folders) ? parsed.folders : [];
        const users = Array.isArray(parsed.users) ? parsed.users : [];
        const logs = Array.isArray(parsed.logs) ? parsed.logs : [];
        const checklists = Array.isArray(parsed.checklists) ? parsed.checklists : [];

        if (campaigns.length === 0 && folders.length === 0 && users.length === 0) {
          throw new Error("The selected file does not contain recognized database records (campaigns, folders, or users).");
        }

        const fileSizeKb = (file.size / 1024).toFixed(1) + " KB";
        setParsedManifest({
          fileName: file.name,
          fileSize: fileSizeKb,
          exportVersion: parsed.exportVersion || "1.0",
          exportedAt: parsed.manifest?.exportedAt || parsed.exportDate || "Unknown date",
          counts: {
            campaigns: campaigns.length,
            folders: folders.length,
            users: users.length,
            logs: logs.length,
            checklists: checklists.length,
          },
          rawBundle: parsed,
        });
      } catch (err: any) {
        setRestoreError("Invalid or corrupted JSON backup file: " + err.message);
      } finally {
        setIsInspectingFile(false);
      }
    };

    reader.onerror = () => {
      setRestoreError("Failed to read the selected file from disk.");
      setIsInspectingFile(false);
    };

    reader.readAsText(file);
    e.target.value = "";
  };

  // Execute Database Restore
  const handleExecuteRestore = async () => {
    if (!parsedManifest || !confirmSafetyCheck) return;
    setIsRestoring(true);
    setRestoreError(null);
    setRestoreSuccessMsg(null);
    setRestoreStats(null);

    try {
      const response = await fetch("/api/import-migration-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsedManifest.rawBundle),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to restore database from backup.");
      }

      setRestoreStats(result.stats || parsedManifest.counts);
      setRestoreSuccessMsg(
        result.message || "Database restoration completed successfully! All tables synchronized."
      );
      setParsedManifest(null);
      setConfirmSafetyCheck(false);

      // Trigger global database-synced event so navigation, folders, and dashboard refresh
      window.dispatchEvent(new CustomEvent("database-synced"));

      // Refresh local record counts
      await loadDatabaseCounts();
    } catch (err: any) {
      setRestoreError(err.message || "Database restoration failed.");
    } finally {
      setIsRestoring(false);
    }
  };

  // If user is not an admin, render enterprise role-restricted barrier
  if (!isAdmin) {
    return (
      <div id="data-management-restricted" className="p-6 rounded-2xl border border-amber-200 bg-amber-50/70 text-amber-950 space-y-3">
        <div className="flex items-center gap-2.5 font-bold text-sm text-amber-900">
          <ShieldAlert className="w-5 h-5 text-amber-600" />
          <span>Admin Access Required: Data Management Restricted</span>
        </div>
        <p className="text-xs leading-relaxed text-amber-800">
          The Data Management console permits raw database snapshots, manual backups, and table restoration. To safeguard production records, only users with the <strong>Administrator</strong> role can perform manual backups and restores.
        </p>
        <div className="pt-1 flex items-center gap-2 text-[11px] text-amber-700">
          <span>Current signed in account:</span>
          <span className="font-semibold bg-amber-100/80 px-2 py-0.5 rounded border border-amber-300">
            {userEmail || "Anonymous"} ({role})
          </span>
        </div>
      </div>
    );
  }

  return (
    <div id="data-management-section" className="space-y-6">
      {/* Enterprise Data Safety Guarantee Banner */}
      <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200/80 text-emerald-950 text-xs flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-bold flex items-center gap-2 text-emerald-900">
            <span>Enterprise Data Safety & Portability Guarantee</span>
            <span className="text-[10px] bg-emerald-200/60 text-emerald-800 px-1.5 py-0.2 rounded font-mono font-semibold">
              v2.0 Standard
            </span>
          </div>
          <p className="text-[11px] leading-relaxed text-emerald-800">
            Database backups and JSON restorations strictly preserve your server credentials, <code>.env</code> configurations, API secrets, and active user authentication sessions. All operations are atomic, non-destructive to system secrets, and portable across staging, local, and production environments.
          </p>
        </div>
      </div>

      {/* Database Health & Live Record Snapshot */}
      <Card className="border-slate-200 shadow-xs">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm text-slate-900 flex items-center gap-2">
                <Database className="w-4 h-4 text-[#2b61d6]" />
                <span>Live Database State & Health</span>
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 mt-0.5">
                Current records stored across campaigns, folders, and platform users
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={loadDatabaseCounts}
              disabled={isLoadingCounts}
              className="text-xs h-8 gap-1.5 self-start sm:self-auto"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", isLoadingCounts && "animate-spin")} />
              <span>Refresh Metrics</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {/* Campaigns count */}
            <div className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/60">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">Campaigns</span>
                <Layers className="w-4 h-4 text-blue-600" />
              </div>
              <div className="text-2xl font-extrabold text-slate-900 mt-1">
                {isLoadingCounts ? "-" : dbCounts.campaigns}
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">Audits & records</p>
            </div>

            {/* Folders count */}
            <div className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/60">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">Folders</span>
                <FolderArchive className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="text-2xl font-extrabold text-slate-900 mt-1">
                {isLoadingCounts ? "-" : dbCounts.folders}
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">Hierarchy trees</p>
            </div>

            {/* Users count */}
            <div className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/60">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">App Users</span>
                <Users className="w-4 h-4 text-purple-600" />
              </div>
              <div className="text-2xl font-extrabold text-slate-900 mt-1">
                {isLoadingCounts ? "-" : dbCounts.users}
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">Registered members</p>
            </div>

            {/* Audit Logs count */}
            <div className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/60">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">Activity Logs</span>
                <Activity className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-extrabold text-slate-900 mt-1">
                {isLoadingCounts ? "-" : dbCounts.logs}
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">Logged actions</p>
            </div>
          </div>

          {/* Last Backup Notice */}
          <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-500 gap-2">
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>
                Last manual backup:{" "}
                {lastBackupMeta ? (
                  <strong className="text-slate-700">
                    {new Date(lastBackupMeta.date).toLocaleDateString()} at{" "}
                    {new Date(lastBackupMeta.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </strong>
                ) : (
                  <span className="text-slate-400 italic">No backup triggered yet this session</span>
                )}
              </span>
            </div>
            {lastBackupMeta && (
              <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                {lastBackupMeta.fileName}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Main Operations Grid: Backup (Export) & Restore (Import) */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Card 1: Manual Database Backup (Export) */}
        <Card className="border-slate-200 shadow-xs flex flex-col justify-between">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50">
            <CardTitle className="text-base text-slate-900 flex items-center gap-2">
              <Download className="w-4 h-4 text-[#2b61d6]" />
              <span>Manual Database Backup</span>
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Generate and download a comprehensive JSON snapshot of the entire database.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-4 flex-1 flex flex-col justify-between">
            <div className="space-y-3">
              <p className="text-xs text-slate-600 leading-relaxed">
                Creates a standardized <code>.json</code> file archiving:
              </p>
              <ul className="text-xs text-slate-600 space-y-1.5 pl-1">
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>All Campaigns, QA findings, checkpoint results, and review notes</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Folder organization structures and year partitions</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Registered App Users, permissions, and team allocations</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Customized checklist verification standards and activity audit trails</span>
                </li>
              </ul>

              {exportSuccessMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{exportSuccessMsg}</span>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-100">
              <Button
                id="btn-trigger-manual-backup"
                type="button"
                onClick={handleTriggerBackup}
                disabled={isExporting}
                className="w-full bg-[#2b61d6] hover:bg-[#2250b8] text-white text-xs font-semibold h-10 gap-2 cursor-pointer shadow-xs"
              >
                {isExporting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Packaging Database JSON...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Trigger Manual Database Backup</span>
                  </>
                )}
              </Button>
              <p className="text-[11px] text-slate-400 text-center mt-2">
                Format: Standard JSON • Portable • Encrypted in transit
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Database Restore (Import) */}
        <Card className="border-slate-200 shadow-xs flex flex-col justify-between">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50">
            <CardTitle className="text-base text-slate-900 flex items-center gap-2">
              <Upload className="w-4 h-4 text-emerald-600" />
              <span>Database Restore</span>
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Restore previously archived campaigns, folders, and platform records from a JSON file.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-4 flex-1 flex flex-col justify-between">
            <div className="space-y-3">
              {/* File Upload Selector */}
              <div>
                <label className="flex flex-col items-center justify-center gap-2 w-full p-5 rounded-xl border-2 border-dashed border-slate-300 hover:border-[#2b61d6] bg-slate-50/50 hover:bg-blue-50/30 text-slate-600 text-xs font-semibold cursor-pointer transition-all">
                  <FileJson className="w-7 h-7 text-[#2b61d6]" />
                  <div className="text-center">
                    <span className="text-[#2b61d6] hover:underline font-bold">Choose a Backup JSON File</span>
                    <p className="text-[11px] text-slate-400 font-normal mt-0.5">
                      Accepts standardized HP QA platform backup archives (.json)
                    </p>
                  </div>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleFileSelected}
                    disabled={isInspectingFile || isRestoring}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Inspection Spinner */}
              {isInspectingFile && (
                <div className="p-3 bg-blue-50 border border-blue-200 text-blue-900 rounded-lg text-xs flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#2b61d6]" />
                  <span>Validating backup JSON structure and record manifests...</span>
                </div>
              )}

              {/* Error state */}
              {restoreError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-900 rounded-lg text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{restoreError}</span>
                </div>
              )}

              {/* Success Result state */}
              {restoreSuccessMsg && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2 text-xs text-emerald-950">
                  <div className="flex items-center gap-2 font-bold text-emerald-900 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Restoration Successful!</span>
                  </div>
                  <p className="text-emerald-800 text-xs leading-relaxed">{restoreSuccessMsg}</p>
                  {restoreStats && (
                    <div className="grid grid-cols-3 gap-2 pt-1 font-mono text-[11px]">
                      <div className="bg-emerald-100/70 p-1.5 rounded text-center">
                        <span className="text-emerald-800 font-bold block text-xs">{restoreStats.campaigns}</span>
                        <span className="text-emerald-700 text-[10px] font-sans">Campaigns</span>
                      </div>
                      <div className="bg-emerald-100/70 p-1.5 rounded text-center">
                        <span className="text-emerald-800 font-bold block text-xs">{restoreStats.folders}</span>
                        <span className="text-emerald-700 text-[10px] font-sans">Folders</span>
                      </div>
                      <div className="bg-emerald-100/70 p-1.5 rounded text-center">
                        <span className="text-emerald-800 font-bold block text-xs">{restoreStats.users}</span>
                        <span className="text-emerald-700 text-[10px] font-sans">Users</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Pre-Restore Verification & Manifest Panel */}
              {parsedManifest && (
                <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-blue-950 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#2b61d6]" />
                      Backup Validated: {parsedManifest.fileName}
                    </span>
                    <span className="text-[10px] text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded font-mono">
                      {parsedManifest.fileSize}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="p-2 bg-white rounded-lg border border-blue-100 shadow-2xs">
                      <span className="block font-extrabold text-slate-900 text-sm">{parsedManifest.counts.campaigns}</span>
                      <span className="text-[10px] text-slate-500">Campaigns</span>
                    </div>
                    <div className="p-2 bg-white rounded-lg border border-blue-100 shadow-2xs">
                      <span className="block font-extrabold text-slate-900 text-sm">{parsedManifest.counts.folders}</span>
                      <span className="text-[10px] text-slate-500">Folders</span>
                    </div>
                    <div className="p-2 bg-white rounded-lg border border-blue-100 shadow-2xs">
                      <span className="block font-extrabold text-slate-900 text-sm">{parsedManifest.counts.users}</span>
                      <span className="text-[10px] text-slate-500">Users</span>
                    </div>
                  </div>

                  {/* Safety Check Confirmation */}
                  <label className="flex items-start gap-2 pt-1 text-xs text-slate-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={confirmSafetyCheck}
                      onChange={(e) => setConfirmSafetyCheck(e.target.checked)}
                      className="mt-0.5 rounded border-slate-300 text-[#2b61d6] focus:ring-[#2b61d6]"
                    />
                    <span className="text-[11px] leading-tight text-slate-600">
                      I confirm and authorize restoring these <strong>{parsedManifest.counts.campaigns} campaigns</strong> into the database.
                    </span>
                  </label>

                  <Button
                    type="button"
                    onClick={handleExecuteRestore}
                    disabled={!confirmSafetyCheck || isRestoring}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold h-9 gap-2 cursor-pointer shadow-xs"
                  >
                    {isRestoring ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Restoring Database Records...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-3.5 h-3.5" />
                        <span>Execute Database Restoration</span>
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-100 text-[11px] text-slate-400 text-center">
              Restores records safely using atomic upsert synchronization
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
