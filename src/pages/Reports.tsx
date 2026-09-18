import React, { useState, useMemo } from 'react';
import { 
  BarChart2, 
  Search, 
  Filter, 
  Download, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  User, 
  Folder, 
  ChevronDown, 
  ChevronRight, 
  ExternalLink, 
  FileText, 
  TrendingUp, 
  ShieldCheck, 
  Eye, 
  CheckSquare, 
  XSquare,
  Sparkles,
  Printer,
  X,
  FileSpreadsheet,
  Users,
  RefreshCw,
  Check,
  Info
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getAllCampaigns, CampaignRecord } from '@/lib/campaign-storage';
import { getCampaignCheckpointProgress } from '@/lib/checklist-utils';
import { cn } from '@/lib/utils';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resolveUserFullName, loadAppUsersMetadata } from '@/lib/userNames';
import {
  exportCampaignsToCSV,
  exportAuditorsToCSV,
  exportCampaignsToPDF,
  exportSingleCampaignChecklistToPDF,
  exportSingleCampaignChecklistToCSV
} from '@/lib/report-export';

const STAGE_TITLES: Record<string, string> = {
  "0": "Stage 0: Pre-QA Setup & Compliance",
  "1": "Stage 1: Pre-QA Setup & Campaign Details",
  "2": "Stage 2: Visual Comparison & Brief Verification",
  "3": "Stage 3: Alt & Alias Tags Inspection",
  "4": "Stage 4: Link Validation & Tracking Parameters",
  "5": "Stage 5: Grammar, Spell Check & Regional Compliance",
  "6": "Stage 6: Review, Scheduling & Final Signoff"
};

export function Reports() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([]);
  const statusFilter = searchParams.get("status") || "all";
  const progressFilter = searchParams.get("progress") || "all";
  const searchQuery = searchParams.get("q") || "";
  const [selectedCampaignForDetail, setSelectedCampaignForDetail] = useState<CampaignRecord | null>(null);

  // Export and UI states
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [isExportingModalPDF, setIsExportingModalPDF] = useState(false);
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);
  const [showAuditorTable, setShowAuditorTable] = useState(true);

  // Toast feedback state
  const [toastMessage, setToastMessage] = useState<{
    id: number;
    type: "success" | "error" | "info";
    title: string;
    message: string;
  } | null>(null);

  const triggerToast = (type: "success" | "error" | "info", title: string, message: string) => {
    setToastMessage({
      id: Date.now(),
      type,
      title,
      message
    });
    setTimeout(() => {
      setToastMessage(null);
    }, 6000);
  };

  const setStatusFilter = (st: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (st && st !== "all") next.set("status", st);
      else next.delete("status");
      return next;
    }, { replace: true });
  };

  const setProgressFilter = (pf: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (pf && pf !== "all") next.set("progress", pf);
      else next.delete("progress");
      return next;
    }, { replace: true });
  };

  const setSearchQuery = (q: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (q) next.set("q", q);
      else next.delete("q");
      return next;
    }, { replace: true });
  };

  React.useEffect(() => {
    loadAppUsersMetadata();
    async function fetchAll() {
      const data = await getAllCampaigns();
      setCampaigns(data);
    }
    fetchAll();
  }, []);

  // Compute aggregated report statistics
  const reportStats = useMemo(() => {
    let totalCampaigns = campaigns.length;
    let totalCheckpoints = 0;
    let completedCheckpoints = 0;
    let checkedCount = 0;
    let naCount = 0;
    let pendingCount = 0;
    let fullyVerifiedCount = 0;

    const qaPersonMap: Record<string, { count: number; completed: number; total: number }> = {};

    campaigns.forEach(campaign => {
      const prog = getCampaignCheckpointProgress(campaign);
      totalCheckpoints += prog.total;
      completedCheckpoints += prog.completed;
      checkedCount += prog.checked;
      naCount += prog.na;
      pendingCount += prog.pending;

      if (prog.isFullyCompleted) {
        fullyVerifiedCount++;
      }

      const rawQa = campaign.assignedQa || campaign.lastEditedBy || campaign.createdBy || campaign.userEmail;
      const qaPerson = resolveUserFullName(rawQa, "Chaithanya");
      if (!qaPersonMap[qaPerson]) {
        qaPersonMap[qaPerson] = { count: 0, completed: 0, total: 0 };
      }
      qaPersonMap[qaPerson].count += 1;
      qaPersonMap[qaPerson].completed += prog.completed;
      qaPersonMap[qaPerson].total += prog.total;
    });

    const overallPercentage = totalCheckpoints > 0 ? Math.round((completedCheckpoints / totalCheckpoints) * 100) : 0;

    return {
      totalCampaigns,
      totalCheckpoints,
      completedCheckpoints,
      checkedCount,
      naCount,
      pendingCount,
      fullyVerifiedCount,
      overallPercentage,
      qaPersonMap
    };
  }, [campaigns]);

  // Filtered campaigns for table
  const filteredCampaigns = useMemo(() => {
    return campaigns.filter(c => {
      if (c.is_deleted) return false;

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesName = c.name.toLowerCase().includes(q);
        const matchesCountry = c.country.toLowerCase().includes(q);
        const qaName = resolveUserFullName(c.assignedQa || c.createdBy || c.userEmail, "").toLowerCase();
        const matchesUser = (c.createdBy || '').toLowerCase().includes(q) || (c.lastEditedBy || '').toLowerCase().includes(q) || qaName.includes(q);
        if (!matchesName && !matchesCountry && !matchesUser) return false;
      }

      if (statusFilter !== 'all' && c.status !== statusFilter) return false;

      const prog = getCampaignCheckpointProgress(c);
      if (progressFilter === 'completed' && !prog.isFullyCompleted) return false;
      if (progressFilter === 'in_progress' && (prog.completed === 0 || prog.isFullyCompleted)) return false;
      if (progressFilter === 'unstarted' && prog.completed > 0) return false;

      return true;
    });
  }, [campaigns, searchQuery, statusFilter, progressFilter]);

  // Export handlers
  const handleExportPDF = async () => {
    setIsExportingPDF(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 50));
      const filterContext = [
        statusFilter !== 'all' ? `Status: ${statusFilter}` : null,
        progressFilter !== 'all' ? `Progress: ${progressFilter}` : null,
        searchQuery ? `Search: "${searchQuery}"` : null,
      ].filter(Boolean).join(' | ') || 'All Active Campaigns';

      exportCampaignsToPDF({
        campaigns: filteredCampaigns,
        reportStats,
        filterContext
      });

      triggerToast(
        "success",
        "PDF Report Generated",
        `Successfully generated and downloaded PDF audit report for ${filteredCampaigns.length} campaign(s).`
      );
    } catch (err: any) {
      console.error("Failed to generate PDF report:", err);
      triggerToast(
        "error",
        "PDF Generation Failed",
        err.message || "An unexpected error occurred while generating the PDF audit report."
      );
    } finally {
      setIsExportingPDF(false);
      setIsExportDropdownOpen(false);
    }
  };

  const handleExportFilteredCSV = () => {
    try {
      exportCampaignsToCSV(filteredCampaigns);
      triggerToast(
        "success",
        "CSV Export Complete",
        `Exported ${filteredCampaigns.length} filtered campaign QA records to CSV.`
      );
    } catch (err: any) {
      triggerToast("error", "Export Failed", err.message || "Could not export CSV file.");
    }
    setIsExportDropdownOpen(false);
  };

  const handleExportAllCSV = () => {
    try {
      const activeCampaigns = campaigns.filter(c => !c.is_deleted);
      exportCampaignsToCSV(
        activeCampaigns,
        `QA_All_Campaigns_Complete_Dataset_${new Date().toISOString().slice(0, 10)}.csv`
      );
      triggerToast(
        "success",
        "Full Dataset Exported",
        `Exported all ${activeCampaigns.length} campaigns and complete audit metrics to CSV.`
      );
    } catch (err: any) {
      triggerToast("error", "Export Failed", err.message || "Could not export CSV file.");
    }
    setIsExportDropdownOpen(false);
  };

  const handleExportAuditorsCSV = () => {
    try {
      const auditorCount = Object.keys(reportStats.qaPersonMap).length;
      exportAuditorsToCSV(reportStats.qaPersonMap);
      triggerToast(
        "success",
        "Auditor Performance Exported",
        `Exported QA workload metrics for ${auditorCount} auditor(s) to CSV.`
      );
    } catch (err: any) {
      triggerToast("error", "Export Failed", err.message || "Could not export auditor CSV.");
    }
    setIsExportDropdownOpen(false);
  };

  const handleExportCampaignChecklistPDF = async (campaign: CampaignRecord) => {
    setIsExportingModalPDF(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 50));
      exportSingleCampaignChecklistToPDF(campaign);
      triggerToast(
        "success",
        "Inspection Certificate Downloaded",
        `PDF inspection report for "${campaign.name}" generated successfully.`
      );
    } catch (err: any) {
      console.error("PDF export error:", err);
      triggerToast("error", "Export Failed", err.message || "Could not generate campaign PDF certificate.");
    } finally {
      setIsExportingModalPDF(false);
    }
  };

  const handleExportCampaignChecklistCSV = (campaign: CampaignRecord) => {
    try {
      exportSingleCampaignChecklistToCSV(campaign);
      triggerToast(
        "success",
        "Checklist CSV Downloaded",
        `Itemized QA checklist for "${campaign.name}" exported to CSV.`
      );
    } catch (err: any) {
      triggerToast("error", "Export Failed", err.message || "Could not export checklist CSV.");
    }
  };

  // Group items for selected campaign modal
  const detailProgress = useMemo(() => {
    if (!selectedCampaignForDetail) return null;
    return getCampaignCheckpointProgress(selectedCampaignForDetail);
  }, [selectedCampaignForDetail]);

  const detailStageGroups = useMemo(() => {
    if (!detailProgress) return [];
    const groups: Record<number, typeof detailProgress.items> = {};
    detailProgress.items.forEach((entry, idx) => {
      const stage = entry.item.stage ?? Math.floor(idx / 4) + 1;
      if (!groups[stage]) groups[stage] = [];
      groups[stage].push(entry);
    });
    return Object.entries(groups).sort(([a], [b]) => Number(a) - Number(b));
  }, [detailProgress]);

  return (
    <div className="min-h-screen bg-slate-50/50 p-6 md:p-8 space-y-6">
      
      {/* HEADER BAR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-[#2b61d6] uppercase tracking-wider mb-1">
            <BarChart2 className="w-4 h-4" />
            <span>Admin Quality Assurance Reports</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            QA Checkpoint Audit Reports
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Comprehensive audit report tracking QA inspector progress, checkpoint status, and compliance across all active campaigns.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap relative">
          <Button
            type="button"
            variant="outline"
            onClick={() => window.print()}
            className="h-9 text-xs font-bold gap-1.5 border-slate-200 hover:bg-slate-50 text-slate-700"
          >
            <Printer className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Print View</span>
          </Button>

          {/* Quick PDF Export */}
          <Button
            type="button"
            disabled={isExportingPDF}
            onClick={handleExportPDF}
            className="h-9 text-xs font-bold gap-1.5 bg-rose-600 hover:bg-rose-700 text-white shadow-xs"
          >
            {isExportingPDF ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileText className="w-3.5 h-3.5" />
            )}
            <span>Export PDF Report</span>
          </Button>

          {/* Export Dropdown Menu */}
          <div className="relative">
            <Button
              type="button"
              onClick={() => setIsExportDropdownOpen(prev => !prev)}
              className="h-9 text-xs font-bold gap-1.5 bg-[#2b61d6] hover:bg-blue-700 text-white shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
              <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", isExportDropdownOpen ? "rotate-180" : "")} />
            </Button>

            {isExportDropdownOpen && (
              <>
                <div 
                  className="fixed inset-0 z-20" 
                  onClick={() => setIsExportDropdownOpen(false)} 
                />
                <div className="absolute right-0 top-full mt-1.5 w-64 bg-white rounded-xl shadow-xl border border-slate-200 z-30 py-1.5 text-xs animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                    Export Options
                  </div>

                  <button
                    type="button"
                    onClick={handleExportFilteredCSV}
                    className="w-full px-3 py-2.5 text-left hover:bg-slate-50 flex items-start gap-2.5 text-slate-700 hover:text-slate-900 cursor-pointer"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold">Filtered Table (CSV)</div>
                      <div className="text-[11px] text-slate-400">Current view ({filteredCampaigns.length} campaigns)</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportAllCSV}
                    className="w-full px-3 py-2.5 text-left hover:bg-slate-50 flex items-start gap-2.5 text-slate-700 hover:text-slate-900 cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-[#2b61d6] shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold">Complete Dataset (CSV)</div>
                      <div className="text-[11px] text-slate-400">All active campaigns & metrics</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportAuditorsCSV}
                    className="w-full px-3 py-2.5 text-left hover:bg-slate-50 flex items-start gap-2.5 text-slate-700 hover:text-slate-900 cursor-pointer"
                  >
                    <Users className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold">Auditor Performance (CSV)</div>
                      <div className="text-[11px] text-slate-400">Auditor workload & compliance</div>
                    </div>
                  </button>

                  <div className="border-t border-slate-100 my-1" />

                  <button
                    type="button"
                    onClick={handleExportPDF}
                    className="w-full px-3 py-2.5 text-left hover:bg-rose-50 flex items-start gap-2.5 text-slate-700 hover:text-rose-900 cursor-pointer"
                  >
                    <FileText className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold text-rose-700">Audit Summary (PDF)</div>
                      <div className="text-[11px] text-rose-500/80">Executive landscape report</div>
                    </div>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* KPI STATS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Stat 1 */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Total Campaigns</span>
            <span className="text-2xl font-black text-slate-900 mt-1 block">{reportStats.totalCampaigns}</span>
            <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1 mt-1">
              <ShieldCheck className="w-3 h-3" /> {reportStats.fullyVerifiedCount} 100% QA Verified
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-[#2b61d6] flex items-center justify-center border border-blue-100">
            <Folder className="w-6 h-6" />
          </div>
        </div>

        {/* Stat 2 */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Overall Compliance Rate</span>
            <span className="text-2xl font-black text-slate-900 mt-1 block">{reportStats.overallPercentage}%</span>
            <span className="text-[10px] text-slate-500 font-medium mt-1 block">
              {reportStats.completedCheckpoints} of {reportStats.totalCheckpoints} Checkpoints
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        {/* Stat 3 */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Verified Checkpoints</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-emerald-700">{reportStats.checkedCount}</span>
              <span className="text-xs text-slate-500">Checked</span>
            </div>
            <span className="text-[10px] text-slate-500 font-medium mt-1 block">
              + {reportStats.naCount} N/A Marked
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        {/* Stat 4 */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Pending QA Items</span>
            <span className="text-2xl font-black text-amber-600 mt-1 block">{reportStats.pendingCount}</span>
            <span className="text-[10px] text-amber-700 font-semibold flex items-center gap-1 mt-1">
              <Clock className="w-3 h-3" /> Awaiting Inspector Check
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>

      </div>

      {/* AUDITOR PERFORMANCE BREAKDOWN CARD */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#2b61d6]" />
            <h3 className="font-bold text-sm text-slate-800">
              Auditor QA Workload & Compliance Performance
            </h3>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-[#2b61d6] border border-blue-200">
              {Object.keys(reportStats.qaPersonMap).length} Auditors
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleExportAuditorsCSV}
              className="h-8 text-xs font-semibold gap-1.5 border-slate-200 hover:bg-slate-50 text-slate-700"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-purple-600" />
              <span>Export Auditor CSV</span>
            </Button>

            <button
              type="button"
              onClick={() => setShowAuditorTable(prev => !prev)}
              className="text-xs text-slate-500 hover:text-slate-800 font-semibold px-2 py-1 flex items-center gap-1 cursor-pointer"
            >
              <span>{showAuditorTable ? "Collapse" : "Expand"}</span>
              <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", showAuditorTable ? "rotate-180" : "")} />
            </button>
          </div>
        </div>

        {showAuditorTable && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-[11px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50/70 border-b border-slate-200">
                  <th className="px-5 py-3">QA Auditor Name</th>
                  <th className="px-5 py-3 text-center">Campaigns Audited</th>
                  <th className="px-5 py-3 text-center">Completed Checkpoints</th>
                  <th className="px-5 py-3 text-center">Pending Checkpoints</th>
                  <th className="px-5 py-3">Compliance Rate</th>
                </tr>
              </thead>
              <tbody className="text-xs divide-y divide-slate-100">
                {(Object.entries(reportStats.qaPersonMap) as [string, { count: number; completed: number; total: number }][]).map(([auditor, data]) => {
                  const pending = Math.max(0, data.total - data.completed);
                  const rate = data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0;
                  return (
                    <tr key={auditor} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-3.5 font-bold text-slate-800 flex items-center gap-2.5">
                        <div className="w-6 h-6 rounded-full bg-blue-100 text-[#2b61d6] flex items-center justify-center text-[10px] font-bold">
                          {auditor.slice(0, 2).toUpperCase()}
                        </div>
                        <span>{auditor}</span>
                      </td>
                      <td className="px-5 py-3.5 text-center font-semibold text-slate-700">{data.count}</td>
                      <td className="px-5 py-3.5 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {data.completed} / {data.total}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <span className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold",
                          pending > 0 ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-slate-100 text-slate-500"
                        )}>
                          {pending} Left
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2 max-w-xs">
                          <div className="flex-1 bg-slate-200 rounded-full h-2 overflow-hidden">
                            <div
                              className={cn(
                                "h-full transition-all duration-500",
                                rate === 100 ? "bg-emerald-500" : rate > 50 ? "bg-[#2b61d6]" : "bg-amber-500"
                              )}
                              style={{ width: `${rate}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-bold text-slate-700 w-10 text-right">{rate}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* FILTER & SEARCH BAR */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search report by campaign name, country, or QA auditor..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-xs bg-slate-50 border-slate-200"
          />
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {/* Status Filter */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg text-xs">
            <span className="text-[11px] font-bold text-slate-500 px-2">Status:</span>
            {["all", "Draft", "In QA Review", "QA Approved", "Live"].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={cn(
                  "px-2.5 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer",
                  statusFilter === st ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500 hover:text-slate-800"
                )}
              >
                {st === "all" ? "All Statuses" : st}
              </button>
            ))}
          </div>

          {/* QA Completion Filter */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg text-xs">
            <span className="text-[11px] font-bold text-slate-500 px-2">QA Progress:</span>
            {[
              { id: "all", label: "All" },
              { id: "completed", label: "100% Verified" },
              { id: "in_progress", label: "In Progress" },
              { id: "unstarted", label: "Unstarted" },
            ].map((pf) => (
              <button
                key={pf.id}
                type="button"
                onClick={() => setProgressFilter(pf.id)}
                className={cn(
                  "px-2.5 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer",
                  progressFilter === pf.id ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500 hover:text-slate-800"
                )}
              >
                {pf.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* DETAILED CAMPAIGN QA AUDIT TABLE */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#2b61d6]" />
            <h3 className="font-bold text-sm text-slate-800">
              Campaign Checkpoint Audit Breakdown ({filteredCampaigns.length})
            </h3>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-slate-400 hidden lg:inline mr-2">
              Click "View Audit Details" on any row for item-by-item breakdown
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleExportFilteredCSV}
              className="h-8 text-xs font-semibold gap-1.5 border-slate-200 hover:bg-slate-50 text-slate-700"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Export CSV</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isExportingPDF}
              onClick={handleExportPDF}
              className="h-8 text-xs font-semibold gap-1.5 border-slate-200 hover:bg-slate-50 text-slate-700"
            >
              {isExportingPDF ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-rose-600" />
              ) : (
                <FileText className="w-3.5 h-3.5 text-rose-600" />
              )}
              <span>Export PDF</span>
            </Button>
          </div>
        </div>

        {filteredCampaigns.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            No campaign QA records match the selected filter criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-[11px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50 border-b border-slate-200">
                  <th className="px-5 py-3">Campaign & Country</th>
                  <th className="px-5 py-3">QA Checkpoint Progress</th>
                  <th className="px-5 py-3">Checked / NA / Pending</th>
                  <th className="px-5 py-3">QA Auditor Person</th>
                  <th className="px-5 py-3">Last QA Activity</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="text-xs divide-y divide-slate-100">
                {filteredCampaigns.map((campaign) => {
                  const prog = getCampaignCheckpointProgress(campaign);
                  const qaPerson = resolveUserFullName(campaign.assignedQa || campaign.lastEditedBy || campaign.createdBy || campaign.userEmail, "Chaithanya");

                  return (
                    <tr key={campaign.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-900 text-sm">{campaign.name}</span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="font-semibold text-slate-600">{campaign.country}</span>
                            <span className="text-[10px] text-slate-400">({campaign.versionName || "Standard"})</span>
                            <span className="inline-flex items-center px-2 py-0.2 rounded text-[9px] font-extrabold uppercase bg-slate-100 text-slate-600 border border-slate-200">
                              {campaign.status}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <div className="w-48 space-y-1">
                          <div className="flex items-center justify-between text-xs font-bold">
                            <span className={prog.isFullyCompleted ? "text-emerald-700" : prog.completed > 0 ? "text-[#2b61d6]" : "text-slate-500"}>
                              {prog.completed}/{prog.total} Done
                            </span>
                            <span className="text-slate-500 text-[11px]">{prog.percent}%</span>
                          </div>
                          <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden flex">
                            <div
                              className={cn(
                                "h-full transition-all duration-500",
                                prog.isFullyCompleted ? "bg-emerald-500" : prog.completed > 0 ? "bg-[#2b61d6]" : "bg-slate-300"
                              )}
                              style={{ width: `${prog.percent}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-50 text-emerald-800 rounded border border-emerald-200 inline-flex items-center gap-1">
                            <CheckSquare className="w-3 h-3 text-emerald-600" /> {prog.checked} Checked
                          </span>
                          <span className="px-2 py-0.5 text-[10px] font-bold bg-slate-100 text-slate-600 rounded border border-slate-200">
                            {prog.na} N/A
                          </span>
                          {prog.pending > 0 && (
                            <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-50 text-amber-800 rounded border border-amber-200 inline-flex items-center gap-1">
                              <Clock className="w-3 h-3 text-amber-600" /> {prog.pending} Left
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-5 py-4 text-slate-700">
                        <div className="flex items-center gap-1.5 font-medium">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <span>{qaPerson}</span>
                        </div>
                      </td>

                      <td className="px-5 py-4 text-slate-500">
                        <span className="font-mono text-[11px]">{campaign.updated_at}</span>
                      </td>

                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            title="Export PDF Certificate"
                            onClick={() => handleExportCampaignChecklistPDF(campaign)}
                            className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                          >
                            <FileText className="w-4 h-4" />
                          </Button>

                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedCampaignForDetail(campaign)}
                            className="h-8 text-xs font-semibold text-[#2b61d6] border-blue-200 bg-blue-50/50 hover:bg-blue-100 text-right gap-1"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Audit Detail</span>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ITEM-BY-ITEM AUDIT DETAIL MODAL */}
      {selectedCampaignForDetail && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 my-8">
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <span className="text-[10px] font-bold text-[#2b61d6] uppercase tracking-wider block">
                  Detailed QA Inspection Checklist Report
                </span>
                <h3 className="text-xl font-black text-slate-900">
                  {selectedCampaignForDetail.name}
                </h3>
                <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                  <span>Country: <strong>{selectedCampaignForDetail.country}</strong></span>
                  <span>•</span>
                  <span>Auditor: <strong>{resolveUserFullName(selectedCampaignForDetail.assignedQa || selectedCampaignForDetail.lastEditedBy || selectedCampaignForDetail.createdBy || selectedCampaignForDetail.userEmail, "Chaithanya")}</strong></span>
                  <span>•</span>
                  <span>Status: <strong>{selectedCampaignForDetail.status}</strong></span>
                </div>

                {/* Modal Export Controls */}
                <div className="flex items-center gap-2 mt-3">
                  <Button
                    type="button"
                    size="sm"
                    disabled={isExportingModalPDF}
                    onClick={() => handleExportCampaignChecklistPDF(selectedCampaignForDetail)}
                    className="h-7 text-[11px] font-bold gap-1 bg-rose-600 hover:bg-rose-700 text-white shadow-xs"
                  >
                    {isExportingModalPDF ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <FileText className="w-3 h-3" />
                    )}
                    <span>Export Certificate (PDF)</span>
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleExportCampaignChecklistCSV(selectedCampaignForDetail)}
                    className="h-7 text-[11px] font-bold gap-1 border-slate-200 hover:bg-slate-50 text-slate-700"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Export Checklist (CSV)</span>
                  </Button>
                </div>
              </div>

              <button
                onClick={() => setSelectedCampaignForDetail(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Checklist items list */}
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
              {detailStageGroups.map(([stageNum, items]) => {
                const stageName = STAGE_TITLES[stageNum] || `Stage ${stageNum}: Quality Assurance Verification`;

                return (
                  <div key={stageNum} className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-2">
                    <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider text-[#2b61d6]">
                      {stageName}
                    </h4>
                    <div className="divide-y divide-slate-200/60 text-xs">
                      {items.map((entry) => {
                        let statusPill = (
                          <span className="px-2 py-0.5 text-[10px] font-bold bg-slate-200 text-slate-600 rounded">
                            Pending / Not Done
                          </span>
                        );

                        if (entry.status === 'Checked') {
                          statusPill = (
                            <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-800 rounded border border-emerald-200 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Passed / Verified
                            </span>
                          );
                        } else if (entry.status === 'N/A') {
                          statusPill = (
                            <span className="px-2 py-0.5 text-[10px] font-bold bg-slate-200 text-slate-700 rounded border border-slate-300">
                              N/A Marked
                            </span>
                          );
                        }

                        return (
                          <div key={entry.item.id} className="py-2.5 flex items-start justify-between gap-3">
                            <div className="space-y-0.5">
                              <span className="font-semibold text-slate-800 block">{entry.item.text}</span>
                              {entry.item.description && (
                                <p className="text-[11px] text-slate-500">{entry.item.description}</p>
                              )}
                              {entry.notes && (
                                <div className="text-[11px] font-mono bg-white p-1.5 rounded border border-slate-200 text-slate-800 mt-1">
                                  QA Note: {entry.notes}
                                </div>
                              )}
                            </div>
                            <div className="shrink-0">{statusPill}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isExportingModalPDF}
                  onClick={() => handleExportCampaignChecklistPDF(selectedCampaignForDetail)}
                  className="text-xs font-bold gap-1.5 border-slate-200 text-slate-700 hover:bg-slate-50"
                >
                  <FileText className="w-3.5 h-3.5 text-rose-600" />
                  <span>Download PDF Certificate</span>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleExportCampaignChecklistCSV(selectedCampaignForDetail)}
                  className="text-xs font-bold gap-1.5 border-slate-200 text-slate-700 hover:bg-slate-50"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Download CSV</span>
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const id = selectedCampaignForDetail.id;
                    setSelectedCampaignForDetail(null);
                    navigate(`/campaigns/new?id=${id}`);
                  }}
                  className="text-xs font-bold text-[#2b61d6] border-blue-200 bg-blue-50/50"
                >
                  Open Full QA Workspace
                </Button>

                <Button
                  type="button"
                  onClick={() => setSelectedCampaignForDetail(null)}
                  className="text-xs font-bold bg-slate-900 text-white hover:bg-slate-800"
                >
                  Close Report Detail
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Status Toast */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "fixed bottom-6 right-6 z-[100] p-4 rounded-xl shadow-2xl border max-w-sm w-full transition-all animate-in slide-in-from-bottom-5 duration-300 bg-white border-slate-200 border-l-4",
            toastMessage.type === "success" && "border-l-emerald-500 shadow-emerald-950/10",
            toastMessage.type === "error" && "border-l-rose-500 shadow-rose-950/10",
            toastMessage.type === "info" && "border-l-blue-500 shadow-blue-950/10"
          )}
        >
          <div className="flex items-start gap-3">
            {toastMessage.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            ) : toastMessage.type === "error" ? (
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            ) : (
              <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 text-xs">
              <div className="font-bold text-slate-900 text-[13px]">{toastMessage.title}</div>
              <div className="text-slate-600 mt-1 leading-relaxed">{toastMessage.message}</div>
            </div>
            <button
              onClick={() => setToastMessage(null)}
              className="text-slate-400 hover:text-slate-600 text-xs font-bold p-1 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

