import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RotateCcw, Home, ChevronDown, ChevronUp, Copy, Check, Bug } from "lucide-react";

export type ErrorBoundaryLevel = "root" | "page" | "widget" | "inline";

export interface ErrorBoundaryProps {
  children: ReactNode;
  level?: ErrorBoundaryLevel;
  componentName?: string;
  fallbackTitle?: string;
  fallbackDescription?: string;
  onReset?: () => void;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  fallbackRender?: (props: {
    error: Error;
    errorInfo: ErrorInfo | null;
    resetErrorBoundary: () => void;
  }) => ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
  copied: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
    showDetails: false,
    copied: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(
      `[ErrorBoundary:${this.props.componentName || "Generic"}] Caught runtime error:`,
      error,
      errorInfo
    );

    this.setState({ errorInfo });

    if (this.props.onError) {
      try {
        this.props.onError(error, errorInfo);
      } catch (err) {
        console.error("[ErrorBoundary] Error during onError callback:", err);
      }
    }
  }

  public resetErrorBoundary = () => {
    if (this.props.onReset) {
      try {
        this.props.onReset();
      } catch (err) {
        console.error("[ErrorBoundary] Error during onReset callback:", err);
      }
    }

    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
      copied: false,
    });
  };

  private handleCopyDetails = () => {
    const { error, errorInfo } = this.state;
    const details = [
      `Component: ${this.props.componentName || "Unknown"}`,
      `Time: ${new Date().toISOString()}`,
      `Error: ${error?.name || "Error"}: ${error?.message || "Unknown error"}`,
      `Stack: ${error?.stack || "No stack trace available"}`,
      `Component Stack: ${errorInfo?.componentStack || "No component stack"}`,
    ].join("\n\n");

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(details).then(() => {
        this.setState({ copied: true });
        setTimeout(() => this.setState({ copied: false }), 2500);
      });
    }
  };

  private handleReloadApp = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.assign("/");
  };

  private handleClearStorageAndReset = () => {
    try {
      // Clear non-critical caches that might cause render loops
      sessionStorage.removeItem("hp_qa_last_active_route");
      sessionStorage.removeItem("hpqa_redirect_url");
      localStorage.removeItem("hp_qa_last_active_route");
    } catch {}
    window.location.assign("/");
  };

  public render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { error, errorInfo, showDetails, copied } = this.state;
    const {
      level = "page",
      componentName,
      fallbackTitle,
      fallbackDescription,
      fallbackRender,
    } = this.props;

    if (fallbackRender && error) {
      return fallbackRender({
        error,
        errorInfo,
        resetErrorBoundary: this.resetErrorBoundary,
      });
    }

    const title =
      fallbackTitle ||
      (componentName
        ? `${componentName} encountered an unexpected issue`
        : "Something went wrong in this section");

    const description =
      fallbackDescription ||
      "A client-side error occurred while rendering this component. The rest of the application remains protected and operational.";

    // 1. ROOT LEVEL ERROR (Full page viewport recovery screen)
    if (level === "root") {
      return (
        <div
          id="root-error-boundary-screen"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900 text-slate-100 p-4 sm:p-6 overflow-y-auto select-none"
        >
          <div className="w-full max-w-xl bg-slate-800/90 backdrop-blur-md rounded-2xl border border-slate-700 shadow-2xl p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                  Application Recovery
                </h1>
                <p className="text-xs text-slate-400">
                  {componentName || "Root System"} &bull; Safe execution mode
                </p>
              </div>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed mb-6">
              {description}
            </p>

            {error?.message && (
              <div className="p-3.5 bg-slate-900/80 rounded-xl border border-slate-700/80 mb-6 text-xs text-rose-300 font-mono break-words">
                {error.message}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2.5 mb-6">
              <button
                type="button"
                onClick={this.resetErrorBoundary}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-sm transition-all cursor-pointer active:scale-95"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Try Again</span>
              </button>

              <button
                type="button"
                onClick={this.handleReloadApp}
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl text-xs font-semibold transition-all cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reload App</span>
              </button>

              <button
                type="button"
                onClick={this.handleGoHome}
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl text-xs font-semibold transition-all cursor-pointer"
              >
                <Home className="w-3.5 h-3.5" />
                <span>Go to Dashboard</span>
              </button>

              <button
                type="button"
                onClick={this.handleClearStorageAndReset}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs text-slate-400 hover:text-slate-200 hover:underline transition-all cursor-pointer ml-auto"
                title="Clears cached active routes and returns to Dashboard"
              >
                Clear Route Cache
              </button>
            </div>

            {/* Collapsible Error Diagnostics */}
            <div className="border-t border-slate-700/80 pt-4">
              <button
                type="button"
                onClick={() => this.setState({ showDetails: !showDetails })}
                className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-300 font-medium cursor-pointer"
              >
                <Bug className="w-3.5 h-3.5 text-slate-500" />
                <span>Technical Diagnostics</span>
                {showDetails ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>

              {showDetails && (
                <div className="mt-3 relative">
                  <button
                    type="button"
                    onClick={this.handleCopyDetails}
                    className="absolute top-2 right-2 inline-flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-[10px] text-slate-300 font-medium transition-colors cursor-pointer"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>

                  <pre className="p-3 bg-slate-950 rounded-lg text-[11px] font-mono text-slate-400 overflow-x-auto max-h-56 leading-relaxed select-text">
                    {error?.stack || error?.message || "No error stack"}
                    {errorInfo?.componentStack && `\n\nComponent Hierarchy:${errorInfo.componentStack}`}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    // 2. WIDGET / INLINE LEVEL ERROR (For smaller components like visual comparison, cards, charts)
    if (level === "widget" || level === "inline") {
      return (
        <div
          id={`widget-error-${componentName?.toLowerCase().replace(/\s+/g, "-") || "fallback"}`}
          className="w-full p-4 sm:p-5 bg-rose-50/50 border border-rose-200/80 rounded-xl my-2 text-slate-800"
        >
          <div className="flex items-start gap-3">
            <div className="p-2 bg-rose-100 text-rose-600 rounded-lg shrink-0 mt-0.5">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-xs sm:text-sm font-semibold text-slate-900">
                {title}
              </h4>
              <p className="text-xs text-slate-600 mt-1 leading-normal">
                {error?.message || description}
              </p>

              <div className="flex items-center gap-2 mt-3">
                <button
                  type="button"
                  onClick={this.resetErrorBoundary}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold shadow-2xs transition-all cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Retry Component</span>
                </button>

                <button
                  type="button"
                  onClick={() => this.setState({ showDetails: !showDetails })}
                  className="text-xs text-slate-500 hover:text-slate-800 underline underline-offset-2 ml-2 cursor-pointer"
                >
                  {showDetails ? "Hide details" : "Show details"}
                </button>
              </div>

              {showDetails && (
                <pre className="mt-3 p-2.5 bg-slate-900 text-rose-300 rounded text-[10px] font-mono overflow-x-auto max-h-36 leading-relaxed select-text">
                  {error?.stack || error?.message}
                </pre>
              )}
            </div>
          </div>
        </div>
      );
    }

    // 3. PAGE LEVEL ERROR (Embedded inside standard AppLayout, preserving sidebar & navigation)
    return (
      <div
        id={`page-error-${componentName?.toLowerCase().replace(/\s+/g, "-") || "fallback"}`}
        className="flex-1 min-h-[420px] flex items-center justify-center p-6 sm:p-10 select-none animate-in fade-in duration-200"
      >
        <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 sm:p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto mb-4 shadow-2xs">
            <AlertTriangle className="w-7 h-7" />
          </div>

          <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-[11px] font-semibold tracking-wide uppercase mb-3">
            {componentName || "Component Safety Shield"}
          </span>

          <h2 className="text-base sm:text-lg font-bold text-slate-900 mb-2">
            {title}
          </h2>

          <p className="text-xs text-slate-600 leading-relaxed max-w-md mx-auto mb-5">
            {description}
          </p>

          {error?.message && (
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-rose-700 font-mono text-left mb-6 break-words max-h-24 overflow-y-auto">
              {error.message}
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 mb-6">
            <button
              type="button"
              onClick={this.resetErrorBoundary}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#2b61d6] hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-2xs transition-all cursor-pointer active:scale-98"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Retry Component</span>
            </button>

            <button
              type="button"
              onClick={this.handleGoHome}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-all cursor-pointer"
            >
              <Home className="w-3.5 h-3.5" />
              <span>Back to Dashboard</span>
            </button>
          </div>

          <div className="border-t border-slate-100 pt-4 text-left">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => this.setState({ showDetails: !showDetails })}
                className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 font-medium cursor-pointer"
              >
                <Bug className="w-3.5 h-3.5" />
                <span>Technical Stack Trace</span>
                {showDetails ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>

              {showDetails && (
                <button
                  type="button"
                  onClick={this.handleCopyDetails}
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
                      <span>Copy Log</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {showDetails && (
              <pre className="mt-3 p-3 bg-slate-900 text-slate-300 rounded-lg text-[10px] font-mono overflow-x-auto max-h-48 leading-relaxed select-text">
                {error?.stack || error?.message || "No error stack available"}
                {errorInfo?.componentStack && `\n\nComponent Hierarchy:${errorInfo.componentStack}`}
              </pre>
            )}
          </div>
        </div>
      </div>
    );
  }
}
