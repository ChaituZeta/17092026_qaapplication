import React, { useState } from "react";
import { useRouteError, isRouteErrorResponse, useNavigate } from "react-router-dom";
import { AlertTriangle, Home, RotateCcw, Bug, ChevronDown, ChevronUp, Copy, Check } from "lucide-react";

export function RouteErrorFallback() {
  const error = useRouteError();
  const navigate = useNavigate();
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);

  let errorMessage = "An unexpected routing error occurred.";
  let errorStatus: number | string = 500;
  let errorStatusText = "Internal Error";
  let errorStack = "";

  if (isRouteErrorResponse(error)) {
    errorStatus = error.status;
    errorStatusText = error.statusText || (error.status === 404 ? "Not Found" : "Routing Error");
    errorMessage = error.data?.message || error.statusText || errorMessage;
  } else if (error instanceof Error) {
    errorMessage = error.message;
    errorStack = error.stack || "";
  } else if (typeof error === "string") {
    errorMessage = error;
  }

  const handleCopy = () => {
    const text = [
      `Status: ${errorStatus} (${errorStatusText})`,
      `Message: ${errorMessage}`,
      `Stack: ${errorStack || "None"}`,
      `URL: ${window.location.href}`,
      `Timestamp: ${new Date().toISOString()}`,
    ].join("\n\n");

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      });
    }
  };

  return (
    <div
      id="route-error-screen"
      className="min-h-screen w-full flex items-center justify-center bg-slate-50 text-slate-800 p-4 sm:p-6 select-none"
    >
      <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto mb-4 shadow-2xs">
          <AlertTriangle className="w-7 h-7" />
        </div>

        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-[11px] font-bold tracking-wide uppercase mb-3">
          Error {errorStatus}: {errorStatusText}
        </div>

        <h1 className="text-lg sm:text-xl font-bold text-slate-900 mb-2">
          {errorStatus === 404 ? "Page Not Found" : "Unable to Load This View"}
        </h1>

        <p className="text-xs text-slate-600 leading-relaxed max-w-md mx-auto mb-5">
          {errorStatus === 404
            ? "The page or resource you requested could not be located. It may have moved, been deleted, or had its URL modified."
            : "A problem occurred while loading this route. The system caught the error and safely stopped the transition to prevent app crashes."}
        </p>

        {errorMessage && (
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-rose-600 font-mono text-left mb-6 break-words max-h-24 overflow-y-auto">
            {errorMessage}
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 mb-6">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#2b61d6] hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-2xs transition-all cursor-pointer active:scale-98"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reload Page</span>
          </button>

          <button
            type="button"
            onClick={() => navigate("/", { replace: true })}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-all cursor-pointer"
          >
            <Home className="w-3.5 h-3.5" />
            <span>Back to Dashboard</span>
          </button>
        </div>

        {errorStack && (
          <div className="border-t border-slate-100 pt-4 text-left">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowDetails(!showDetails)}
                className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 font-medium cursor-pointer"
              >
                <Bug className="w-3.5 h-3.5" />
                <span>Technical Stack</span>
                {showDetails ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>

              {showDetails && (
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded text-[10px] text-slate-600 font-medium transition-colors cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-600" />
                      <span className="text-emerald-600">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {showDetails && (
              <pre className="mt-3 p-3 bg-slate-900 text-slate-300 rounded-lg text-[10px] font-mono overflow-x-auto max-h-48 leading-relaxed select-text">
                {errorStack}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
