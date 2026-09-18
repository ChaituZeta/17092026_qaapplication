/**
 * Route Persistence & State Management Utility
 * 
 * Provides robust persistent state management for the active page route,
 * query parameters, and tab/filter states. Ensures that refreshing the
 * browser (including in iframe sandboxes or dev previews) seamlessly restores
 * the exact path and state instead of resetting to the dashboard.
 */

import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getActiveSession } from "./session";

export const HP_QA_ACTIVE_ROUTE_KEY = "hp_qa_last_active_route";
export const HP_QA_ROUTE_TIMESTAMP_KEY = "hp_qa_last_active_route_timestamp";
export const HP_QA_SCROLL_KEY = "hp_qa_route_scroll_positions";

let inMemoryActiveRoute: string | null = null;

/**
 * Validates that a route is safe and appropriate to persist as an active workspace route.
 * Excludes authentication pages, setup flows, and external/protocol-relative URLs.
 */
export function isPersistableRoute(url?: string | null): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();

  // Must be an internal relative path starting with /
  if (!trimmed.startsWith("/")) return false;
  if (trimmed.startsWith("//")) return false;

  // Blacklist authentication, public, setup, or transient screens
  if (
    trimmed.startsWith("/login") ||
    trimmed.startsWith("/signup") ||
    trimmed.startsWith("/invite") ||
    trimmed.startsWith("/setup") ||
    trimmed.startsWith("/forgot-password") ||
    trimmed.startsWith("/reset-password") ||
    trimmed.startsWith("/privacy")
  ) {
    return false;
  }

  return true;
}

/**
 * Sanitizes route URLs before persisting them, stripping any spoofed email query params.
 */
function sanitizeRouteForPersistence(url: string): string {
  try {
    const [base, rest] = url.split("?");
    if (!rest) return url;
    const [search, hash] = rest.split("#");
    const params = new URLSearchParams(search);
    ["email", "userEmail", "user_email", "targetEmail", "profileEmail", "account"].forEach(k => params.delete(k));
    const newSearch = params.toString();
    return base + (newSearch ? `?${newSearch}` : "") + (hash ? `#${hash}` : "");
  } catch {
    return url;
  }
}

/**
 * Persists the current active URL (including pathname, search params, and hash)
 * to sessionStorage (tab-isolated) and mirrors to localStorage (cross-session).
 */
export function savePersistedActiveRoute(url: string): void {
  try {
    if (!isPersistableRoute(url)) return;

    const safeUrl = sanitizeRouteForPersistence(url);
    inMemoryActiveRoute = safeUrl;

    if (typeof window !== "undefined") {
      // 1. SessionStorage for current browser tab context
      try {
        sessionStorage.setItem(HP_QA_ACTIVE_ROUTE_KEY, safeUrl);
      } catch (e) {
        console.warn("[RoutePersistence] sessionStorage write failed:", e);
      }

      // 2. LocalStorage mirror with timestamp for resiliency
      try {
        localStorage.setItem(HP_QA_ACTIVE_ROUTE_KEY, safeUrl);
        localStorage.setItem(HP_QA_ROUTE_TIMESTAMP_KEY, String(Date.now()));
      } catch (e) {
        console.warn("[RoutePersistence] localStorage write failed:", e);
      }
    }
  } catch (err) {
    console.warn("[RoutePersistence] Failed to persist active route:", err);
  }
}

/**
 * Retrieves the last persisted active route.
 * Prioritizes sessionStorage (active tab), falls back to in-memory, then localStorage.
 */
export function getPersistedActiveRoute(): string | null {
  try {
    // 1. Check sessionStorage (active tab state)
    if (typeof window !== "undefined") {
      const sessionUrl = sessionStorage.getItem(HP_QA_ACTIVE_ROUTE_KEY);
      if (sessionUrl && isPersistableRoute(sessionUrl)) {
        return sessionUrl;
      }
    }

    // 2. Check in-memory cached route
    if (inMemoryActiveRoute && isPersistableRoute(inMemoryActiveRoute)) {
      return inMemoryActiveRoute;
    }

    // 3. Fallback to localStorage if recent (within 7 days)
    if (typeof window !== "undefined") {
      const localUrl = localStorage.getItem(HP_QA_ACTIVE_ROUTE_KEY);
      const timestampStr = localStorage.getItem(HP_QA_ROUTE_TIMESTAMP_KEY);
      if (localUrl && isPersistableRoute(localUrl)) {
        if (timestampStr) {
          const timestamp = parseInt(timestampStr, 10);
          const maxAgeMs = 7 * 24 * 60 * 60 * 1000; // 7 days
          if (!isNaN(timestamp) && Date.now() - timestamp > maxAgeMs) {
            return null; // Expired
          }
        }
        return localUrl;
      }
    }
  } catch (err) {
    console.warn("[RoutePersistence] Failed to retrieve persisted route:", err);
  }

  return null;
}

/**
 * Clears persisted route state upon explicit user logout.
 */
export function clearPersistedActiveRoute(): void {
  inMemoryActiveRoute = null;
  if (typeof window !== "undefined") {
    try {
      sessionStorage.removeItem(HP_QA_ACTIVE_ROUTE_KEY);
      localStorage.removeItem(HP_QA_ACTIVE_ROUTE_KEY);
      localStorage.removeItem(HP_QA_ROUTE_TIMESTAMP_KEY);
      localStorage.removeItem(HP_QA_SCROLL_KEY);
    } catch (e) {}
  }
}

/**
 * Re-hydrates the browser's window.location state prior to React Router instantiation.
 * 
 * If the page is loaded at "/" (e.g., when refreshing an iframe preview or browser tab),
 * but the user was previously working on a specific subpage like "/users",
 * "/campaigns/new?id=...", or "/settings?tab=teams", this function calls
 * window.history.replaceState() so that React Router's createBrowserRouter()
 * immediately boots at the exact intended deep-link without an intermediate flash.
 * 
 * Returns true if a re-hydration redirect was applied, false otherwise.
 */
export function rehydratePreRouterUrl(): boolean {
  if (typeof window === "undefined") return false;

  try {
    const pathname = window.location.pathname;
    const search = window.location.search;
    const hash = window.location.hash;

    // If the browser URL already has a specific non-root path or search params,
    // honor it directly and record it as current.
    if (pathname !== "/" || Boolean(search) || Boolean(hash)) {
      const currentFullUrl = pathname + search + hash;
      if (isPersistableRoute(currentFullUrl)) {
        savePersistedActiveRoute(currentFullUrl);
      }
      return false;
    }

    // Current URL is exactly root "/". Check if there is a persisted route to restore.
    const activeSession = getActiveSession();
    // Only rehydrate if the user is authenticated (or has a stored session)
    if (!activeSession?.email) {
      return false;
    }

    const persistedRoute = getPersistedActiveRoute();
    if (persistedRoute && persistedRoute !== "/" && isPersistableRoute(persistedRoute)) {
      console.log("[RoutePersistence] Synchronously rehydrating pre-router URL to:", persistedRoute);
      window.history.replaceState(null, "", persistedRoute);
      return true;
    }
  } catch (err) {
    console.warn("[RoutePersistence] Error during pre-router URL re-hydration:", err);
  }

  return false;
}

/**
 * React Hook that monitors navigation events and automatically persists
 * the active route (pathname + query search + hash).
 */
export function useRoutePersister(): void {
  const location = useLocation();

  useEffect(() => {
    const fullPath = location.pathname + location.search + location.hash;
    if (isPersistableRoute(fullPath)) {
      savePersistedActiveRoute(fullPath);
    }
  }, [location.pathname, location.search, location.hash]);
}

/**
 * React Component that serves as a fallback re-hydrator inside the Router tree.
 * Ensures that if pre-router replaceState did not execute or if the router
 * initialized at "/" while a valid persisted route exists, it smoothly navigates.
 */
export function RouteHydrator(): null {
  const navigate = useNavigate();
  const location = useLocation();
  const hasHydratedRef = useRef(false);

  useEffect(() => {
    if (hasHydratedRef.current) return;
    hasHydratedRef.current = true;

    // Only rehydrate if currently on root "/" with no search or hash
    if (location.pathname === "/" && !location.search && !location.hash) {
      const session = getActiveSession();
      if (!session?.email) return;

      const persisted = getPersistedActiveRoute();
      if (persisted && persisted !== "/" && isPersistableRoute(persisted)) {
        console.log("[RoutePersistence] RouteHydrator replacing location with:", persisted);
        navigate(persisted, { replace: true });
      }
    }
  }, [location.pathname, location.search, location.hash, navigate]);

  return null;
}

/**
 * Saves scroll position for a given route path
 */
export function saveRouteScrollPosition(path: string, scrollY: number): void {
  if (typeof window === "undefined") return;
  try {
    const raw = sessionStorage.getItem(HP_QA_SCROLL_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[path] = Math.max(0, scrollY);
    sessionStorage.setItem(HP_QA_SCROLL_KEY, JSON.stringify(map));
  } catch (e) {}
}

/**
 * Restores scroll position for a given route path
 */
export function getRouteScrollPosition(path: string): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = sessionStorage.getItem(HP_QA_SCROLL_KEY);
    if (raw) {
      const map = JSON.parse(raw);
      return typeof map[path] === "number" ? map[path] : 0;
    }
  } catch (e) {}
  return 0;
}
