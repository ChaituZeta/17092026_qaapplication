import { Outlet, useLocation } from "react-router-dom";
import { useEffect, useRef } from "react";
import { Sidebar } from "./Sidebar";
import { SessionManager } from "../SessionManager";
import { NetworkStatusBar } from "../NetworkStatusBar";
import { GlobalHeader } from "./GlobalHeader";
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

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 text-slate-900 font-sans relative">
      <Sidebar role={role} userEmail={userEmail} />
      <main ref={mainRef} id="main-content-area" className="flex-1 flex flex-col relative overflow-y-auto overflow-x-auto min-w-0 bg-white">
        <NetworkStatusBar role={role} />
        <GlobalHeader role={role} userEmail={userEmail} />
        <div className="flex-1 flex flex-col min-w-0 z-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
