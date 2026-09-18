import React, { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell
} from "recharts";
import {
  LayoutDashboard,
  Clock,
  CheckCircle2,
  Users,
  Activity,
  AlertCircle,
  TrendingUp,
  Layers,
  ChevronRight,
  ListTodo,
  ShieldCheck,
  Zap,
  Filter
} from "lucide-react";
import { CampaignRecord } from "@/lib/campaign-storage";
import { getCampaignCheckpointProgress } from "@/lib/checklist-utils";
import { resolveUserFullName } from "@/lib/userNames";
import { cn } from "@/lib/utils";

interface SummaryDashboardWidgetProps {
  campaigns: CampaignRecord[];
  userStatsList?: Array<{
    key: string;
    name: string;
    email: string;
    role: string;
    total: number;
    completed: number;
    inProgress: number;
    pending: number;
    failed: number;
    percent: number;
  }>;
  onNavigateToCampaigns?: () => void;
  onNavigateToUsers?: () => void;
  onNavigateToChecklists?: () => void;
}

export function SummaryDashboardWidget({
  campaigns,
  userStatsList = [],
  onNavigateToCampaigns,
  onNavigateToUsers,
  onNavigateToChecklists,
}: SummaryDashboardWidgetProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "active" | "tasks" | "team">("overview");

  // 1. Active Campaigns Metrics
  const activeMetrics = useMemo(() => {
    const activeList = campaigns.filter(
      (c) =>
        !c.is_deleted &&
        c.status !== "Completed" &&
        c.status !== "Approved" &&
        c.status !== "Failed"
    );

    const countryCounts: Record<string, number> = {};
    const statusCounts: Record<string, number> = {
      "In Progress": 0,
      "QA Pending": 0,
      "Draft": 0,
    };

    activeList.forEach((c) => {
      const country = (c.country || "IN").toUpperCase();
      countryCounts[country] = (countryCounts[country] || 0) + 1;

      if (c.status === "QA Pending" || c.status === "Review Pending" || c.status === "Pending") {
        statusCounts["QA Pending"] += 1;
      } else if (c.status === "Draft") {
        statusCounts["Draft"] += 1;
      } else {
        statusCounts["In Progress"] += 1;
      }
    });

    const countryChartData = Object.entries(countryCounts)
      .map(([country, count]) => ({
        country,
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    // If country data is small, provide default entries for regional distribution
    if (countryChartData.length === 0) {
      ["IN", "AU", "NZ", "SG", "MY"].forEach((c) => {
        countryChartData.push({ country: c, count: 0 });
      });
    }

    const totalActive = activeList.length;
    const totalAll = campaigns.filter((c) => !c.is_deleted).length;
    const activeRate = totalAll > 0 ? Math.round((totalActive / totalAll) * 100) : 0;

    return {
      activeList,
      totalActive,
      totalAll,
      activeRate,
      statusCounts,
      countryChartData,
    };
  }, [campaigns]);

  // 2. Pending Tasks Metrics (Checkpoints across active campaigns)
  const taskMetrics = useMemo(() => {
    let totalPendingTasks = 0;
    let totalCheckedTasks = 0;
    let totalAllTasks = 0;

    // Categorized by QA stage
    const stageCounts: Record<string, { name: string; pending: number; checked: number }> = {
      "1": { name: "Setup & Schedule", pending: 0, checked: 0 },
      "2": { name: "Platform & Litmus", pending: 0, checked: 0 },
      "3": { name: "Visual & Assets", pending: 0, checked: 0 },
      "4": { name: "Links & UTM", pending: 0, checked: 0 },
      "5": { name: "Content & Copy", pending: 0, checked: 0 },
      "6": { name: "Deployment", pending: 0, checked: 0 },
    };

    const campaignTaskBreakdown: Array<{ name: string; country: string; pending: number; completed: number }> = [];

    const activeList = campaigns.filter((c) => !c.is_deleted && c.status !== "Approved" && c.status !== "Completed");

    activeList.forEach((c) => {
      const progress = getCampaignCheckpointProgress(c);
      totalPendingTasks += progress.pending;
      totalCheckedTasks += progress.checked;
      totalAllTasks += progress.total;

      if (progress.pending > 0) {
        campaignTaskBreakdown.push({
          name: (c.name || "Untitled").slice(0, 18),
          country: (c.country || "IN").toUpperCase(),
          pending: progress.pending,
          completed: progress.checked,
        });
      }

      // Aggregate by stage
      progress.items.forEach(({ item, status }) => {
        const stageKey = String(item.stage || 4);
        if (stageCounts[stageKey]) {
          if (status === "Pending") {
            stageCounts[stageKey].pending += 1;
          } else if (status === "Checked") {
            stageCounts[stageKey].checked += 1;
          }
        }
      });
    });

    const stageChartData = Object.values(stageCounts).map((s) => ({
      category: s.name,
      pending: s.pending,
      checked: s.checked,
    }));

    const avgPendingPerActive = activeList.length > 0 ? (totalPendingTasks / activeList.length).toFixed(1) : "0";

    return {
      totalPendingTasks,
      totalCheckedTasks,
      totalAllTasks,
      avgPendingPerActive,
      stageChartData,
      campaignTaskBreakdown: campaignTaskBreakdown.sort((a, b) => b.pending - a.pending).slice(0, 5),
    };
  }, [campaigns]);

  // 3. Team Performance Metrics
  const teamMetrics = useMemo(() => {
    const list = userStatsList.slice(0, 6).map((u) => {
      const completed = u.completed || 0;
      const totalUser = u.total || 0;
      const active = (u.inProgress || 0) + (u.pending || 0);
      const rate = totalUser > 0 ? Math.round((completed / totalUser) * 100) : 0;

      return {
        name: resolveUserFullName(u.name || u.email, "Reviewer").split(" ")[0],
        fullName: resolveUserFullName(u.name || u.email, "Reviewer"),
        completed,
        active,
        total: totalUser,
        rate,
      };
    });

    const totalCompleted = list.reduce((acc, curr) => acc + curr.completed, 0);
    const totalAudits = list.reduce((acc, curr) => acc + curr.total, 0);
    const avgTeamRate = totalAudits > 0 ? Math.round((totalCompleted / totalAudits) * 100) : 0;
    const topPerformer = list.length > 0 ? list[0] : null;

    return {
      teamData: list,
      activeReviewersCount: list.filter((u) => u.total > 0).length,
      avgTeamRate,
      topPerformer,
    };
  }, [userStatsList]);

  return (
    <div
      id="summary-dashboard-widget"
      className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-2xs space-y-5"
    >
      {/* Widget Header & Navigation Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-[#2b61d6] shadow-2xs shrink-0">
            <LayoutDashboard className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 tracking-tight">Summary Dashboard</h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-[#2b61d6] border border-blue-200">
                Live Recharts Analytics
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Instant snapshots of Active Campaigns, Pending QA Tasks, and Team Performance
            </p>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center p-1 bg-slate-100/90 rounded-xl self-start sm:self-auto border border-slate-200/60">
          <button
            type="button"
            id="summary-tab-overview"
            onClick={() => setActiveTab("overview")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
              activeTab === "overview"
                ? "bg-white text-slate-900 shadow-2xs border border-slate-200/60"
                : "text-slate-500 hover:text-slate-900"
            )}
          >
            Overview
          </button>
          <button
            type="button"
            id="summary-tab-active"
            onClick={() => setActiveTab("active")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
              activeTab === "active"
                ? "bg-white text-[#2b61d6] shadow-2xs border border-blue-200/60"
                : "text-slate-500 hover:text-slate-900"
            )}
          >
            Active Campaigns
          </button>
          <button
            type="button"
            id="summary-tab-tasks"
            onClick={() => setActiveTab("tasks")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
              activeTab === "tasks"
                ? "bg-white text-amber-700 shadow-2xs border border-amber-200/60"
                : "text-slate-500 hover:text-slate-900"
            )}
          >
            Pending Tasks
          </button>
          <button
            type="button"
            id="summary-tab-team"
            onClick={() => setActiveTab("team")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
              activeTab === "team"
                ? "bg-white text-purple-700 shadow-2xs border border-purple-200/60"
                : "text-slate-500 hover:text-slate-900"
            )}
          >
            Team Performance
          </button>
        </div>
      </div>

      {/* Top Quick Key Indicators Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Metric 1: Active Campaigns */}
        <div
          id="summary-metric-active-campaigns"
          onClick={() => setActiveTab("active")}
          className={cn(
            "p-4 rounded-xl border transition-all cursor-pointer group",
            activeTab === "active"
              ? "bg-blue-50/70 border-[#2b61d6] ring-1 ring-blue-500/20 shadow-2xs"
              : "bg-slate-50/70 hover:bg-blue-50/30 border-slate-200/80 hover:border-blue-200"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Active Campaigns</span>
            <div className="w-7 h-7 rounded-lg bg-blue-100/80 text-[#2b61d6] flex items-center justify-center">
              <Activity className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-slate-900 tracking-tight">
              {activeMetrics.totalActive}
            </span>
            <span className="text-xs font-bold text-blue-600">
              {activeMetrics.activeRate}% of volume
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 animate-pulse" />
            <span>{activeMetrics.statusCounts["In Progress"]} in progress • {activeMetrics.statusCounts["QA Pending"]} pending review</span>
          </p>
        </div>

        {/* Metric 2: Pending Checkpoint Tasks */}
        <div
          id="summary-metric-pending-tasks"
          onClick={() => setActiveTab("tasks")}
          className={cn(
            "p-4 rounded-xl border transition-all cursor-pointer group",
            activeTab === "tasks"
              ? "bg-amber-50/70 border-amber-500 ring-1 ring-amber-500/20 shadow-2xs"
              : "bg-slate-50/70 hover:bg-amber-50/30 border-slate-200/80 hover:border-amber-200"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Pending QA Tasks</span>
            <div className="w-7 h-7 rounded-lg bg-amber-100/80 text-amber-700 flex items-center justify-center">
              <ListTodo className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-slate-900 tracking-tight">
              {taskMetrics.totalPendingTasks}
            </span>
            <span className="text-xs font-bold text-amber-600">
              ~{taskMetrics.avgPendingPerActive} / campaign
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
            <span>{taskMetrics.totalCheckedTasks} tasks verified • {taskMetrics.totalAllTasks} total criteria</span>
          </p>
        </div>

        {/* Metric 3: Team Performance Snapshot */}
        <div
          id="summary-metric-team-performance"
          onClick={() => setActiveTab("team")}
          className={cn(
            "p-4 rounded-xl border transition-all cursor-pointer group",
            activeTab === "team"
              ? "bg-purple-50/70 border-purple-500 ring-1 ring-purple-500/20 shadow-2xs"
              : "bg-slate-50/70 hover:bg-purple-50/30 border-slate-200/80 hover:border-purple-200"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Team QA Rate</span>
            <div className="w-7 h-7 rounded-lg bg-purple-100/80 text-purple-700 flex items-center justify-center">
              <Users className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-slate-900 tracking-tight">
              {teamMetrics.avgTeamRate}%
            </span>
            <span className="text-xs font-bold text-purple-700">
              {teamMetrics.activeReviewersCount} Auditors Active
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" />
            <span>Top reviewer: {teamMetrics.topPerformer?.fullName || "Chaithanya"}</span>
          </p>
        </div>
      </div>

      {/* Dynamic Content Views */}
      {/* 1. OVERVIEW: 3-COLUMN EXECUTIVE SNAPSHOT BENTO */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 pt-2">
          {/* Card 1: Active Campaigns Regional Chart */}
          <div className="border border-slate-200/80 rounded-xl p-4 bg-slate-50/40 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Active By Market
                  </h3>
                </div>
                <span className="text-[11px] font-semibold text-[#2b61d6]">
                  {activeMetrics.totalActive} Active
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mb-3">
                Distribution of in-flight QA audits across regional markets
              </p>

              {/* Mini Area/Bar Chart */}
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={activeMetrics.countryChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="country" stroke="#64748b" fontSize={10} tickLine={false} />
                    <YAxis stroke="#64748b" fontSize={10} tickLine={false} allowDecimals={false} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="bg-white p-2 border border-slate-200 rounded-lg shadow-xs text-xs">
                              <span className="font-bold text-slate-800">{payload[0].payload.country}</span>:{" "}
                              <span className="text-[#2b61d6] font-extrabold">{payload[0].value} Active</span>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200/60 mt-2 flex items-center justify-between text-xs">
              <span className="text-slate-500 text-[11px]">Primary market: {activeMetrics.countryChartData[0]?.country || "IN"}</span>
              <button
                type="button"
                onClick={() => setActiveTab("active")}
                className="text-[#2b61d6] hover:underline font-semibold text-[11px] flex items-center gap-1 cursor-pointer"
              >
                Deep-dive <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Card 2: Pending Tasks QA Stages Chart */}
          <div className="border border-slate-200/80 rounded-xl p-4 bg-slate-50/40 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Pending Tasks by Stage
                  </h3>
                </div>
                <span className="text-[11px] font-semibold text-amber-700">
                  {taskMetrics.totalPendingTasks} Total
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mb-3">
                Outstanding checkpoint verifications required for approval
              </p>

              {/* Horizontal Bar Chart for stages */}
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={taskMetrics.stageChartData.slice(0, 4)}
                    margin={{ top: 5, right: 15, left: 15, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                    <XAxis type="number" stroke="#64748b" fontSize={10} tickLine={false} allowDecimals={false} />
                    <YAxis
                      type="category"
                      dataKey="category"
                      stroke="#64748b"
                      fontSize={10}
                      tickLine={false}
                      width={80}
                      tickFormatter={(val) => val.split(" ")[0]}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-white p-2 border border-slate-200 rounded-lg shadow-xs text-xs">
                              <p className="font-bold text-slate-800">{data.category}</p>
                              <p className="text-amber-600 font-bold">{data.pending} Pending Checkpoints</p>
                              <p className="text-emerald-600 font-medium text-[10px]">{data.checked} Verified</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="pending" fill="#f59e0b" radius={[0, 4, 4, 0]} maxBarSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200/60 mt-2 flex items-center justify-between text-xs">
              <span className="text-slate-500 text-[11px]">Key focus: Links & Copy checks</span>
              <button
                type="button"
                onClick={() => setActiveTab("tasks")}
                className="text-amber-700 hover:underline font-semibold text-[11px] flex items-center gap-1 cursor-pointer"
              >
                Inspect tasks <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Card 3: Team Performance Auditor Velocity */}
          <div className="border border-slate-200/80 rounded-xl p-4 bg-slate-50/40 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Auditor Throughput
                  </h3>
                </div>
                <span className="text-[11px] font-semibold text-purple-700">
                  {teamMetrics.avgTeamRate}% Success
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mb-3">
                Completed vs active campaigns across team members
              </p>

              {/* Grouped Bar Chart for Team */}
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={teamMetrics.teamData.slice(0, 4)} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} />
                    <YAxis stroke="#64748b" fontSize={10} tickLine={false} allowDecimals={false} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-white p-2.5 border border-slate-200 rounded-lg shadow-xs text-xs space-y-1">
                              <p className="font-bold text-slate-900">{data.fullName}</p>
                              <p className="text-emerald-600 font-bold">{data.completed} Completed Audits</p>
                              <p className="text-blue-600 font-medium">{data.active} Active Reviews</p>
                              <p className="text-slate-500 text-[10px]">Completion Rate: {data.rate}%</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="completed" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={16} name="Completed" />
                    <Bar dataKey="active" fill="#8b5cf6" radius={[4, 4, 0, 0]} maxBarSize={16} name="Active" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200/60 mt-2 flex items-center justify-between text-xs">
              <span className="text-slate-500 text-[11px]">Auditors active: {teamMetrics.activeReviewersCount}</span>
              <button
                type="button"
                onClick={() => setActiveTab("team")}
                className="text-purple-700 hover:underline font-semibold text-[11px] flex items-center gap-1 cursor-pointer"
              >
                Team metrics <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. ACTIVE CAMPAIGNS DEEP DIVE */}
      {activeTab === "active" && (
        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 border border-slate-200/80 rounded-xl p-4 bg-slate-50/30">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-slate-900">Active Campaign Regional Distribution</h3>
                <span className="text-xs font-semibold text-[#2b61d6]">
                  {activeMetrics.totalActive} Active of {activeMetrics.totalAll} Total
                </span>
              </div>
              <p className="text-xs text-slate-500 mb-4">
                Shows volume of unapproved/active QA campaigns by destination country.
              </p>
              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={activeMetrics.countryChartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="activeGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="country" stroke="#64748b" fontSize={11} tickLine={false} />
                    <YAxis stroke="#64748b" fontSize={11} tickLine={false} allowDecimals={false} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="bg-white p-2.5 border border-slate-200 rounded-xl shadow-xs text-xs">
                              <span className="font-bold text-slate-800">{payload[0].payload.country}</span>:{" "}
                              <span className="text-blue-600 font-extrabold">{payload[0].value} Active Campaigns</span>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="#2563eb"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#activeGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Side summary list of active audits */}
            <div className="border border-slate-200/80 rounded-xl p-4 bg-white flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-1">In-Flight Queue</h3>
                <p className="text-xs text-slate-500 mb-3">Top priority campaigns currently being audited</p>
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {activeMetrics.activeList.slice(0, 4).map((c) => (
                    <div key={c.id} className="p-2 rounded-lg border border-slate-100 bg-slate-50/60 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800 truncate max-w-[150px]">
                          {c.name || "Untitled Campaign"}
                        </span>
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-blue-100 text-blue-800">
                          {c.country?.toUpperCase() || "IN"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1">
                        <span>{c.status || "In Progress"}</span>
                        <span>{resolveUserFullName(c.assignedQa || c.createdBy || c.userEmail, "Auditor")}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {onNavigateToCampaigns && (
                <button
                  type="button"
                  onClick={onNavigateToCampaigns}
                  className="mt-3 w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>View All Active Campaigns</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. PENDING TASKS DEEP DIVE */}
      {activeTab === "tasks" && (
        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 border border-slate-200/80 rounded-xl p-4 bg-slate-50/30">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-slate-900">Pending Tasks by QA Inspection Stage</h3>
                <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                  {taskMetrics.totalPendingTasks} Pending Checkpoints
                </span>
              </div>
              <p className="text-xs text-slate-500 mb-4">
                Breakdown of tasks requiring auditor verification before campaign approval.
              </p>
              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={taskMetrics.stageChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="category" stroke="#64748b" fontSize={10} tickLine={false} interval={0} angle={-15} textAnchor="end" height={40} />
                    <YAxis stroke="#64748b" fontSize={11} tickLine={false} allowDecimals={false} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-white p-2.5 border border-slate-200 rounded-xl shadow-xs text-xs space-y-1">
                              <p className="font-bold text-slate-900">{data.category}</p>
                              <p className="text-amber-600 font-extrabold">{data.pending} Pending Checkpoints</p>
                              <p className="text-emerald-600 font-semibold">{data.checked} Completed Checkpoints</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
                    <Bar dataKey="pending" fill="#f59e0b" name="Pending Tasks" radius={[4, 4, 0, 0]} maxBarSize={30} />
                    <Bar dataKey="checked" fill="#10b981" name="Verified Tasks" radius={[4, 4, 0, 0]} maxBarSize={30} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Campaign Pending Task Bottlenecks */}
            <div className="border border-slate-200/80 rounded-xl p-4 bg-white flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-1">Task Bottlenecks</h3>
                <p className="text-xs text-slate-500 mb-3">Campaigns with the most open QA checkpoints</p>
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {taskMetrics.campaignTaskBreakdown.map((item, idx) => (
                    <div key={idx} className="p-2 rounded-lg border border-slate-100 bg-amber-50/40 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800 truncate max-w-[140px]">{item.name}</span>
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800">
                          {item.pending} open
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1">
                        <span>{item.country}</span>
                        <span>{item.completed} verified</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {onNavigateToChecklists && (
                <button
                  type="button"
                  onClick={onNavigateToChecklists}
                  className="mt-3 w-full py-2 bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>Review Checkpoint Standards</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. TEAM PERFORMANCE DEEP DIVE */}
      {activeTab === "team" && (
        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 border border-slate-200/80 rounded-xl p-4 bg-slate-50/30">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-slate-900">Auditor Throughput & QA Completion</h3>
                <span className="text-xs font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full">
                  Team Average: {teamMetrics.avgTeamRate}%
                </span>
              </div>
              <p className="text-xs text-slate-500 mb-4">
                Completed audits versus active assignments per reviewer.
              </p>
              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={teamMetrics.teamData}
                    margin={{ top: 10, right: 20, left: -10, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} />
                    <YAxis stroke="#64748b" fontSize={11} tickLine={false} allowDecimals={false} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-white p-2.5 border border-slate-200 rounded-xl shadow-xs text-xs space-y-1">
                              <p className="font-bold text-slate-900">{data.fullName}</p>
                              <p className="text-emerald-600 font-extrabold">{data.completed} Approved/Completed</p>
                              <p className="text-blue-600 font-medium">{data.active} In Progress / Pending</p>
                              <p className="text-purple-700 font-bold">Success Rate: {data.rate}%</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
                    <Bar dataKey="completed" fill="#10b981" name="Completed Audits" radius={[4, 4, 0, 0]} maxBarSize={28} />
                    <Bar dataKey="active" fill="#6366f1" name="Active In-Flight" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Team Leaderboard Snapshot */}
            <div className="border border-slate-200/80 rounded-xl p-4 bg-white flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-1">Auditor Leaderboard</h3>
                <p className="text-xs text-slate-500 mb-3">Ranked by campaign completion throughput</p>
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {teamMetrics.teamData.map((auditor, idx) => (
                    <div key={idx} className="p-2 rounded-lg border border-slate-100 bg-slate-50/60 text-xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <span className="font-bold text-slate-800 truncate max-w-[120px]">{auditor.fullName}</span>
                        </div>
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                          {auditor.completed} done
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1">
                        <span>{auditor.active} in flight</span>
                        <span className="font-semibold text-slate-700">{auditor.rate}% rate</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {onNavigateToUsers && (
                <button
                  type="button"
                  onClick={onNavigateToUsers}
                  className="mt-3 w-full py-2 bg-purple-50 hover:bg-purple-100 text-purple-900 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>Manage Reviewer Workload</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
