import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle, MinusCircle, ListChecks, Download, FileSpreadsheet, Mail, Send, Sparkles, Clock, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { exportQAVerificationReceiptPDF } from "@/lib/export-qa-pdf";
import { exportQAChecklistToExcel } from "@/lib/export-qa-excel";
import { SendApprovalEmailModal } from "./SendApprovalEmailModal";
import { getActiveSession } from "@/lib/session";

interface FinalChecklistProps {
  checklists: any[];
  answers: Record<string, any>;
  campaignMeta?: {
    campaignName?: string;
    team?: string;
    country?: string;
    versionName?: string;
    userEmail?: string;
    createdBy?: string;
    assignedTo?: string;
    assignedQa?: string;
    campaignStatus?: string;
    campaignId?: string;
    qaType?: string;
  };
  dispatchedRecords?: any[];
}

export function FinalChecklist({ checklists, answers, campaignMeta, dispatchedRecords: initialDispatchedRecords = [] }: FinalChecklistProps) {
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [records, setRecords] = useState<any[]>(initialDispatchedRecords);

  useEffect(() => {
    if (initialDispatchedRecords && initialDispatchedRecords.length > 0) {
      setRecords(initialDispatchedRecords);
    }
  }, [initialDispatchedRecords]);

  useEffect(() => {
    const handleSaved = (e: any) => {
      if (e.detail) {
        setRecords(prev => [e.detail, ...prev.filter(r => r.id !== e.detail.id)]);
      }
    };
    window.addEventListener("campaign_dispatched_saved", handleSaved);
    return () => window.removeEventListener("campaign_dispatched_saved", handleSaved);
  }, []);

  if (checklists.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-400">
        <ListChecks className="w-12 h-12 mb-3 text-slate-300" />
        <p>No checkpoints were defined for this campaign.</p>
      </div>
    );
  }

  // Group checklists by stage (1-7 and 0 for global)
  const stages = [1, 2, 3, 4, 5, 6, 7, 0];
  const stageNames: Record<number, string> = {
    1: "Details & Source",
    2: "Visual Comparison",
    3: "Alt & Alias Tags",
    4: "Link Validation",
    5: "Grammar & Spell Check",
    6: "Review & Decision",
    7: "Final Checklist",
    0: "Global Checkpoints (All Stages)"
  };

  const handleExportPDF = () => {
    exportQAVerificationReceiptPDF({
      campaignName: campaignMeta?.campaignName || "Campaign Verification Summary",
      team: campaignMeta?.team || "QA Team",
      country: campaignMeta?.country || "Global",
      versionName: campaignMeta?.versionName || "v1",
      userEmail: campaignMeta?.userEmail || getActiveSession()?.email || "",
      campaignStatus: campaignMeta?.campaignStatus || "In Progress",
      checklists,
      answers
    });
  };

  const handleExportExcel = () => {
    exportQAChecklistToExcel({
      campaignName: campaignMeta?.campaignName || "Campaign Verification Summary",
      team: campaignMeta?.team || "QA Team",
      country: campaignMeta?.country || "Global",
      versionName: campaignMeta?.versionName || "v1",
      userEmail: campaignMeta?.userEmail || getActiveSession()?.email || "",
      campaignStatus: campaignMeta?.campaignStatus || "In Progress",
      qaType: campaignMeta?.qaType,
      checklists,
      answers
    });
  };
  
  return (
    <div className="space-y-6 max-w-4xl mx-auto w-full pb-10 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 rounded-lg">
            <ListChecks className="w-6 h-6 text-indigo-700" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Campaign Checklist Summary</h2>
            <p className="text-sm text-slate-500">Review all checkpoints and their statuses across all stages.</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Send Approval Email Button */}
          <Button
            type="button"
            onClick={() => setShowApprovalModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2 rounded-lg shadow-sm transition-all flex items-center gap-1.5 cursor-pointer hover:shadow"
          >
            <Mail className="w-4 h-4" />
            <span>
              {(campaignMeta?.campaignStatus || "").toLowerCase().includes("approved")
                ? "Send Approval Email"
                : "Send Callouts"}
            </span>
          </Button>

          <Button
            type="button"
            onClick={handleExportPDF}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-2 rounded-lg shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Export PDF Receipt</span>
          </Button>

          <Button
            type="button"
            onClick={handleExportExcel}
            className="bg-[#107c41] hover:bg-[#0b5c30] text-white font-bold text-xs px-3.5 py-2 rounded-lg shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Export Excel (.csv/.xlsx)</span>
          </Button>
        </div>
      </div>

      {/* Prominent QA Approval Email Card Banner */}
      <div className="bg-gradient-to-r from-blue-50 via-indigo-50/70 to-slate-50 border border-blue-200/80 rounded-xl p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-300">
              <Sparkles className="w-3 h-3 text-blue-600" />
              Approval Notification
            </span>
            <span className="text-xs text-slate-500 font-medium">
              Ready to handoff QA results?
            </span>
          </div>
          <h3 className="text-sm font-bold text-slate-900">
            Dispatch CQA Approval Email to Team Members
          </h3>
          <p className="text-xs text-slate-600 max-w-xl leading-relaxed">
            Select any team stakeholder, review the pre-formatted approval notification with your OneDrive checklist upload confirmation, add custom feedback, and send with CC options.
          </p>
        </div>

        <Button
          type="button"
          onClick={() => setShowApprovalModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-xs transition-all flex items-center gap-2 shrink-0 cursor-pointer"
        >
          <Send className="w-3.5 h-3.5" />
          <span>Draft & Send Approval</span>
        </Button>
      </div>

      <div className="space-y-6">
        {stages.map(stageNum => {
          const items = checklists.filter(c => c.stage === stageNum);
          if (items.length === 0) return null;
          
          return (
            <Card key={stageNum} className="border-slate-200 shadow-sm overflow-hidden">
              <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-3 px-4">
                <CardTitle className="text-sm text-slate-700 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-white border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-500 shadow-xs">
                    {stageNum === 0 ? '*' : stageNum}
                  </div>
                  {stageNum === 0 ? "Global Checkpoints (All Stages)" : `Stage ${stageNum}: ${stageNames[stageNum] || `Stage ${stageNum}`}`}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-slate-100">
                  {items.map(item => {
                    const ans = answers[item.id] || { status: null, text: "" };
                    const isChecked = ans.status === "Checked";
                    const isNA = ans.status === "N/A";
                    const isMissing = !ans.status;

                    return (
                      <div key={item.id} className="p-4 hover:bg-slate-50/50 transition-colors flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-800 font-medium">{item.text}</p>
                          {item.requiresInput && isChecked && ans.text && (
                            <div className="mt-1.5 p-2 bg-indigo-50/50 border border-indigo-100 rounded text-sm text-indigo-900">
                              <span className="font-semibold text-indigo-700 mr-2">Input / Note:</span> 
                              {ans.text}
                            </div>
                          )}
                        </div>
                        
                        <div className="shrink-0 flex items-center">
                          {isChecked && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Checked
                            </span>
                          )}
                          {isNA && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                              <MinusCircle className="w-3.5 h-3.5" /> N/A
                            </span>
                          )}
                          {isMissing && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-700">
                              <XCircle className="w-3.5 h-3.5" /> Missed
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Dispatched History: Callouts & Approval Records */}
      <Card className="border-slate-200 shadow-sm overflow-hidden mt-6">
        <CardHeader className="bg-slate-50/70 border-b border-slate-100 py-3.5 px-4 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-[#2b61d6]" />
            <CardTitle className="text-sm font-bold text-slate-800">
              Dispatched Callouts & Approval Records
            </CardTitle>
          </div>
          {records.length > 0 && (
            <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 border border-blue-200">
              {records.length} {records.length === 1 ? 'Record' : 'Records'} Stored in Database
            </span>
          )}
        </CardHeader>
        <CardContent className="p-4 bg-white">
          {records.length === 0 ? (
            <div className="py-6 px-4 text-center text-slate-500 bg-slate-50/50 rounded-lg border border-dashed border-slate-200">
              <Mail className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs font-semibold text-slate-700">No Dispatched Callouts or Approvals Yet</p>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                Once callouts or approval emails are sent for this campaign, the callout bullet points and approval records will save automatically in the database and appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {records.map((rec: any, idx: number) => {
                const isApproved = rec.type === "Approval Email" || rec.type === "Campaign Approval" || rec.status === "Approved";
                const formattedDate = rec.timestamp ? new Date(rec.timestamp).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true
                }) : "Just now";

                const clientBullets = rec.clientCallouts || [];
                const ownerBullets = rec.ownerCallouts || [];

                return (
                  <div 
                    key={rec.id || idx}
                    className="border border-slate-200 rounded-lg p-4 bg-slate-50/40 hover:bg-slate-50 transition-colors space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "px-2.5 py-0.5 text-xs font-bold rounded-full border",
                          isApproved 
                            ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                            : "bg-amber-100 text-amber-800 border-amber-300"
                        )}>
                          {isApproved ? "✓ Campaign Approved" : "✉ Callouts Dispatched"}
                        </span>
                        {rec.qaType && (
                          <span className="px-2 py-0.5 text-xs font-bold rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                            {rec.qaType}
                          </span>
                        )}
                        <span className="text-xs text-slate-500 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {formattedDate}
                        </span>
                      </div>
                      <div className="text-xs text-slate-600">
                        Sender: <strong className="text-slate-800">{rec.senderName || rec.sender || "QA Lead"}</strong>
                      </div>
                    </div>

                    {rec.subject && (
                      <div className="text-xs text-slate-700">
                        <span className="font-semibold text-slate-500">Subject: </span>
                        <span className="font-medium text-slate-900">{rec.subject}</span>
                      </div>
                    )}

                    {rec.recipient && (
                      <div className="text-xs text-slate-600">
                        <span className="font-semibold text-slate-500">Recipient: </span>
                        <span>{rec.recipientName || rec.recipient}</span> {rec.recipient && rec.recipientName ? `<${rec.recipient}>` : ""}
                      </div>
                    )}

                    {rec.approvedText && (
                      <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-md text-xs text-emerald-900">
                        <strong className="block text-emerald-800 font-semibold mb-1">Approval Sign-Off:</strong>
                        {rec.approvedText}
                      </div>
                    )}

                    {clientBullets.length > 0 && (
                      <div className="p-3 bg-white border border-slate-200 rounded-md space-y-1.5">
                        <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-blue-600" />
                          Client Callouts ({clientBullets.length}):
                        </span>
                        <ul className="list-disc pl-5 space-y-1 text-xs text-slate-700">
                          {clientBullets.map((b: any, bIdx: number) => (
                            <li key={b.id || bIdx}>
                              {typeof b === "string" ? b : b.text}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {ownerBullets.length > 0 && (
                      <div className="p-3 bg-white border border-slate-200 rounded-md space-y-1.5">
                        <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-amber-600" />
                          Campaign Owner Callouts ({ownerBullets.length}):
                        </span>
                        <ul className="list-disc pl-5 space-y-1 text-xs text-slate-700">
                          {ownerBullets.map((b: any, bIdx: number) => (
                            <li key={b.id || bIdx}>
                              {typeof b === "string" ? b : b.text}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="text-[10px] text-slate-400 pt-1 flex items-center justify-between">
                      <span>✓ Saved in Database (Screenshots sent via email only)</span>
                      <span>ID: {rec.id ? String(rec.id).slice(0, 8) : `rec_${idx}`}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Send Approval Email Modal */}
      {showApprovalModal && (
        <SendApprovalEmailModal
          isOpen={showApprovalModal}
          onClose={() => setShowApprovalModal(false)}
          campaignMeta={{
            campaignName: campaignMeta?.campaignName,
            team: campaignMeta?.team,
            country: campaignMeta?.country,
            versionName: campaignMeta?.versionName,
            userEmail: campaignMeta?.userEmail,
            createdBy: campaignMeta?.createdBy,
            assignedTo: (campaignMeta as any)?.assignedTo,
            assignedQa: (campaignMeta as any)?.assignedQa,
            campaignStatus: campaignMeta?.campaignStatus,
            campaignId: campaignMeta?.campaignId,
            qaType: campaignMeta?.qaType
          }}
          checklists={checklists}
          answers={answers}
        />
      )}
    </div>
  );
}
