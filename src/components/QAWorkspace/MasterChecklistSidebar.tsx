import React, { useState, useRef, useEffect } from 'react';
import { CheckSquare, X, ChevronLeft, CheckCircle2, MinusCircle, HelpCircle, Check, XCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getNormalizedStage } from '@/lib/checklist-storage';

export interface ChecklistItem {
  id: string;
  text: string;
  stage?: number;
  requiresInput?: boolean;
  inputPlaceholder?: string;
  options?: string[];
}

interface MasterChecklistSidebarProps {
  checklists: ChecklistItem[];
  answers: Record<string, { status: string; text?: string; dropdownValue?: string }>;
  onToggleItem?: (itemId: string, newStatus: 'Checked' | null) => void;
  disabled?: boolean;
}

export function MasterChecklistSidebar({ 
  checklists, 
  answers, 
  onToggleItem,
  disabled 
}: MasterChecklistSidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear timer on unmount
  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
      }
    };
  }, []);

  const handleMouseEnter = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
    }
    // 250ms buffer so user can cross between trigger tab and drawer without flickering
    hoverTimerRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 250);
  };

  const getStageName = (stage: number) => {
    const stages: Record<number, string> = {
      1: "1. Details & Source",
      2: "2. Visual Comparison",
      3: "3. Alt & Alias Tags",
      4: "4. Link Validation",
      5: "5. Grammar & Spell Check",
      6: "6. Review & Launch"
    };
    return stages[stage] || `Stage ${stage}`;
  };

  // Group checklists strictly by normalized stage (1-6)
  const grouped = checklists.reduce((acc, item) => {
    const s = getNormalizedStage(item);
    if (!acc[s]) acc[s] = [];
    acc[s].push(item);
    return acc;
  }, {} as Record<number, ChecklistItem[]>);

  // Calculate overall metrics
  const totalCount = checklists.length;
  const completedCount = checklists.filter(i => {
    const s = answers[i.id]?.status;
    return s === 'Checked' || s === 'N/A';
  }).length;
  const overallPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <>
      {/* Trigger Zone / Button - Opens on Hover & Clicks */}
      <div 
        id="master-checklist-hover-trigger"
        className={cn(
          "fixed top-1/2 right-0 -translate-y-1/2 z-[100] flex items-center transition-transform duration-300 select-none",
          isOpen ? "translate-x-full opacity-0 pointer-events-none" : "translate-x-0 opacity-100"
        )}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={() => setIsOpen(true)}
        title="Hover to view Master Checklist"
      >
        <button 
          type="button"
          className="bg-[#2b61d6] hover:bg-blue-700 text-white p-2.5 rounded-l-lg shadow-xl flex flex-col items-center gap-2 transition-all border border-r-0 border-blue-500 cursor-pointer group"
        >
          <ChevronLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          <span style={{ writingMode: 'vertical-rl' }} className="font-bold text-[11px] tracking-widest uppercase">
            MASTER CHECKLIST
          </span>
          <span className={cn(
            "text-[10px] font-black px-1.5 py-0.5 rounded-full mt-1 border",
            completedCount === totalCount && totalCount > 0
              ? "bg-emerald-500 text-white border-emerald-400"
              : "bg-white text-[#2b61d6] border-blue-200"
          )}>
            {completedCount}/{totalCount}
          </span>
        </button>
      </div>

      {/* Backdrop for click-away */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/20 backdrop-blur-xs z-[100] transition-opacity"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar Panel - Stays open on hover, closes when mouse comes out */}
      <div 
        id="master-checklist-sidebar-drawer"
        className={cn(
          "fixed top-0 right-0 h-full w-[440px] max-w-[94vw] bg-white shadow-2xl border-l border-slate-200 z-[101] transition-transform duration-300 flex flex-col",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Header */}
        <div className="p-4 bg-slate-900 text-white shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-blue-600 rounded-md">
                <CheckSquare className="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 className="font-bold text-sm text-white">Master QA Checklist</h2>
                <p className="text-[11px] text-slate-400">Green = Marked / Passed • Red = Pending</p>
              </div>
            </div>
            <button 
              type="button"
              onClick={() => setIsOpen(false)} 
              className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors cursor-pointer"
              title="Close Checklist"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Overall Progress Bar */}
          <div className="mt-3 pt-3 border-t border-slate-800">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-slate-300 font-medium">Overall Completion</span>
              <span className={cn("font-bold", completedCount === totalCount && totalCount > 0 ? "text-emerald-400" : "text-amber-400")}>
                {completedCount} of {totalCount} ({overallPercent}%)
              </span>
            </div>
            <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
              <div 
                className={cn(
                  "h-full rounded-full transition-all duration-300",
                  completedCount === totalCount && totalCount > 0
                    ? "bg-emerald-500"
                    : "bg-gradient-to-r from-blue-500 to-emerald-500"
                )}
                style={{ width: `${overallPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* List of Stages & Checkpoints */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-4 bg-slate-100/70">
          {Object.entries(grouped)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([stageStr, items]) => {
              const stage = Number(stageStr);
              const total = items.length;
              const completed = items.filter(i => {
                const s = answers[i.id]?.status;
                return s === 'Checked' || s === 'N/A';
              }).length;
              const isStageDone = completed === total && total > 0;

              return (
                <div 
                  key={stage} 
                  className={cn(
                    "rounded-xl border shadow-2xs overflow-hidden bg-white transition-colors",
                    isStageDone ? "border-emerald-300" : "border-rose-200"
                  )}
                >
                  {/* Stage-wise Header */}
                  <div className={cn(
                    "flex items-center justify-between px-3.5 py-2.5 border-b",
                    isStageDone ? "bg-emerald-50/90 border-emerald-200" : "bg-rose-50/70 border-rose-200"
                  )}>
                    <div className="flex items-center gap-2 min-w-0">
                      {isStageDone ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                      )}
                      <h3 className={cn("text-xs font-bold truncate", isStageDone ? "text-emerald-950" : "text-rose-950")}>
                        {getStageName(stage)}
                      </h3>
                    </div>
                    <span className={cn(
                      "px-2 py-0.5 rounded-full text-[10.5px] font-bold border shrink-0",
                      isStageDone 
                        ? "bg-emerald-100 text-emerald-800 border-emerald-300" 
                        : "bg-rose-100 text-rose-800 border-rose-300"
                    )}>
                      {isStageDone ? `All ${total} Passed` : `${completed}/${total} Marked (${total - completed} Pending)`}
                    </span>
                  </div>

                  {/* Stage Checkpoints */}
                  <div className="p-2 space-y-1.5">
                    {items.map((item, idx) => {
                      const ans = answers[item.id] as any;
                      const isChecked = ans?.status === 'Checked';
                      const isNA = ans?.status === 'N/A';
                      const isMarked = isChecked || isNA;

                      return (
                        <div 
                          key={item.id} 
                          className={cn(
                            "flex items-start gap-2.5 p-2 rounded-lg border text-xs transition-colors",
                            isMarked
                              ? "bg-emerald-50/70 border-emerald-200 text-emerald-950"
                              : "bg-rose-50/60 border-rose-200 text-rose-950"
                          )}
                        >
                          {/* Interactive status toggle or display icon */}
                          {onToggleItem ? (
                            <button
                              type="button"
                              disabled={disabled}
                              onClick={() => onToggleItem(item.id, isChecked ? null : 'Checked')}
                              className={cn(
                                "w-4 h-4 rounded mt-0.5 shrink-0 border flex items-center justify-center transition-all cursor-pointer",
                                isChecked 
                                  ? "bg-emerald-600 border-emerald-600 text-white" 
                                  : isNA
                                  ? "bg-slate-500 border-slate-500 text-white"
                                  : "border-rose-400 bg-white hover:border-rose-600 text-transparent"
                              )}
                              title={isChecked ? "Marked as Checked (Click to uncheck)" : "Unmarked / Pending (Click to check)"}
                            >
                              {isChecked ? (
                                <Check className="w-3 h-3 stroke-[3]" />
                              ) : isNA ? (
                                <MinusCircle className="w-3 h-3" />
                              ) : (
                                <X className="w-3 h-3 text-rose-500" />
                              )}
                            </button>
                          ) : (
                            <div className="mt-0.5 shrink-0">
                              {isChecked ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              ) : isNA ? (
                                <MinusCircle className="w-4 h-4 text-slate-500" />
                              ) : (
                                <XCircle className="w-4 h-4 text-rose-500" />
                              )}
                            </div>
                          )}

                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className={cn(
                                "text-xs leading-snug break-words",
                                isMarked ? "text-emerald-950 font-medium" : "text-rose-950 font-medium"
                              )}>
                                <span className={cn("font-bold mr-1.5", isMarked ? "text-emerald-700" : "text-rose-700")}>
                                  {idx + 1}.
                                </span>
                                {item.text}
                              </p>
                              <span className={cn(
                                "px-1.5 py-0.5 rounded text-[9.5px] font-bold shrink-0 border uppercase tracking-wider",
                                isChecked
                                  ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                                  : isNA
                                  ? "bg-slate-100 text-slate-700 border-slate-300"
                                  : "bg-rose-100 text-rose-700 border-rose-300"
                              )}>
                                {isChecked ? "Marked" : isNA ? "N/A" : "Red / Pending"}
                              </span>
                            </div>
                            {(ans?.text || ans?.dropdownValue) && (
                              <div className="mt-1.5 p-1.5 bg-white/80 border border-slate-200/80 rounded text-[11px] text-slate-700 italic break-words">
                                "{ans.dropdownValue || ans.text}"
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </>
  );
}
