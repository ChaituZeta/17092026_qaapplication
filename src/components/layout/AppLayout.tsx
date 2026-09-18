import { Outlet, useLocation } from "react-router-dom";
import { useEffect, useRef } from "react";
import { Sidebar } from "./Sidebar";
import { SessionManager } from "../SessionManager";
import { NetworkStatusBar } from "../NetworkStatusBar";
import { ErrorBoundary } from "../common/ErrorBoundary";
import { useRoutePersister, saveRouteScrollPosition, getRouteScrollPosition } from "@/lib/route-persistence";

export function AppLayout({ role, userEmail }: { role: string; userEmail?: string }) {
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  // Automatically persist active route path, query params, and hash to sessionStorage & localStorage
  useRoutePersister();

  // Restore and maintain scroll position across route navigations
  useEffect(() => {
    const mainEl = mainRef.current;
    if (!mainEl) return;

    const fullPath = location.pathname + location.search;
    const savedScroll = getRouteScrollPosition(fullPath);
    if (savedScroll > 0) {
      requestAnimationFrame(() => {
        if (mainRef.current) {
          mainRef.current.scrollTop = savedScroll;
        }
      });
    }

    const handleScroll = () => {
      if (mainRef.current) {
        saveRouteScrollPosition(fullPath, mainRef.current.scrollTop);
      }
    };

    mainEl.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      mainEl.removeEventListener("scroll", handleScroll);
    };
  }, [location.pathname, location.search]);

  // Global Security Guard: Restrict URL parameters like email/userEmail pointing to other profiles
  // If present on any non-profile route, immediately strip them to prevent unauthorized profile/session targeting.
  useEffect(() => {
    if (!userEmail) return;
    const search = location.search;
    if (!search) return;

    try {
      const params = new URLSearchParams(search);
      const restrictedKeys = ["email", "userEmail", "user_email", "profileEmail", "targetEmail", "account"];
      let hasTamperedParam = false;

      for (const key of restrictedKeys) {
        const val = params.get(key);
        if (val && val.trim().toLowerCase() !== userEmail.trim().toLowerCase()) {
          hasTamperedParam = true;
          params.delete(key);
        }
      }

      if (hasTamperedParam && !location.pathname.startsWith("/profile")) {
        const newSearch = params.toString();
        const cleanPath = location.pathname + (newSearch ? `?${newSearch}` : "") + location.hash;
        window.history.replaceState(null, "", cleanPath);
      }
    } catch {}
  }, [location.pathname, location.search, userEmail]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 text-slate-900 font-sans relative">
      <Sidebar role={role} userEmail={userEmail} />
      <main ref={mainRef} id="main-content-area" className="flex-1 flex flex-col relative overflow-y-auto overflow-x-auto min-w-0 bg-white">
        <NetworkStatusBar role={role} />
        <div className="flex-1 flex flex-col min-w-0 z-10">
          <ErrorBoundary level="page" componentName="Active Page Workspace">
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}
