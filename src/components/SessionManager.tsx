import React, { useEffect, useState, useCallback, useRef } from "react";
import { SessionTimeoutModal } from "./SessionTimeoutModal";
import { clearActiveSession, cleanupExpiredSession, validateSupabaseAuthToken } from "@/lib/session";
import { useNavigate } from "react-router-dom";

interface SessionManagerProps {
  children: React.ReactNode;
}

// 30 minutes in milliseconds
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; 
// 2 minutes warning
const WARNING_THRESHOLD_MS = 2 * 60 * 1000; 

export function SessionManager({ children }: SessionManagerProps) {
  const [showModal, setShowModal] = useState(false);
  const [countdown, setCountdown] = useState(WARNING_THRESHOLD_MS / 1000);
  const lastActiveTimeRef = useRef<number>(Date.now());
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastTokenCheckRef = useRef<number>(Date.now());
  const navigate = useNavigate();

  const resetTimer = useCallback(() => {
    lastActiveTimeRef.current = Date.now();
    if (showModal) {
      setShowModal(false);
      setCountdown(WARNING_THRESHOLD_MS / 1000);
    }
  }, [showModal]);

  const handleLogout = useCallback(() => {
    clearActiveSession();
    navigate("/login");
  }, [navigate]);

  useEffect(() => {
    // Listen for custom token expiration event from lib/session or supabase
    const handleTokenExpired = (e: Event) => {
      console.warn("[SessionManager] Token expired event caught:", (e as CustomEvent)?.detail?.reason);
      cleanupExpiredSession((e as CustomEvent)?.detail?.reason || "Token expired");
      navigate("/login");
    };

    window.addEventListener("supabase_token_expired", handleTokenExpired);

    // Events to track activity
    const activityEvents = [
      "mousedown",
      "mousemove",
      "keydown",
      "scroll",
      "touchstart",
      "click"
    ];

    const handleUserActivity = () => {
      // Only reset timer if modal is not currently showing. 
      // If modal is showing, they MUST click "Stay Signed In" to reset.
      if (!showModal) {
        lastActiveTimeRef.current = Date.now();
      }
    };

    activityEvents.forEach((event) => {
      window.addEventListener(event, handleUserActivity, { passive: true });
    });

    // Check auth token validity whenever window gains focus or tab becomes active
    const handleWindowFocus = async () => {
      const isValid = await validateSupabaseAuthToken();
      if (!isValid) {
        navigate("/login");
      }
    };
    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        handleWindowFocus();
      }
    });

    // Check inactivity every second + check token health every 30 seconds
    timerRef.current = setInterval(async () => {
      const now = Date.now();
      const inactiveDuration = now - lastActiveTimeRef.current;
      const remainingTotalTime = INACTIVITY_TIMEOUT_MS - inactiveDuration;

      // Periodic check of Supabase auth token validity every 30 seconds
      if (now - lastTokenCheckRef.current > 30000) {
        lastTokenCheckRef.current = now;
        const isTokenValid = await validateSupabaseAuthToken();
        if (!isTokenValid) {
          if (timerRef.current) clearInterval(timerRef.current);
          navigate("/login");
          return;
        }
      }

      if (remainingTotalTime <= 0) {
        // Time is up, force logout
        if (timerRef.current) clearInterval(timerRef.current);
        handleLogout();
      } else if (remainingTotalTime <= WARNING_THRESHOLD_MS) {
        // We are in the warning zone
        if (!showModal) {
          setShowModal(true);
        }
        setCountdown(Math.ceil(remainingTotalTime / 1000));
      }
    }, 1000);

    return () => {
      window.removeEventListener("supabase_token_expired", handleTokenExpired);
      window.removeEventListener("focus", handleWindowFocus);
      activityEvents.forEach((event) => {
        window.removeEventListener(event, handleUserActivity);
      });
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [showModal, handleLogout, navigate]);

  return (
    <>
      {children}
      <SessionTimeoutModal 
        isOpen={showModal}
        countdownSeconds={countdown}
        onStaySignedIn={resetTimer}
        onLogOut={handleLogout}
      />
    </>
  );
}
