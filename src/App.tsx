import { useState, useEffect, useRef, useCallback, createContext, useContext } from "react";
import { createBrowserRouter, RouterProvider, Navigate, useLocation, Outlet } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import { Dashboard } from "./pages/Dashboard";
import { CampaignSetup } from "./pages/CampaignSetup";
import { Campaigns } from "./pages/Campaigns";
import { Login } from "./pages/Login";
import { ForgotPassword } from "./pages/ForgotPassword";
import { Signup } from "./pages/Signup";
import { supabase, isSupabaseConfigured, checkSetupStatus } from "@/lib/supabase";
import { getActiveSession, resolveCurrentSession, setActiveSession } from "@/lib/session";
import { savePreLoginRedirectUrl } from "@/lib/url-redirect";
import { Settings } from "./pages/Settings";
import { Profile } from "./pages/Profile";
import { Agents } from "./pages/Agents";
import { AgentChat } from "./pages/AgentChat";
import { UsersList } from "./pages/Users";
import { Checklists } from "./pages/Checklists";
import { Reports } from "./pages/Reports";
import { RecycleBin } from "./pages/RecycleBin";
import { SetupPage } from "./pages/SetupPage";
import { PrivacyPolicy } from "./pages/PrivacyPolicy";
import { SessionManager } from "./components/SessionManager";

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  userRole: string;
  userEmail: string;
  checkAuthSession: () => void;
  handleSetupComplete: () => void;
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  isLoading: true,
  userRole: "user",
  userEmail: "",
  checkAuthSession: () => {},
  handleSetupComplete: () => {},
});

export const useAuth = () => useContext(AuthContext);

function ProtectedRoute() {
  const { isAuthenticated, isLoading, userRole, userEmail, checkAuthSession } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-white">
        <div className="w-8 h-8 border-3 border-slate-200 border-t-[#2b61d6] rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    const currentPath = location.pathname + location.search + location.hash;
    if (currentPath && currentPath !== "/" && !currentPath.startsWith("/login") && !currentPath.startsWith("/signup")) {
      savePreLoginRedirectUrl(currentPath);
    }
    return <Login onLogin={checkAuthSession} />;
  }

  return (
    <SessionManager>
      <AppLayout role={userRole} userEmail={userEmail} />
    </SessionManager>
  );
}

function SetupPageWrapper() {
  const { handleSetupComplete } = useAuth();
  return <SetupPage onComplete={handleSetupComplete} />;
}

function LoginWrapper() {
  const { checkAuthSession } = useAuth();
  return <Login onLogin={() => checkAuthSession()} />;
}

function DashboardWrapper() {
  const { userEmail, userRole } = useAuth();
  return <Dashboard userEmail={userEmail} userRole={userRole} />;
}

function CampaignSetupWrapper() {
  const { userEmail, userRole } = useAuth();
  return <CampaignSetup userEmail={userEmail} userRole={userRole} />;
}

function CampaignsWrapper() {
  const { userEmail, userRole } = useAuth();
  return <Campaigns userEmail={userEmail} userRole={userRole} />;
}

function RecycleBinWrapper() {
  const { userEmail, userRole } = useAuth();
  return <RecycleBin userEmail={userEmail} userRole={userRole} />;
}

function UsersListWrapper() {
  const { userRole, userEmail } = useAuth();
  return <UsersList role={userRole} userEmail={userEmail} />;
}

function SettingsWrapper() {
  const { userRole, userEmail } = useAuth();
  return <Settings role={userRole} userEmail={userEmail} />;
}

function ProfileWrapper() {
  const { userRole, userEmail } = useAuth();
  return <Profile role={userRole} userEmail={userEmail} />;
}

function AgentsWrapper() {
  const { userRole } = useAuth();
  return <Agents role={userRole} />;
}

function AgentChatWrapper() {
  const { userRole } = useAuth();
  return <AgentChat role={userRole} />;
}

function ChecklistsWrapper() {
  const { userRole } = useAuth();
  return <Checklists role={userRole} />;
}

const router = createBrowserRouter([
  { path: "/setup", element: <SetupPageWrapper /> },
  { path: "/signup", element: <Signup /> },
  { path: "/login", element: <LoginWrapper /> },
  { path: "/forgot-password", element: <ForgotPassword /> },
  { path: "/privacy", element: <PrivacyPolicy /> },
  { path: "/privacy-policy", element: <PrivacyPolicy /> },
  {
    path: "/",
    element: <ProtectedRoute />,
    children: [
      { index: true, element: <DashboardWrapper /> },
      { path: "campaigns/new", element: <CampaignSetupWrapper /> },
      { path: "campaigns", element: <CampaignsWrapper /> },
      { path: "campaign", element: <Navigate to="/campaigns" replace /> },
      { path: "recycle-bin", element: <RecycleBinWrapper /> },
      { path: "reports", element: <Reports /> },
      { path: "users", element: <UsersListWrapper /> },
      { path: "settings", element: <SettingsWrapper /> },
      { path: "profile", element: <ProfileWrapper /> },
      { path: "agents", element: <AgentsWrapper /> },
      { path: "agents/:id/edit", element: <AgentsWrapper /> },
      { path: "agents/:id/chat", element: <AgentChatWrapper /> },
      { path: "checklists", element: <ChecklistsWrapper /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

export default function App() {
  const initialSession = getActiveSession();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => Boolean(initialSession?.email));
  const [userRole, setUserRole] = useState<string>(() => {
    return initialSession?.role || "user";
  });
  const [userEmail, setUserEmail] = useState<string>(() => initialSession?.email || "");
  const [isLoading, setIsLoading] = useState<boolean>(() => !initialSession?.email);
  const [isCheckingSetup, setIsCheckingSetup] = useState<boolean>(true);
  const [dbConnected, setDbConnected] = useState<boolean>(false);
  const sessionCheckSeq = useRef(0);

  const checkAuthSession = useCallback(async () => {
    const currentSeq = ++sessionCheckSeq.current;

    // 1. Check in-memory / stored session first
    const memSession = getActiveSession();
    if (memSession && memSession.email) {
      if (currentSeq === sessionCheckSeq.current) {
        setIsAuthenticated(true);
        setUserEmail(memSession.email.trim().toLowerCase());
        setUserRole(memSession.role || "user");
        setIsLoading(false);
      }
    }

    // 2. Resolve session directly from persistent storage, cookie, server, or DB
    try {
      const resolved = await resolveCurrentSession();
      if (resolved && resolved.email && currentSeq === sessionCheckSeq.current) {
        setIsAuthenticated(true);
        setUserEmail(resolved.email.trim().toLowerCase());
        setUserRole(resolved.role || "user");
        setIsLoading(false);
        return;
      }
    } catch (e) {}

    if (currentSeq === sessionCheckSeq.current && !getActiveSession()?.email) {
      setIsAuthenticated(false);
      setUserEmail("");
      setUserRole("user");
      setIsLoading(false);
    }
  }, [dbConnected]);

  // Initial Startup Check: inspect whether .env containing required database credentials exists
  useEffect(() => {
    let isMounted = true;

    const verifySetup = async () => {
      try {
        const status = await checkSetupStatus();
        if (!isMounted) return;

        if (status.isConfigured && status.isConnected) {
          setDbConnected(true);
          checkAuthSession();
        } else {
          setDbConnected(false);
        }
      } catch (err) {
        console.warn("[App] Setup status check failed:", err);
        if (isMounted) {
          setDbConnected(false);
        }
      } finally {
        if (isMounted) setIsCheckingSetup(false);
      }
    };

    verifySetup();

    const handleDbConfigChange = () => {
      verifySetup();
    };

    // Re-check when window regains focus to catch direct .env edits on disk
    window.addEventListener("focus", verifySetup);
    window.addEventListener("database_config_changed", handleDbConfigChange);

    return () => {
      isMounted = false;
      window.removeEventListener("focus", verifySetup);
      window.removeEventListener("database_config_changed", handleDbConfigChange);
    };
  }, [checkAuthSession]);

  useEffect(() => {
    if (!dbConnected) {
      setIsAuthenticated(false);
      setIsLoading(false);
      return;
    }

    checkAuthSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session && session.user) {
        const email = (session.user.email || "").trim().toLowerCase();
        let role = session.user.user_metadata?.role;
        let name = session.user.user_metadata?.name;

        // Query app_users table directly for real profile role & status
        try {
          const { data: appUser } = await supabase
            .from("app_users")
            .select("*")
            .eq("email", email)
            .maybeSingle();

          if (appUser) {
            role = appUser.role || role;
            name = appUser.name || name;
          }
        } catch (e) {}

        const finalRole = role || "user";
        setActiveSession({
          email,
          role: finalRole,
          name: name || email.split('@')[0],
          timestamp: new Date().toISOString()
        });

        setIsAuthenticated(true);
        setUserEmail(email);
        setUserRole(finalRole);
        setIsLoading(false);
      } else {
        checkAuthSession();
      }
    });

    const handleAuthEvent = () => {
      checkAuthSession();
    };

    window.addEventListener("app_auth_changed", handleAuthEvent);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("app_auth_changed", handleAuthEvent);
    };
  }, [dbConnected, checkAuthSession]);

  // While checking environment configuration on initial startup
  if (isCheckingSetup) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-50 text-slate-700">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-slate-200 border-t-[#2b61d6] rounded-full animate-spin"></div>
          <span className="text-xs text-slate-500 font-medium tracking-wide">
            Checking database configuration...
          </span>
        </div>
      </div>
    );
  }

  const handleSetupComplete = () => {
    setDbConnected(true);
    try {
      localStorage.setItem("hp_qa_db_connected", "true");
    } catch {}
    checkAuthSession();
    const session = getActiveSession();
    const destination = session?.email ? "/" : "/login";
    window.location.assign(destination);
  };

  // Initial Setup: If required database credentials are not available in .env, show Setup Page as the first screen
  if (!dbConnected) {
    return <SetupPage onComplete={handleSetupComplete} />;
  }

  // .env exists with required credentials: Skip Setup Page and load application normally
  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        userRole,
        userEmail,
        checkAuthSession,
        handleSetupComplete,
      }}
    >
      <RouterProvider router={router} />
    </AuthContext.Provider>
  );
}

