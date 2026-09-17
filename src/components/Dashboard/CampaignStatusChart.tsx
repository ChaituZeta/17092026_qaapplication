import React, { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from "recharts";
import {
  Calendar,
  BarChart3,
  TrendingUp,
  Layers,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  Filter,
  Info
} from "lucide-react";
import { CampaignRecord } from "@/lib/campaign-storage";
import { cn } from "@/lib/utils";

export type NormalizedStatus = "In Progress" | "Approved" | "Pending Callouts" | "Failed";

export function normalizeCampaignStatus(rawStatus?: string): NormalizedStatus {
  if (!rawStatus) return "In Progress";
  const s = rawStatus.toLowerCase().trim();
  if (s.includes("approved") || s === "completed") return "Approved";
  if (s.includes("callout") || s.includes("pending") || s.includes("review")) return "Pending Callouts";
  if (s.includes("fail")) return "Failed";
  return "In Progress";
}

interface CampaignStatusChartProps {
  campaigns: CampaignRecord[];
  selectedCountry?: string;
  selectedUser?: string;
}

const STATUS_CONFIG: Record<
  NormalizedStatus,
  {
    label: string;
    color: string;
    gradientStart: string;
    gradientEnd: string;
    badgeBg: string;
    icon: React.ElementType;
  }
> = {
  Approved: {
    label: "Approved",
    color: "#10b981", // Emerald 500
    gradientStart: "#10b981",
    gradientEnd: "#059669",
    badgeBg: "bg-emerald-50 text-emerald-700 border-emerald-200",
    icon: CheckCircle2,
  },
  "In Progress": {
    label: "In Progress",
    color: "#3b82f6", // Blue 500
    gradientStart: "#3b82f6",
    gradientEnd: "#1d4ed8",
    badgeBg: "bg-blue-50 text-blue-700 border-blue-200",
    icon: Layers,
  },
  "Pending Callouts": {
    label: "Pending Callouts",
    color: "#f59e0b", // Amber 500
    gradientStart: "#f59e0b",
    gradientEnd: "#d97706",
    badgeBg: "bg-amber-50 text-amber-700 border-amber-200",
    icon: Clock,
  },
  Failed: {
    label: "Failed",
    color: "#ef4444", // Rose 500
    gradientStart: "#ef4444",
    gradientEnd: "#dc2626",
    badgeBg: "bg-rose-50 text-rose-700 border-rose-200",
    icon: XCircle,
  },
};

export function CampaignStatusChart({
  campaigns,
  selectedCountry = "all",
  selectedUser = "all",
}: CampaignStatusChartProps) {
  const [chartType, setChartType] = useState<"stacked" | "grouped" | "area">("stacked");
  const [daysRange, setDaysRange] = useState<30 | 14 | 7>(30);
  const [visibleStatuses, setVisibleStatuses] = useState<Record<NormalizedStatus, boolean>>({
    Approved: true,
    "In Progress": true,
    "Pending Callouts": true,
    Failed: true,
  });

  // Toggle status visibility in chart
  const toggleStatus = (status: NormalizedStatus) => {
    setVisibleStatuses((prev) => {
      // Ensure at least one status remains visible
      const activeCount = Object.values(prev).filter(Boolean).length;
      if (activeCount === 1 && prev[status]) {
        return prev;
      }
      return { ...prev, [status]: !prev[status] };
    });
  };

  // Filter campaigns based on dashboard country/user if active
  const filteredCampaigns = useMemo(() => {
    return campaigns.filter((c) => {
      if (c.is_deleted) return false;
      if (selectedCountry !== "all" && (c.country || "").toUpperCase() !== selectedCountry.toUpperCase()) {
        return false;
      }
      if (selectedUser !== "all") {
        const creator = (c.createdBy || "").toLowerCase();
        const userEmail = (c.userEmail || "").toLowerCase();
        const target = selectedUser.toLowerCase();
        if (creator !== target && userEmail !== target) {
          return false;
        }
      }
      return true;
    });
  }, [campaigns, selectedCountry, selectedUser]);

  // Generate date points for the selected range (default 30 days)
  const chartData = useMemo(() => {
    const now = new Date();
    const result: Array<{
      dateStr: string;
      displayDate: string;
      fullDate: string;
      Approved: number;
      "In Progress": number;
      "Pending Callouts": number;
      Failed: number;
      total: number;
    }> = [];

    // Pre-calculate date string for each campaign to optimize lookup
    const campByDate: Record<string, NormalizedStatus[]> = {};
    filteredCampaigns.forEach((c) => {
      const dateVal = c.updated_at || c.created_at;
      if (!dateVal) return;
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return;
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const key = `${year}-${month}-${day}`;

      const status = normalizeCampaignStatus(c.status);
      if (!campByDate[key]) {
        campByDate[key] = [];
      }
      campByDate[key].push(status);
    });

    for (let i = daysRange - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const dateStr = `${year}-${month}-${day}`;

      const displayDate = d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });

      const fullDate = d.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });

      const dayStatuses = campByDate[dateStr] || [];
      const approvedCount = dayStatuses.filter((s) => s === "Approved").length;
      const inProgressCount = dayStatuses.filter((s) => s === "In Progress").length;
      const pendingCalloutsCount = dayStatuses.filter((s) => s === "Pending Callouts").length;
      const failedCount = dayStatuses.filter((s) => s === "Failed").length;

      result.push({
        dateStr,
        displayDate,
        fullDate,
        Approved: approvedCount,
        "In Progress": inProgressCount,
        "Pending Callouts": pendingCalloutsCount,
        Failed: failedCount,
        total: approvedCount + inProgressCount + pendingCalloutsCount + failedCount,
      });
    }

    return result;
  }, [filteredCampaigns, daysRange]);

  // Aggregate 30-day summary metrics
  const summaryMetrics = useMemo(() => {
    let totalApproved = 0;
    let totalInProgress = 0;
    let totalPendingCallouts = 0;
    let totalFailed = 0;

    chartData.forEach((d) => {
      totalApproved += d.Approved;
      totalInProgress += d["In Progress"];
      totalPendingCallouts += d["Pending Callouts"];
      totalFailed += d.Failed;
    });

    const grandTotal = totalApproved + totalInProgress + totalPendingCallouts + totalFailed;
    const approvalRate = grandTotal > 0 ? Math.round((totalApproved / grandTotal) * 100) : 0;

    // Find peak activity day
    let peakDay = chartData[0];
    chartData.forEach((d) => {
      if (d.total > (peakDay?.total || 0)) {
        peakDay = d;
      }
    });

    return {
      grandTotal,
      totalApproved,
      totalInProgress,
      totalPendingCallouts,
      totalFailed,
      approvalRate,
      peakDay,
    };
  }, [chartData]);

  // Custom polished Tooltip component
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || payload.length === 0) return null;

    const dataPoint = payload[0]?.payload;
    const fullDate = dataPoint?.fullDate || label;
    const totalOnDay = dataPoint?.total || 0;

    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3.5 min-w-[200px] text-xs font-sans">
        <div className="border-b border-slate-100 pb-2 mb-2">
          <p className="font-bold text-slate-800 text-xs">{fullDate}</p>
          <div className="flex items-center justify-between mt-1 text-[11px] text-slate-500">
            <span>Daily Volume</span>
            <span className="font-extrabold text-slate-900 bg-slate-100 px-1.5 py-0.2 rounded">
              {totalOnDay} {totalOnDay === 1 ? "campaign" : "campaigns"}
            </span>
          </div>
        </div>

        <div className="space-y-1.5">
          {payload.map((entry: any) => {
            const statusKey = entry.name as NormalizedStatus;
            const config = STATUS_CONFIG[statusKey];
            const value = entry.value || 0;
            const pct = totalOnDay > 0 ? Math.round((value / totalOnDay) * 100) : 0;

            return (
              <div key={statusKey} className="flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: config?.color || entry.color }}
                  />
                  <span className="text-slate-700 font-medium">{entry.name}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-slate-900">{value}</span>
                  {totalOnDay > 0 && (
                    <span className="text-[10px] text-slate-400">({pct}%)</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div
      id="card-campaign-status-chart"
      className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-2xs space-y-5"
    >
      {/* Header: Title, Controls, Range Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 text-[#2b61d6] flex items-center justify-center shrink-0 shadow-2xs">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                Campaign Status Activity
              </h3>
              <span className="text-[11px] font-semibold bg-indigo-50 text-[#2b61d6] border border-indigo-100 px-2 py-0.5 rounded-full">
                Last {daysRange} Days
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Daily distribution of In Progress, Approved, Pending Callouts & Failed campaigns
            </p>
          </div>
        </div>

        {/* Controls: Chart Type + Range Selector */}
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {/* Days Range buttons */}
          <div className="inline-flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200/80">
            {([7, 14, 30] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setDaysRange(r)}
                className={cn(
                  "px-2.5 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer",
                  daysRange === r
                    ? "bg-white text-slate-900 shadow-2xs font-bold"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                {r}D
              </button>
            ))}
          </div>

          {/* Chart View Mode buttons */}
          <div className="inline-flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200/80">
            <button
              type="button"
              onClick={() => setChartType("stacked")}
              className={cn(
                "px-2.5 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer flex items-center gap-1.5",
                chartType === "stacked"
                  ? "bg-white text-[#2b61d6] shadow-2xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
              )}
              title="Stacked Bar Chart"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Stacked</span>
            </button>
            <button
              type="button"
              onClick={() => setChartType("grouped")}
              className={cn(
                "px-2.5 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer flex items-center gap-1.5",
                chartType === "grouped"
                  ? "bg-white text-[#2b61d6] shadow-2xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
              )}
              title="Grouped Bar Chart"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Grouped</span>
            </button>
            <button
              type="button"
              onClick={() => setChartType("area")}
              className={cn(
                "px-2.5 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer flex items-center gap-1.5",
                chartType === "area"
                  ? "bg-white text-[#2b61d6] shadow-2xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
              )}
              title="Area Trend Chart"
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Area</span>
            </button>
          </div>
        </div>
      </div>

      {/* Metric Summary Ribbon with Interactive Toggles */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {/* Total Campaigns in 30D */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-semibold">Activity in {daysRange}D</span>
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xl font-extrabold text-slate-900">
              {summaryMetrics.grandTotal}
            </span>
            <span className="text-[10px] text-slate-500">
              {summaryMetrics.approvalRate}% approved
            </span>
          </div>
        </div>

        {/* Approved Metric Card */}
        <button
          type="button"
          onClick={() => toggleStatus("Approved")}
          className={cn(
            "p-3 rounded-xl border text-left transition-all cursor-pointer space-y-1 group",
            visibleStatuses["Approved"]
              ? "bg-emerald-50/60 border-emerald-200 hover:bg-emerald-50"
              : "bg-slate-50/50 border-slate-200 opacity-50 hover:opacity-75"
          )}
          title="Click to toggle Approved on chart"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-800 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              Approved
            </span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xl font-extrabold text-emerald-900">
              {summaryMetrics.totalApproved}
            </span>
            {summaryMetrics.grandTotal > 0 && (
              <span className="text-[10px] font-medium text-emerald-700">
                {Math.round((summaryMetrics.totalApproved / summaryMetrics.grandTotal) * 100)}%
              </span>
            )}
          </div>
        </button>

        {/* In Progress Metric Card */}
        <button
          type="button"
          onClick={() => toggleStatus("In Progress")}
          className={cn(
            "p-3 rounded-xl border text-left transition-all cursor-pointer space-y-1 group",
            visibleStatuses["In Progress"]
              ? "bg-blue-50/60 border-blue-200 hover:bg-blue-50"
              : "bg-slate-50/50 border-slate-200 opacity-50 hover:opacity-75"
          )}
          title="Click to toggle In Progress on chart"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-blue-800 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              In Progress
            </span>
            <Layers className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xl font-extrabold text-blue-900">
              {summaryMetrics.totalInProgress}
            </span>
            {summaryMetrics.grandTotal > 0 && (
              <span className="text-[10px] font-medium text-blue-700">
                {Math.round((summaryMetrics.totalInProgress / summaryMetrics.grandTotal) * 100)}%
              </span>
            )}
          </div>
        </button>

        {/* Pending Callouts Metric Card */}
        <button
          type="button"
          onClick={() => toggleStatus("Pending Callouts")}
          className={cn(
            "p-3 rounded-xl border text-left transition-all cursor-pointer space-y-1 group",
            visibleStatuses["Pending Callouts"]
              ? "bg-amber-50/60 border-amber-200 hover:bg-amber-50"
              : "bg-slate-50/50 border-slate-200 opacity-50 hover:opacity-75"
          )}
          title="Click to toggle Pending Callouts on chart"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-amber-800 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              Pending Callouts
            </span>
            <Clock className="w-3.5 h-3.5 text-amber-600" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xl font-extrabold text-amber-900">
              {summaryMetrics.totalPendingCallouts}
            </span>
            {summaryMetrics.grandTotal > 0 && (
              <span className="text-[10px] font-medium text-amber-700">
                {Math.round((summaryMetrics.totalPendingCallouts / summaryMetrics.grandTotal) * 100)}%
              </span>
            )}
          </div>
        </button>

        {/* Failed Metric Card */}
        <button
          type="button"
          onClick={() => toggleStatus("Failed")}
          className={cn(
            "p-3 rounded-xl border text-left transition-all cursor-pointer space-y-1 group col-span-2 sm:col-span-1",
            visibleStatuses["Failed"]
              ? "bg-rose-50/60 border-rose-200 hover:bg-rose-50"
              : "bg-slate-50/50 border-slate-200 opacity-50 hover:opacity-75"
          )}
          title="Click to toggle Failed on chart"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-rose-800 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-500"></span>
              Failed
            </span>
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xl font-extrabold text-rose-900">
              {summaryMetrics.totalFailed}
            </span>
            {summaryMetrics.grandTotal > 0 && (
              <span className="text-[10px] font-medium text-rose-700">
                {Math.round((summaryMetrics.totalFailed / summaryMetrics.grandTotal) * 100)}%
              </span>
            )}
          </div>
        </button>
      </div>

      {/* Main Recharts Container */}
      <div className="w-full h-[300px] sm:h-[340px] pt-2">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === "area" ? (
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gradApproved" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="gradInProgress" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="gradPendingCallouts" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="gradFailed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0.0} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey="displayDate"
                stroke="#94a3b8"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: "#e2e8f0" }}
                interval={daysRange === 30 ? 3 : daysRange === 14 ? 1 : 0}
              />
              <YAxis
                stroke="#94a3b8"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: "#e2e8f0" }}
                allowDecimals={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                verticalAlign="top"
                align="right"
                iconType="circle"
                wrapperStyle={{ paddingBottom: 12, fontSize: 11 }}
              />

              {visibleStatuses["Approved"] && (
                <Area
                  type="monotone"
                  dataKey="Approved"
                  stroke="#10b981"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#gradApproved)"
                />
              )}
              {visibleStatuses["In Progress"] && (
                <Area
                  type="monotone"
                  dataKey="In Progress"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#gradInProgress)"
                />
              )}
              {visibleStatuses["Pending Callouts"] && (
                <Area
                  type="monotone"
                  dataKey="Pending Callouts"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#gradPendingCallouts)"
                />
              )}
              {visibleStatuses["Failed"] && (
                <Area
                  type="monotone"
                  dataKey="Failed"
                  stroke="#ef4444"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#gradFailed)"
                />
              )}
            </AreaChart>
          ) : (
            <BarChart
              data={chartData}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey="displayDate"
                stroke="#94a3b8"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: "#e2e8f0" }}
                interval={daysRange === 30 ? 3 : daysRange === 14 ? 1 : 0}
              />
              <YAxis
                stroke="#94a3b8"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: "#e2e8f0" }}
                allowDecimals={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                verticalAlign="top"
                align="right"
                iconType="circle"
                wrapperStyle={{ paddingBottom: 12, fontSize: 11 }}
              />

              {visibleStatuses["Approved"] && (
                <Bar
                  dataKey="Approved"
                  stackId={chartType === "stacked" ? "a" : undefined}
                  fill="#10b981"
                  radius={chartType === "grouped" ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                  maxBarSize={32}
                />
              )}
              {visibleStatuses["In Progress"] && (
                <Bar
                  dataKey="In Progress"
                  stackId={chartType === "stacked" ? "a" : undefined}
                  fill="#3b82f6"
                  radius={chartType === "grouped" ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                  maxBarSize={32}
                />
              )}
              {visibleStatuses["Pending Callouts"] && (
                <Bar
                  dataKey="Pending Callouts"
                  stackId={chartType === "stacked" ? "a" : undefined}
                  fill="#f59e0b"
                  radius={chartType === "grouped" ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                  maxBarSize={32}
                />
              )}
              {visibleStatuses["Failed"] && (
                <Bar
                  dataKey="Failed"
                  stackId={chartType === "stacked" ? "a" : undefined}
                  fill="#ef4444"
                  radius={chartType === "grouped" ? [4, 4, 0, 0] : [3, 3, 0, 0]}
                  maxBarSize={32}
                />
              )}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Footer Info / Helper Notes */}
      <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-slate-500">
        <div className="flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span>
            Click any status card above to toggle visibility. Hover over data bars for date-by-date details.
          </span>
        </div>
        {summaryMetrics.peakDay && summaryMetrics.peakDay.total > 0 && (
          <div className="text-[11px] font-medium text-slate-600">
            Peak Activity:{" "}
            <span className="font-bold text-slate-900">
              {summaryMetrics.peakDay.displayDate}
            </span>{" "}
            ({summaryMetrics.peakDay.total} campaigns)
          </div>
        )}
      </div>
    </div>
  );
}
