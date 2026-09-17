import React from 'react';
import { Save, Trash2, ArrowLeft, X, FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SaveDraftOrDiscardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveDraft: () => Promise<void> | void;
  onDiscard: () => Promise<void> | void;
  campaignName?: string;
  isProcessing?: boolean;
  isExistingCampaign?: boolean;
}

export function SaveDraftOrDiscardModal({
  isOpen,
  onClose,
  onSaveDraft,
  onDiscard,
  campaignName,
  isProcessing = false,
  isExistingCampaign = false,
}: SaveDraftOrDiscardModalProps) {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
      id="save-draft-modal-backdrop"
    >
      <div 
        className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
        id="save-draft-modal-card"
      >
        {/* Modal Header */}
        <div className="bg-amber-50/80 border-b border-amber-100 p-5 flex items-start justify-between gap-3 shrink-0">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0 text-amber-700 shadow-2xs">
              <FileQuestion className="w-6 h-6" />
            </div>
            <div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px] font-bold uppercase tracking-wider mb-1 border border-amber-200">
                {isExistingCampaign ? "Campaign in Progress" : "Unsaved Campaign"}
              </span>
              <h3 className="text-base font-bold text-slate-900 leading-tight">
                Save Campaign Before Leaving?
              </h3>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                You are currently editing this campaign. If you exit without saving, you may lose your recent progress.
              </p>
            </div>
          </div>
          <button
            type="button"
            id="btn-close-draft-modal"
            onClick={onClose}
            disabled={isProcessing}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-amber-100/50 transition-colors shrink-0 cursor-pointer disabled:opacity-50"
            title="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-3 bg-white">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Campaign</span>
              <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                Active QA
              </span>
            </div>
            <p className="text-sm font-bold text-slate-900 truncate">
              {campaignName && campaignName.trim() ? campaignName.trim() : "Untitled Campaign"}
            </p>
          </div>

          <div className="text-xs text-slate-600 space-y-2">
            <p className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0 mt-1.5" />
              <span><strong>Save & Exit:</strong> Saves your current progress and checkpoints so you can resume anytime.</span>
            </p>
            <p className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-600 shrink-0 mt-1.5" />
              <span><strong>Exit Without Saving:</strong> Leaves this page immediately without saving recent changes.</span>
            </p>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="bg-slate-50/80 border-t border-slate-200 p-4 flex flex-col-reverse sm:flex-row items-center justify-between gap-2.5">
          <Button
            type="button"
            id="btn-continue-editing"
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={isProcessing}
            className="w-full sm:w-auto text-xs text-slate-600 hover:text-slate-900 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5 mr-1" />
            Stay Here
          </Button>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              type="button"
              id="btn-discard-remove-campaign"
              variant="destructive"
              size="sm"
              onClick={onDiscard}
              disabled={isProcessing}
              className="flex-1 sm:flex-initial text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white gap-1.5 cursor-pointer shadow-2xs"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {isProcessing ? "Exiting..." : "Exit Without Saving"}
            </Button>

            <Button
              type="button"
              id="btn-save-campaign-draft"
              size="sm"
              onClick={onSaveDraft}
              disabled={isProcessing}
              className="flex-1 sm:flex-initial text-xs font-bold bg-[#2b61d6] hover:bg-blue-700 text-white gap-1.5 cursor-pointer shadow-2xs"
            >
              <Save className="w-3.5 h-3.5" />
              {isProcessing ? "Saving..." : "Save & Exit"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
