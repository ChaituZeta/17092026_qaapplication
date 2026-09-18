import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  X,
  FileText,
  User,
  Users,
  Key,
  Mail,
  Sliders,
  Database,
  CheckSquare,
  BarChart2,
  Sparkles,
  Trash2,
  PlusCircle,
  LayoutDashboard,
  Folder,
  ArrowRight,
  CornerDownLeft,
  Loader2,
  Sparkle
} from "lucide-react";
import { performGlobalSearch, SearchResultItem } from "@/lib/fuzzy-search";

interface GlobalSearchBarProps {
  className?: string;
  onNavigate?: () => void;
}

export function GlobalSearchBar({ className = "", onNavigate }: GlobalSearchBarProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [filterType, setFilterType] = useState<"all" | "campaigns" | "users" | "settings">("all");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Handle global keyboard shortcuts: ⌘K or Ctrl+K or '/'
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      const isSlash = e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA";

      if (isCmdK || isSlash) {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Execute fuzzy search when query or filter changes
  useEffect(() => {
    let isCurrent = true;
    setIsLoading(true);

    const timer = setTimeout(async () => {
      try {
        const data = await performGlobalSearch(query, filterType);
        if (isCurrent) {
          setResults(data);
          setSelectedIndex(0);
          setIsLoading(false);
        }
      } catch (err) {
        if (isCurrent) {
          setResults([]);
          setIsLoading(false);
        }
      }
    }, 80);

    return () => {
      isCurrent = false;
      clearTimeout(timer);
    };
  }, [query, filterType]);

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current && selectedIndex >= 0) {
      const activeEl = listRef.current.children[selectedIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }, [selectedIndex]);

  const handleSelectResult = useCallback(
    (item: SearchResultItem) => {
      setIsOpen(false);
      setQuery("");
      navigate(item.url);
      if (onNavigate) onNavigate();
    },
    [navigate, onNavigate]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (query) {
        setQuery("");
      } else {
        setIsOpen(false);
        inputRef.current?.blur();
      }
      return;
    }

    if (!isOpen) {
      setIsOpen(true);
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (results.length ? (prev + 1) % results.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (results.length ? (prev - 1 + results.length) % results.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[selectedIndex]) {
        handleSelectResult(results[selectedIndex]);
      }
    }
  };

  const getResultIcon = (iconName: string, type: string) => {
    const iconClass = "w-4 h-4";
    switch (iconName) {
      case "FileText":
        return <FileText className={iconClass} />;
      case "User":
        return <User className={iconClass} />;
      case "Users":
        return <Users className={iconClass} />;
      case "Key":
        return <Key className={iconClass} />;
      case "Mail":
        return <Mail className={iconClass} />;
      case "Sliders":
        return <Sliders className={iconClass} />;
      case "Database":
        return <Database className={iconClass} />;
      case "CheckSquare":
        return <CheckSquare className={iconClass} />;
      case "BarChart2":
        return <BarChart2 className={iconClass} />;
      case "Sparkles":
        return <Sparkles className={iconClass} />;
      case "Trash2":
        return <Trash2 className={iconClass} />;
      case "PlusCircle":
        return <PlusCircle className={iconClass} />;
      case "LayoutDashboard":
        return <LayoutDashboard className={iconClass} />;
      case "Folder":
        return <Folder className={iconClass} />;
      default:
        return type === "campaign" ? <FileText className={iconClass} /> : <Sliders className={iconClass} />;
    }
  };

  const getBadgeClasses = (badgeColor?: string) => {
    switch (badgeColor) {
      case "emerald":
        return "bg-emerald-50 text-emerald-700 border-emerald-200/80";
      case "blue":
        return "bg-blue-50 text-blue-700 border-blue-200/80";
      case "rose":
        return "bg-rose-50 text-rose-700 border-rose-200/80";
      case "purple":
        return "bg-purple-50 text-purple-700 border-purple-200/80";
      case "indigo":
        return "bg-indigo-50 text-indigo-700 border-indigo-200/80";
      case "amber":
        return "bg-amber-50 text-amber-800 border-amber-200/80";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  const getTypeIconBg = (type: string) => {
    switch (type) {
      case "campaign":
        return "bg-blue-50 text-blue-600 border-blue-100";
      case "user":
        return "bg-purple-50 text-purple-600 border-purple-100";
      case "setting":
      default:
        return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  // Group items by category for scannability
  const campaignsCount = results.filter((r) => r.type === "campaign").length;
  const usersCount = results.filter((r) => r.type === "user").length;
  const settingsCount = results.filter((r) => r.type === "setting").length;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Search Bar Input Container */}
      <div
        id="global-search-container"
        className={`flex items-center gap-2.5 px-3 py-1.5 rounded-xl border transition-all duration-200 ${
          isOpen
            ? "bg-white border-[#2b61d6] ring-2 ring-blue-500/15 shadow-sm"
            : "bg-slate-100/80 hover:bg-slate-100 border-slate-200/80 hover:border-slate-300"
        }`}
      >
        <Search className={`w-4 h-4 shrink-0 ${isOpen ? "text-[#2b61d6]" : "text-slate-400"}`} />

        <input
          ref={inputRef}
          id="global-search-input"
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search campaigns, users, settings... (⌘K)"
          className="w-full bg-transparent text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
          autoComplete="off"
          spellCheck={false}
        />

        {isLoading ? (
          <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin shrink-0" />
        ) : query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="p-0.5 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-200/60 transition-colors"
            title="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 bg-white border border-slate-200 rounded shadow-2xs select-none">
            <span className="text-xs">⌘</span>K
          </kbd>
        )}
      </div>

      {/* Popover Dropdown Results */}
      {isOpen && (
        <div
          id="global-search-results-dropdown"
          className="absolute left-0 right-0 top-full mt-2 w-full sm:min-w-[480px] lg:min-w-[560px] max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Filter Pills Header */}
          <div className="px-3 py-2 bg-slate-50/90 border-b border-slate-100 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setFilterType("all")}
                className={`px-2 py-1 rounded-lg font-medium transition-all ${
                  filterType === "all"
                    ? "bg-white text-slate-900 shadow-2xs border border-slate-200"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                All ({results.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterType("campaigns")}
                className={`px-2 py-1 rounded-lg font-medium transition-all ${
                  filterType === "campaigns"
                    ? "bg-white text-[#2b61d6] shadow-2xs border border-blue-200"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Campaigns {campaignsCount > 0 ? `(${campaignsCount})` : ""}
              </button>
              <button
                type="button"
                onClick={() => setFilterType("users")}
                className={`px-2 py-1 rounded-lg font-medium transition-all ${
                  filterType === "users"
                    ? "bg-white text-purple-700 shadow-2xs border border-purple-200"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Users {usersCount > 0 ? `(${usersCount})` : ""}
              </button>
              <button
                type="button"
                onClick={() => setFilterType("settings")}
                className={`px-2 py-1 rounded-lg font-medium transition-all ${
                  filterType === "settings"
                    ? "bg-white text-slate-900 shadow-2xs border border-slate-200"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Settings {settingsCount > 0 ? `(${settingsCount})` : ""}
              </button>
            </div>

            <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
              Fuzzy Match
            </span>
          </div>

          {/* Results List */}
          <div
            ref={listRef}
            id="global-search-results-list"
            className="max-h-[380px] overflow-y-auto divide-y divide-slate-100 p-1.5"
          >
            {results.length > 0 ? (
              results.map((item, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <div
                    key={item.id}
                    id={`search-result-item-${item.id}`}
                    onClick={() => handleSelectResult(item)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`group px-3 py-2.5 rounded-xl cursor-pointer transition-colors flex items-center justify-between gap-3 ${
                      isSelected ? "bg-blue-50/70 text-slate-900" : "hover:bg-slate-50 text-slate-800"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Icon */}
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${getTypeIconBg(
                          item.type
                        )}`}
                      >
                        {getResultIcon(item.icon, item.type)}
                      </div>

                      {/* Title and Subtitle */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs sm:text-sm text-slate-900 truncate">
                            {item.title}
                          </span>
                          {item.badge && (
                            <span
                              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md border shrink-0 ${getBadgeClasses(
                                item.badgeColor
                              )}`}
                            >
                              {item.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">
                          {item.subtitle}
                        </p>
                      </div>
                    </div>

                    {/* Quick Jump Action */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        className={`text-[10px] font-medium text-slate-400 group-hover:text-blue-600 transition-colors hidden sm:flex items-center gap-1 ${
                          isSelected ? "text-blue-600" : ""
                        }`}
                      >
                        Jump
                        <CornerDownLeft className="w-3 h-3" />
                      </span>
                      <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-8 px-4 text-center">
                <p className="text-xs text-slate-500 font-medium">
                  {query ? `No matches found for "${query}"` : "Start typing to search across the platform"}
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Try searching by campaign name, country code (e.g. US, AU), reviewer name, or setting (e.g. "credentials", "gmail", "users").
                </p>
              </div>
            )}
          </div>

          {/* Footer Shortcuts */}
          <div className="px-3 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 select-none">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 bg-white border border-slate-200 rounded font-mono text-[9px] shadow-2xs">↑</kbd>
                <kbd className="px-1 py-0.5 bg-white border border-slate-200 rounded font-mono text-[9px] shadow-2xs">↓</kbd> Navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono text-[9px] shadow-2xs">↵</kbd> Select
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono text-[9px] shadow-2xs">ESC</kbd> Close
              </span>
            </div>

            <div className="hidden sm:flex items-center gap-1 text-[10px] text-slate-400">
              <Sparkle className="w-3 h-3 text-[#2b61d6]" />
              Zeta QA Global Fuzzy Search
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
