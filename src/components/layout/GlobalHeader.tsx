import React from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { GlobalSearchBar } from "./GlobalSearchBar";
import { resolveUserFirstName } from "@/lib/userNames";
import {
  PlusCircle,
  Settings,
  ChevronRight,
  ShieldCheck,
  User as UserIcon,
  Sparkles
} from "lucide-react";

interface GlobalHeaderProps {
  role: string;
  userEmail?: string;
}

export function GlobalHeader({ role, userEmail }: GlobalHeaderProps) {
  const location = useLocation();
  const navigate = useNavigate();

  // Determine current page title and breadcrumb
  const getPageContext = () => {
    const path = location.pathname;
    if (path === "/" || path === "") {
      return { title: "Dashboard", category: "Operations" };
    }
    if (path.startsWith("/campaigns/new")) {
      return { title: "New Campaign Setup", category: "Audits" };
    }
    if (path.startsWith("/campaigns")) {
      return { title: "Campaigns Management", category: "Audits" };
    }
    if (path.startsWith("/reports")) {
      return { title: "Executive Reports", category: "Analytics" };
    }
    if (path.startsWith("/checklists")) {
      return { title: "QA Checkpoints", category: "Standards" };
    }
    if (path.startsWith("/users")) {
      return { title: "User Management", category: "Administration" };
    }
    if (path.startsWith("/settings")) {
      return { title: "System Settings", category: "Administration" };
    }
    if (path.startsWith("/profile")) {
      return { title: "My Profile", category: "Account" };
    }
    if (path.startsWith("/agents")) {
      return { title: "AI Agent Studio", category: "Intelligence" };
    }
    if (path.startsWith("/recycle-bin")) {
      return { title: "Recycle Bin", category: "Archive" };
    }
    return { title: "Platform", category: "Zeta QA" };
  };

  const context = getPageContext();
  const displayName = resolveUserFirstName(userEmail, "Chaithanya");
  const isAdmin = role?.toLowerCase() === "admin";

  return (
    <header
      id="global-app-header"
      className="sticky top-0 z-30 w-full h-14 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-3 sm:px-5 lg:px-6 flex items-center justify-between gap-3 select-none"
    >
      {/* Left: Breadcrumbs & Page Context */}
      <div className="flex items-center gap-2 min-w-0 shrink-0">
        <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
          <span className="hidden md:inline hover:text-slate-600 transition-colors">
            {context.category}
          </span>
          <ChevronRight className="w-3.5 h-3.5 hidden md:inline text-slate-300" />
          <h1 className="text-xs sm:text-sm font-semibold text-slate-800 truncate">
            {context.title}
          </h1>
        </div>
      </div>

      {/* Center: Global Fuzzy Search Bar */}
      <div className="flex-1 max-w-xl mx-2 sm:mx-4">
        <GlobalSearchBar />
      </div>

      {/* Right: Quick Actions & Profile Capsule */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Quick New Campaign Setup button */}
        <button
          type="button"
          id="global-header-new-campaign-btn"
          onClick={() => navigate("/campaigns/new")}
          className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#2b61d6] hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-2xs transition-all active:scale-[0.98] cursor-pointer"
          title="Create New Campaign Audit"
        >
          <PlusCircle className="w-3.5 h-3.5" />
          <span>New Audit</span>
        </button>

        {/* Settings Quick Jump */}
        <button
          type="button"
          id="global-header-settings-btn"
          onClick={() => navigate("/settings")}
          className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          title="System Settings"
        >
          <Settings className="w-4 h-4" />
        </button>

        {/* User Capsule */}
        <Link
          to="/profile"
          id="global-header-user-profile-link"
          className="flex items-center gap-2 pl-2 pr-2.5 py-1 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200/80 transition-all cursor-pointer group"
          title={`Signed in as ${displayName} (${role})`}
        >
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-[#2b61d6] to-indigo-700 text-white flex items-center justify-center font-bold text-[10px] shadow-2xs">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div className="hidden lg:flex flex-col text-left">
            <span className="text-xs font-semibold text-slate-800 group-hover:text-blue-600 transition-colors leading-tight">
              {displayName}
            </span>
            <span className="text-[10px] font-medium text-slate-400 leading-tight">
              {isAdmin ? "Admin" : "QA Reviewer"}
            </span>
          </div>
        </Link>
      </div>
    </header>
  );
}
