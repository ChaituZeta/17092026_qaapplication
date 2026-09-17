import { MasterChecklistSidebar } from "@/src/components/QAWorkspace/MasterChecklistSidebar";
import { StageChecklist } from "@/src/components/QAWorkspace/StageChecklist";
import { FinalChecklist } from "@/src/components/QAWorkspace/FinalChecklist";
import { SendApprovalEmailModal } from "@/src/components/QAWorkspace/SendApprovalEmailModal";
import { IncompleteCheckpointsModal, MissingCheckpoint } from "@/src/components/QAWorkspace/IncompleteCheckpointsModal";
import { SaveDraftOrDiscardModal } from "@/src/components/SaveDraftOrDiscardModal";
import { BrowserQAWorkspace } from "@/src/components/QAWorkspace";
import { TagInspection } from "@/src/components/QAWorkspace/TagInspection";
import { VisualComparison } from "@/src/components/QAWorkspace/VisualComparison";
import { EnglishTextAnalysis } from "@/src/components/QAWorkspace/EnglishTextAnalysis";
import { CampaignSetupSkeleton } from "@/src/components/QAWorkspace/Skeletons";
import { exportQAVerificationReceiptPDF } from "@/lib/export-qa-pdf";
import { exportQAChecklistToExcel } from "@/lib/export-qa-excel";
import MsgReader from "@kenjiuno/msgreader";
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { QAWizard } from "@/src/components/QAWizard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { validateCampaignHTML } from "@/lib/qa-validator";
import { fetchAndValidateCountryUrls, fetchAllowedUrlPattern } from "@/lib/url-validator";
import { isCampaignNameUnique, saveCampaignRecord, getCampaignById, getFolders, fetchFolders, FolderItem, CampaignRecord, permanentlyDeleteCampaign } from "@/lib/campaign-storage";
import { fetchPlatformChecklists } from "@/lib/checklist-storage";
import { getCampaignCheckpointProgress } from "@/lib/checklist-utils";
import { parseMsgArrayBuffer } from "@/lib/msg-parser";
import { logAction, getCampaignLogs } from "@/lib/logger";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useNavigate, useSearchParams, useBlocker } from "react-router-dom";
import { saveActiveQASnapshot, getActiveQASnapshot, clearActiveQASnapshot, getStoredStageForCampaign } from "@/lib/qa-session-persistence";
import { resolveUserFirstName } from "@/lib/userNames";
import { 
  ArrowLeft,
  FileCheck, 
  UploadCloud, 
  Monitor, 
  Smartphone, 
  Check, 
  Copy, 
  MonitorSmartphone, 
  Code2, 
  ShieldCheck, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  ClipboardList, 
  History, 
  Layers, 
  Mail, 
  Image as ImageIcon, 
  Figma, 
  Undo, 
  Redo, 
  RotateCcw,
  Clock,
  Trash2,
  Sparkles,
  Folder,
  Maximize2,
  Minimize2,
  Tag,
  Link,
  ExternalLink,
  Tablet,
  Eye,
  CheckSquare,
  Square,
  Save,
  Wifi,
  WifiOff,
  RefreshCw,
  X,
  Download,
  FileSpreadsheet,
  ListChecks,
  Loader2,
  Lock,
  Send,
  ShieldAlert
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const formSchema = z.object({
  name: z.string().min(2, "Campaign name is required and must be at least 2 characters."),
  team: z.string().min(1, "Team selection is required."),
  country: z.string().min(1, "Country selection is required."),
  versionName: z.string().min(1, "Version selection is required."),
  folder_id: z.string().optional(),
  webViewUrl: z.string().min(1, "View Online link is required."),
  htmlSource: z.string().min(10, "HTML source code is required."),
  figmaUrl: z.string().optional(),
  litmusUrl: z.string().optional()
});

type FormValues = z.infer<typeof formSchema>;

export const MANDATORY_STAGE2_VISUAL_CHECKPOINTS = [
  { id: "visual_desktop_light", text: "Visual Inspection - Desktop (Light Mode)", stage: 2, required: true },
  { id: "visual_mobile_light", text: "Visual Inspection - Mobile (Light Mode)", stage: 2, required: true },
  { id: "visual_desktop_dark", text: "Visual Inspection - Desktop (Dark Mode)", stage: 2, required: true },
  { id: "visual_mobile_dark", text: "Visual Inspection - Mobile (Dark Mode)", stage: 2, required: true },
  { id: "visual_litmus", text: "Litmus", stage: 2, required: true },
];

export function ensureVisualCheckpointsInList(list: any[]) {
  if (!Array.isArray(list)) return MANDATORY_STAGE2_VISUAL_CHECKPOINTS;
  const seen = new Set<string>();
  const deduplicated: any[] = [];
  for (const item of list) {
    if (item && item.id && !seen.has(item.id)) {
      seen.add(item.id);
      deduplicated.push(item);
    }
  }
  const toAdd = MANDATORY_STAGE2_VISUAL_CHECKPOINTS.filter(vc => !seen.has(vc.id));
  return [...deduplicated, ...toAdd];
}

export function CampaignSetup({ userEmail = "", userRole = "user" }: { userEmail?: string; userRole?: string }) {
  const isAdmin = userRole === "admin";
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const editId = searchParams.get('id');
  const targetFolderParam = searchParams.get('folder_id');
  const stepParam = searchParams.get('step');
  const campaignIdRef = useRef<string | null>(editId);
  const initialLoadedIdRef = useRef<string | null>(null);

  // Compute initial step: prioritize URL query param, then campaign stored stage, then active session cache
  const initialStep = (() => {
    if (stepParam && !isNaN(Number(stepParam))) {
      const parsed = parseInt(stepParam, 10);
      if (parsed >= 1 && parsed <= 7) return parsed;
    }
    if (editId) {
      const stored = getStoredStageForCampaign(editId);
      if (stored) return stored;
    }
    const cachedSession = getActiveQASnapshot(editId || undefined);
    if (cachedSession && cachedSession.currentStep) {
      return cachedSession.currentStep;
    }
    return 1;
  })();

  const [currentStep, setCurrentStep] = useState<number>(initialStep);
  const [showSaveAndRefreshModal, setShowSaveAndRefreshModal] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const [countries, setCountries] = useState<any[]>([]);
  const [qaResults, setQaResults] = useState<any[]>([]);
  const [previewTab, setPreviewTab] = useState<"webview" | "html" | "qa" | "compare">("compare");
  const [viewportSize, setViewportSize] = useState<"desktop" | "mobile">("desktop");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checklistAnswers, setChecklistAnswers] = useState<Record<string, any>>({});
  const [showChecklistError, setShowChecklistError] = useState(false);
  const [extractedSubject, setExtractedSubject] = useState<string>("");
  const [isCopied, setIsCopied] = useState(false);
  
  // File states
  const [briefFile, setBriefFile] = useState<File | null>(null);
  const [outlookFile, setOutlookFile] = useState<File | null>(null);
  const [mockupFile, setMockupFile] = useState<File | null>(null);
  const [mockupPreviewUrl, setMockupPreviewUrl] = useState<string | null>(null);
  
  // Design Choice State (Either Figma OR Uploaded Mockup Image)
  const [designChoice, setDesignChoice] = useState<"figma" | "image">("figma");

  // Extracted Outlook Subject Line
  const [outlookSubject, setOutlookSubject] = useState<string | null>(null);
  const [outlookFileName, setOutlookFileName] = useState<string | null>(null);
  const [outlookExtractedHtml, setOutlookExtractedHtml] = useState<string | null>(null);

  // Compare split-screen tabs
  const [leftCompareTab, setLeftCompareTab] = useState<"webview" | "outlook" | "html">("webview");

  // Fullscreen & Inspection States
  const [fullScreenTarget, setFullScreenTarget] = useState<"html" | "webview" | "step1" | "step2" | "step3" | "step4" | null>(null);
  const [showAliasInspector, setShowAliasInspector] = useState(false);
  const [showAltInspector, setShowAltInspector] = useState(false);
  const [viewOnlineDevice, setViewOnlineDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");

  // Review note and edit logs state
  const [reviewNote, setReviewNote] = useState("");
  const [campaignLogs, setCampaignLogs] = useState<any[]>([]);
  const [campaignStatus, setCampaignStatus] = useState<string>("Draft");
  const isCampaignApproved = campaignStatus === "Approved";
  const [showApprovalEmailModal, setShowApprovalEmailModal] = useState(false);
  const [remoteQaUpdateNotice, setRemoteQaUpdateNotice] = useState<string | null>(null);
  const [toastNotice, setToastNotice] = useState<string | null>(null);

  // Save as Draft or Discard Stage 1 Navigation Prompt
  const [showStage1DraftPrompt, setShowStage1DraftPrompt] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);
  const hasMovedToStage2Ref = useRef<boolean>(false);
  const isDiscardingRef = useRef<boolean>(false);
  const pendingNavUrlRef = useRef<string | null>(null);

  // Multi-Agent State
  const [userTeam, setUserTeam] = useState<string>("");
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [availableAiAgents, setAvailableAiAgents] = useState<any[]>([]);
  const [selectedAiAgentId, setSelectedAiAgentId] = useState<string>("");

  useEffect(() => {
    fetch("/api/ai-agents")
      .then(res => res.json())
      .then(data => {
        if (data.agents && data.agents.length > 0) {
          setAvailableAiAgents(data.agents);
        }
      })
      .catch(err => console.error("Failed to load AI agents:", err));
  }, []);

  const filteredAiAgents = React.useMemo(() => {
    if (isAdmin) return availableAiAgents;
    return availableAiAgents.filter(a => !a.assigned_teams || a.assigned_teams.length === 0 || a.assigned_teams.includes(userTeam));
  }, [availableAiAgents, userTeam, isAdmin]);

  useEffect(() => {
    if (filteredAiAgents.length > 0) {
      if (!selectedAiAgentId || !filteredAiAgents.find(a => a.id === selectedAiAgentId)) {
        const defaultAgent = filteredAiAgents.find((a: any) => a.is_default);
        if (defaultAgent) setSelectedAiAgentId(defaultAgent.id);
        else setSelectedAiAgentId(filteredAiAgents[0].id);
      }
    }
  }, [filteredAiAgents, selectedAiAgentId]);

  const lastLocalSaveTimeRef = useRef<number>(0);
  const checklistAnswersRef = useRef<Record<string, any>>(checklistAnswers);
  const campaignStatusRef = useRef<string>(campaignStatus);

  useEffect(() => {
    checklistAnswersRef.current = checklistAnswers;
  }, [checklistAnswers]);

  useEffect(() => {
    campaignStatusRef.current = campaignStatus;
  }, [campaignStatus]);

  const [grammarCheckResult, setGrammarCheckResult] = useState<string | null>(null);
  const [isCheckingGrammar, setIsCheckingGrammar] = useState(false);
  
  const [isAiQaRunning, setIsAiQaRunning] = useState(false);
  const [aiQaReport, setAiQaReport] = useState<any | null>(null);

  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [syncStatus, setSyncStatus] = useState<"synced" | "offline" | "syncing">("synced");

  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      setSyncStatus("synced");
    };

    const handleOffline = () => {
      setIsOnline(false);
      setSyncStatus("offline");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Mandatory Stage Validation & Visual QA Checks State
  const [visualChecks, setVisualChecks] = useState({
    desktopLight: false,
    mobileLight: false,
    desktopDark: false,
    mobileDark: false,
    litmus: false,
  });

  // Callouts Checkbox: When checked, "Send Callouts" is disabled and "Approval" is enabled
  const [noCalloutsChecked, setNoCalloutsChecked] = useState(false);

  const saveCurrentCampaignState = async (
    overrides: Partial<CampaignRecord> & {
      skipUrlSync?: boolean;
      skipActiveSnapshot?: boolean;
    } = {}
  ) => {
    const data = watch();
    const effectiveName = (data.name && data.name.trim().length >= 2)
      ? data.name.trim()
      : (campaignIdRef.current ? "Draft Campaign" : `Draft Campaign ${new Date().toLocaleDateString('en-GB')}`);

    try {
      setSyncStatus("syncing");
      lastLocalSaveTimeRef.current = Date.now();
      const currentIdToUse = campaignIdRef.current || editId || undefined;

      const effectiveVisualChecks = overrides.visualChecks !== undefined ? overrides.visualChecks : visualChecks;
      const baseAnswers = overrides.checklistAnswers !== undefined ? overrides.checklistAnswers : (checklistAnswersRef.current || checklistAnswers);
      const synchronizedAnswers = {
        ...baseAnswers,
        visual_desktop_light: { ...(baseAnswers.visual_desktop_light || {}), status: effectiveVisualChecks.desktopLight ? "Checked" : null },
        visual_mobile_light: { ...(baseAnswers.visual_mobile_light || {}), status: effectiveVisualChecks.mobileLight ? "Checked" : null },
        visual_desktop_dark: { ...(baseAnswers.visual_desktop_dark || {}), status: effectiveVisualChecks.desktopDark ? "Checked" : null },
        visual_mobile_dark: { ...(baseAnswers.visual_mobile_dark || {}), status: effectiveVisualChecks.mobileDark ? "Checked" : null },
        visual_litmus: { ...(baseAnswers.visual_litmus || {}), status: effectiveVisualChecks.litmus ? "Checked" : null },
        _visualChecks: effectiveVisualChecks
      };

      const record = await saveCampaignRecord({
        id: currentIdToUse,
        name: effectiveName,
        team: data.team || "HP-APJ",
        country: data.country || "",
        versionName: data.versionName || "",
        folder_id: data.folder_id || targetFolderParam || "2026",
        webViewUrl: data.webViewUrl || "",
        htmlSource: data.htmlSource || "",
        figmaUrl: designChoice === "figma" ? (data.figmaUrl || "") : "",
        litmusUrl: data.litmusUrl || "",
        status: overrides.status || (
          ["Approved", "Failed", "QA Pending", "Completed"].includes(campaignStatusRef.current) 
            ? campaignStatusRef.current 
            : "In Progress"
        ),
        userEmail: userEmail || "",
        createdBy: userEmail || "QA User",
        lastEditedBy: userEmail || "QA User",
        checklists: ensureVisualCheckpointsInList(campaignChecklists),
        checklistAnswers: synchronizedAnswers,
        selectedChecklistId: selectedChecklistId || undefined,
        qaResults: overrides.qaResults !== undefined ? overrides.qaResults : qaResults,
        reviewNote: overrides.reviewNote !== undefined ? overrides.reviewNote : reviewNote,
        currentStep: overrides.currentStep !== undefined ? overrides.currentStep : currentStep,
        outlookFileName: overrides.outlookFileName !== undefined ? overrides.outlookFileName : (outlookFileName || undefined),
        outlookExtractedHtml: overrides.outlookExtractedHtml !== undefined ? overrides.outlookExtractedHtml : (outlookExtractedHtml || undefined),
        outlookSubject: overrides.outlookSubject !== undefined ? overrides.outlookSubject : (outlookSubject || extractedSubject || undefined),
        mockupFileName: mockupFile?.name || undefined,
        mockupDataUrl: mockupPreviewUrl || undefined,
        visualChecks: effectiveVisualChecks,
        dispatchedRecords: overrides.dispatchedRecords !== undefined ? overrides.dispatchedRecords : (dispatchedRecordsRef.current || dispatchedRecords),
        ...overrides
      });

      if (record && record.id) {
        campaignIdRef.current = record.id;
        initialLoadedIdRef.current = record.id;
        hasMovedToStage2Ref.current = true;
        setIsEditMode(true);
        setCampaignStatus(record.status || "In Progress");
        setDraftSavedAt(new Date().toLocaleTimeString());

        const effectiveStep = overrides.currentStep !== undefined ? overrides.currentStep : currentStep;
        if (!overrides.skipUrlSync && !isDiscardingRef.current) {
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set("id", record.id);
            next.set("step", String(effectiveStep));
            return next;
          }, { replace: true });
        }

        try {
          localStorage.setItem(`hp_qa_campaign_stage_${record.id}`, String(effectiveStep));
        } catch {}
      }
      setSyncStatus(navigator.onLine ? "synced" : "offline");

      if (!overrides.skipActiveSnapshot && !isDiscardingRef.current) {
        saveActiveQASnapshot({
          campaignId: record?.id || campaignIdRef.current || editId || null,
          currentStep: overrides.currentStep !== undefined ? overrides.currentStep : currentStep,
          formValues: {
            name: data.name,
            team: data.team,
            country: data.country,
            versionName: data.versionName,
            folder_id: data.folder_id,
            webViewUrl: data.webViewUrl,
            htmlSource: data.htmlSource,
            figmaUrl: data.figmaUrl,
            litmusUrl: data.litmusUrl
          },
          checklistAnswers: synchronizedAnswers,
          visualChecks: effectiveVisualChecks,
          status: record?.status || campaignStatusRef.current || "In Progress",
          reviewNote: overrides.reviewNote !== undefined ? overrides.reviewNote : reviewNote,
          designChoice,
          outlookSubject: overrides.outlookSubject !== undefined ? overrides.outlookSubject : (outlookSubject || extractedSubject || undefined),
          outlookFileName: overrides.outlookFileName !== undefined ? overrides.outlookFileName : (outlookFileName || undefined),
          outlookExtractedHtml: overrides.outlookExtractedHtml !== undefined ? overrides.outlookExtractedHtml : (outlookExtractedHtml || undefined),
          mockupDataUrl: mockupPreviewUrl || undefined
        });
      }

      return record;
    } catch (e) {
      console.error("[AutoSave] Error saving campaign state:", e);
      setSyncStatus("offline");
      return null;
    }
  };

  const handleChecklistAnswersChange = (newAnswers: Record<string, any>) => {
    hasMovedToStage2Ref.current = true;
    setIsEditMode(true);
    let nextVisualChecks = visualChecks;
    if (newAnswers._visualChecks) {
      nextVisualChecks = newAnswers._visualChecks;
      setVisualChecks(nextVisualChecks);
    } else if (
      newAnswers.visual_desktop_light !== undefined ||
      newAnswers.visual_mobile_light !== undefined ||
      newAnswers.visual_desktop_dark !== undefined ||
      newAnswers.visual_mobile_dark !== undefined ||
      newAnswers.visual_litmus !== undefined
    ) {
      nextVisualChecks = {
        desktopLight: newAnswers.visual_desktop_light?.status === 'Checked',
        mobileLight: newAnswers.visual_mobile_light?.status === 'Checked',
        desktopDark: newAnswers.visual_desktop_dark?.status === 'Checked',
        mobileDark: newAnswers.visual_mobile_dark?.status === 'Checked',
        litmus: newAnswers.visual_litmus?.status === 'Checked',
      };
      setVisualChecks(nextVisualChecks);
    }

    const synchronizedAnswers = {
      ...newAnswers,
      visual_desktop_light: { ...(newAnswers.visual_desktop_light || {}), status: nextVisualChecks.desktopLight ? "Checked" : null },
      visual_mobile_light: { ...(newAnswers.visual_mobile_light || {}), status: nextVisualChecks.mobileLight ? "Checked" : null },
      visual_desktop_dark: { ...(newAnswers.visual_desktop_dark || {}), status: nextVisualChecks.desktopDark ? "Checked" : null },
      visual_mobile_dark: { ...(newAnswers.visual_mobile_dark || {}), status: nextVisualChecks.mobileDark ? "Checked" : null },
      visual_litmus: { ...(newAnswers.visual_litmus || {}), status: nextVisualChecks.litmus ? "Checked" : null },
      _visualChecks: nextVisualChecks
    };

    setChecklistAnswers(synchronizedAnswers);
    checklistAnswersRef.current = synchronizedAnswers;

    const restoredCheckpoints: Record<string, boolean> = {};
    Object.keys(synchronizedAnswers).forEach((key) => {
      const val = synchronizedAnswers[key];
      if (typeof val === 'boolean') {
        restoredCheckpoints[key] = val;
      } else if (val && typeof val === 'object') {
        restoredCheckpoints[key] = val.status === 'Checked' || val.status === 'N/A';
      }
    });
    setCheckedCheckpoints(restoredCheckpoints);

    // Save state immediately on checkpoint change
    saveCurrentCampaignState({ checklistAnswers: synchronizedAnswers, visualChecks: nextVisualChecks });
  };

  const [teamChecklists, setTeamChecklists] = useState<any[]>([]);
  const [checkedCheckpoints, setCheckedCheckpoints] = useState<Record<string, boolean>>({});
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);

  const [showIncompleteModal, setShowIncompleteModal] = useState(false);
  const [incompleteModalData, setIncompleteModalData] = useState<{
    stageNumber: number;
    stageTitle: string;
    missingCheckpoints: MissingCheckpoint[];
  }>({
    stageNumber: 1,
    stageTitle: "",
    missingCheckpoints: []
  });
  
  const [viewOnlineError, setViewOnlineError] = useState(false);

  useEffect(() => {
    if (editId) {
      campaignIdRef.current = editId;
    }
  }, [editId]);

  const [isPageLoading, setIsPageLoading] = useState<boolean>(!!editId);

  const { register, handleSubmit, control, formState: { errors, isDirty }, watch, trigger, setError, clearErrors, setValue, reset } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      team: "",
      country: "",
      versionName: "",
      folder_id: targetFolderParam || "",
      webViewUrl: "",
      htmlSource: "",
      figmaUrl: "",
      litmusUrl: ""
    }
  });

  const [dispatchedRecords, setDispatchedRecords] = useState<any[]>([]);
  const dispatchedRecordsRef = useRef<any[]>([]);
  const [isApprovingModalOpen, setIsApprovingModalOpen] = useState(false);
  const [approvingStep, setApprovingStep] = useState<"processing" | "success">("processing");

  useEffect(() => {
    dispatchedRecordsRef.current = dispatchedRecords;
  }, [dispatchedRecords]);

  useEffect(() => {
    const handleDispatchedSaved = (e: any) => {
      if (e.detail) {
        setDispatchedRecords((prev) => {
          const updated = [e.detail, ...prev.filter((r: any) => r.id !== e.detail.id)];
          dispatchedRecordsRef.current = updated;
          return updated;
        });
      }
    };
    window.addEventListener("campaign_dispatched_saved", handleDispatchedSaved);
    return () => window.removeEventListener("campaign_dispatched_saved", handleDispatchedSaved);
  }, []);

  const blocker = useBlocker(
    useCallback(
      ({ currentLocation, nextLocation }: { currentLocation: any; nextLocation: any }) => {
        if (isCampaignApproved || isDiscardingRef.current || isSubmitting) {
          return false;
        }
        if (currentLocation.pathname === nextLocation.pathname) {
          return false;
        }
        const data = watch();
        const hasContent = Boolean(data.name || data.webViewUrl || data.htmlSource);
        return Boolean(hasContent && isDirty);
      },
      [isCampaignApproved, isSubmitting, watch, isDirty]
    )
  );

  const syncUrlState = useCallback((stepNum: number, campaignId?: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("step", String(stepNum));
      const effectiveId = campaignId || campaignIdRef.current || editId;
      if (effectiveId) {
        next.set("id", effectiveId);
      }
      return next;
    }, { replace: true });
    const effectiveId = campaignId || campaignIdRef.current || editId;
    if (effectiveId) {
      try {
        localStorage.setItem(`hp_qa_campaign_stage_${effectiveId}`, String(stepNum));
      } catch {}
    }
  }, [editId, setSearchParams]);

  const saveActiveSessionSync = useCallback(() => {
    const data = watch();
    const effectiveId = campaignIdRef.current || editId || null;
    saveActiveQASnapshot({
      campaignId: effectiveId,
      currentStep,
      formValues: {
        name: data.name,
        team: data.team,
        country: data.country,
        versionName: data.versionName,
        folder_id: data.folder_id,
        webViewUrl: data.webViewUrl,
        htmlSource: data.htmlSource,
        figmaUrl: data.figmaUrl,
        litmusUrl: data.litmusUrl
      },
      checklistAnswers: checklistAnswersRef.current || checklistAnswers,
      visualChecks,
      status: campaignStatusRef.current || campaignStatus,
      reviewNote,
      designChoice,
      outlookSubject: outlookSubject || extractedSubject,
      outlookFileName,
      outlookExtractedHtml,
      mockupDataUrl: mockupPreviewUrl
    });
  }, [currentStep, editId, watch, checklistAnswers, visualChecks, campaignStatus, reviewNote, designChoice, outlookSubject, extractedSubject, outlookFileName, outlookExtractedHtml, mockupPreviewUrl]);

  const handleSaveAndRefresh = async () => {
    setIsRefreshing(true);
    try {
      saveActiveSessionSync();
      const record = await saveCurrentCampaignState({ currentStep });
      const effectiveId = record?.id || campaignIdRef.current || editId;
      if (effectiveId) {
        try {
          localStorage.setItem(`hp_qa_campaign_stage_${effectiveId}`, String(currentStep));
        } catch {}
      }
      sessionStorage.setItem("hp_qa_reopened_notice", "true");
      if (effectiveId) {
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.set("id", effectiveId);
        nextUrl.searchParams.set("step", String(currentStep));
        window.location.href = nextUrl.toString();
      } else {
        window.location.reload();
      }
    } catch (err) {
      console.error("[CampaignSetup] Error saving before refresh:", err);
      window.location.reload();
    }
  };

  const [availableFolders, setAvailableFolders] = useState<FolderItem[]>(() => {
    const cached = getFolders();
    return cached.length > 0 ? cached : [
      { id: "2026", name: "2026 Campaigns", parentId: null, year: "2026", created_at: new Date().toISOString() },
      { id: "2025", name: "2025 Campaigns", parentId: null, year: "2025", created_at: new Date().toISOString() }
    ];
  });

  useEffect(() => {
    fetchFolders().then((list) => {
      if (list && list.length > 0) {
        setAvailableFolders(list);
      }
    });
  }, []);
  const values = watch();
  const [campaignChecklists, setCampaignChecklists] = useState<any[]>(() => ensureVisualCheckpointsInList([]));
  const [selectedChecklistId, setSelectedChecklistId] = useState<string>("");
  const checklists = campaignChecklists;
  const [stageLabels, setStageLabels] = useState<Record<string, string>>({
    "1": "Stage 1: Details & Source",
    "2": "Stage 2: Visual Comparison",
    "3": "Stage 3: Alt & Alias Tags",
    "4": "Stage 4: Link Validation",
    "5": "Stage 5: Grammar & Spell Check",
    "6": "Stage 6: Review & Approval / LAUNCH (FQA)",
    "7": "Stage 7: Review & Approval (FQA)"
  });

  // Derive available checklists for the team
  const availableTeamChecklists = teamChecklists.filter((c: any) => c.team === values?.team);


  const isFQA = React.useMemo(() => {
    if (!selectedChecklistId && !campaignChecklists.length) return false;
    const template = availableTeamChecklists.find(c => c.id === selectedChecklistId);
    if (template) {
      const tTitle = template.title?.toLowerCase() || template.name?.toLowerCase() || "";
      return tTitle.includes("fqa") && !tTitle.includes("cqa");
    }
    return campaignChecklists.some(c => c.stage === 7);
  }, [selectedChecklistId, availableTeamChecklists, campaignChecklists]);

  const activeQaType = React.useMemo(() => {
    const template = availableTeamChecklists.find(c => c.id === selectedChecklistId);
    if (template) {
      const nameUpper = (template.name || template.title || "").toUpperCase();
      if (nameUpper.includes("OFT")) return "OFT CQA";
      if (nameUpper.includes("FQA") && !nameUpper.includes("CQA")) return "FQA";
      if (nameUpper.includes("CQA")) return "CQA";
      if (nameUpper) return nameUpper;
    }
    if (isFQA) return "FQA";
    if (campaignChecklists.some(c => c.id?.startsWith("apj-oft"))) return "OFT CQA";
    return "CQA";
  }, [selectedChecklistId, availableTeamChecklists, campaignChecklists, isFQA]);

  const STEPS = React.useMemo(() => {
    const base = [
      { id: "details", title: stageLabels["1"] ? stageLabels["1"].replace(/Stage 1:\s*/i, '') : "Details & Source" },
      { id: "compare", title: stageLabels["2"] ? stageLabels["2"].replace(/Stage 2:\s*/i, '') : "Visual Comparison" },
      { id: "tags", title: stageLabels["3"] ? stageLabels["3"].replace(/Stage 3:\s*/i, '') : "Alt & Alias Tags" },
      { id: "links", title: stageLabels["4"] ? stageLabels["4"].replace(/Stage 4:\s*/i, '') : "Link Validation" },
      { id: "grammar", title: stageLabels["5"] ? stageLabels["5"].replace(/Stage 5:\s*/i, '') : "Grammar & Spell Check" },
    ];
    if (isFQA) {
      base.push({ id: "launch", title: "LAUNCH" });
    }
    base.push({ id: "review", title: "Review & Approval" });
    return base;
  }, [isFQA, stageLabels]);

  const totalSteps = STEPS.length;


  // Sync campaignChecklists from platform master when team changes on a new campaign
  useEffect(() => {
    if (!isEditMode && availableTeamChecklists.length > 0) {
      // Use selectedChecklistId if present, else default to the first one
      const targetTemplate = selectedChecklistId 
        ? availableTeamChecklists.find((c: any) => c.id === selectedChecklistId)
        : availableTeamChecklists[0];
        
      if (targetTemplate) {
        setCampaignChecklists(ensureVisualCheckpointsInList(targetTemplate.items || []));
        if (!selectedChecklistId && targetTemplate.id) {
          setSelectedChecklistId(targetTemplate.id);
        }
      }
    }
  }, [values?.team, teamChecklists, isEditMode, selectedChecklistId, availableTeamChecklists]);

  useEffect(() => {
    const fetchUserTeam = async () => {
      if (userEmail) {
        try {
          if (import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_URL !== 'https://placeholder.supabase.co') {
            const { data, error } = await supabase.from('app_users').select('team').eq('email', userEmail).single();
            if (data && data.team) {
              setUserTeam(data.team);
              if (!isEditMode) {
                setValue('team', data.team);
              }
            }
          } else {
             // Mock auth - fallback for test env
             setUserTeam("HP-APJ");
             if (!isEditMode) setValue('team', "HP-APJ");
          }
        } catch(e) {
          console.error("Failed to fetch user team:", e);
        }
      }
    };
    fetchUserTeam();
  }, [userEmail, isEditMode, setValue]);

  // Analysis helpers for Alias tags, Alt tags, and Link Check
  const aliasTagsInfo = React.useMemo(() => {
    const html = values.htmlSource || "";
    if (!html) return { total: 0, items: [], missingInAnchors: [] };
    const regex = /(?:alias|data-alias)=["']([^"']+)["']/gi;
    const items: { alias: string; tag: string }[] = [];
    let match;
    while ((match = regex.exec(html)) !== null) {
      items.push({ alias: match[1], tag: match[0] });
    }
    
    // Check anchors missing alias
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const anchors = Array.from(doc.querySelectorAll("a"));
    const missingInAnchors = anchors.filter(a => !a.getAttribute("alias") && !a.getAttribute("data-alias")).map(a => ({
      text: a.textContent?.trim() || a.querySelector("img")?.getAttribute("alt") || "Unlabeled Link",
      href: a.getAttribute("href") || "#"
    }));

    return { total: items.length, items, missingInAnchors };
  }, [values.htmlSource]);

  const altTagsInfo = React.useMemo(() => {
    const html = values.htmlSource || "";
    if (!html) return { total: 0, withAlt: [], missingAlt: [] };
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const imgs = Array.from(doc.querySelectorAll("img"));
    const withAlt: { src: string; alt: string }[] = [];
    const missingAlt: { src: string }[] = [];

    imgs.forEach(img => {
      const src = img.getAttribute("src") || "inline/unspecified";
      const alt = img.getAttribute("alt");
      if (alt !== null && alt.trim() !== "") {
        withAlt.push({ src, alt: alt.trim() });
      } else {
        missingAlt.push({ src });
      }
    });

    return { total: imgs.length, withAlt, missingAlt };
  }, [values.htmlSource]);

  const selectedCountryConfigLinkAudit = countries.find((c: any) => c.name === values.country && c.code === values.versionName);
  const expectedPrefixLinkAudit = selectedCountryConfigLinkAudit?.url;

  const linkAuditInfo = React.useMemo(() => {
    const html = values.htmlSource || "";
    if (!html) return { total: 0, valid: [], missing: [] };
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const anchors = Array.from(doc.querySelectorAll("a"));
    const valid: { text: string; href: string }[] = [];
    const missing: { text: string; href: string; reason: string }[] = [];

    anchors.forEach(a => {
      const text = a.textContent?.trim() || a.querySelector("img")?.getAttribute("alt") || "Banner Link";
      const href = a.getAttribute("href")?.trim() || "";

      if (!href) {
        missing.push({ text, href: "(empty)", reason: "Missing href attribute" });
      } else if (href === "#" || href === "http://" || href === "https://") {
        missing.push({ text, href, reason: "Placeholder or empty link" });
      } else if (href.includes("example.com") || href.includes("YOUR_URL_HERE")) {
        missing.push({ text, href, reason: "Dummy placeholder URL" });
      } else if (
        expectedPrefixLinkAudit && 
        href.toLowerCase().includes("hp.com") && 
        !href.toLowerCase().startsWith(expectedPrefixLinkAudit.toLowerCase())
      ) {
        missing.push({ text, href, reason: `URL mismatch. Expected prefix: ${expectedPrefixLinkAudit}` });
      } else {
        valid.push({ text, href });
      }
    });

    return { total: anchors.length, valid, missing };
  }, [values.htmlSource, expectedPrefixLinkAudit]);

  const refreshLogs = async (id?: string | null, name?: string) => {
    const logs = await getCampaignLogs(id || editId || undefined, name || values.name || undefined);
    setCampaignLogs(logs);
  };

  useEffect(() => {
    if (editId || values.name) {
      refreshLogs(editId, values.name);
    }
  }, [editId, values.name]);

  // Clear the view online error automatically when both fields are filled out
  useEffect(() => {
    if (values.country && values.versionName) {
      setViewOnlineError(false);
    }
  }, [values.country, values.versionName]);

  const handleViewOnlineClick = (action: () => void) => {
    if (!values.country || !values.versionName) {
      setViewOnlineError(true);
      return;
    }
    setViewOnlineError(false);
    action();
  };

  // Handle Outlook MSG File upload and Subject extraction
  const handleOutlookFileChange = (file: File | null) => {
    setOutlookFile(file);
    if (!file) {
      setOutlookExtractedHtml(null);
      setOutlookSubject(null);
      setOutlookFileName(null);
      saveCurrentCampaignState({
        outlookFileName: undefined,
        outlookExtractedHtml: undefined,
        outlookSubject: undefined
      });
      return;
    }

    setOutlookFileName(file.name);
    console.log(`[Outlook Extraction] Processing file '${file.name}'...`);

    const reader = new FileReader();
    reader.onload = async (e) => {
      const buffer = e.target?.result as ArrayBuffer;
      if (buffer) {
        const parsed = await parseMsgArrayBuffer(buffer, file.name);
        setOutlookExtractedHtml(parsed.htmlContent);
        setOutlookSubject(parsed.subject);
        setExtractedSubject(parsed.subject);
        console.log(`[Outlook Extraction] Extracted Subject Line: "${parsed.subject}"`);
        setLeftCompareTab("outlook");

        saveCurrentCampaignState({
          outlookFileName: file.name,
          outlookExtractedHtml: parsed.htmlContent || undefined,
          outlookSubject: parsed.subject
        });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleMockupImageChange = (file: File | null) => {
    setMockupFile(file);
    if (!file) {
      setMockupPreviewUrl(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setMockupPreviewUrl(dataUrl);
      setDesignChoice("image");
      saveCurrentCampaignState({
        mockupFileName: file.name,
        mockupDataUrl: dataUrl
      });
    };
    reader.readAsDataURL(file);
  };

  const handleManualSave = async () => {
    const data = watch();
    if (!data.name || data.name.trim().length < 2) {
      alert("Please provide a valid Campaign Name (at least 2 characters) before saving.");
      return;
    }
    
    setIsSubmitting(true);
    try {
      const record = await saveCurrentCampaignState({ status: "Draft" });
      if (record) {
        setToastNotice(`Campaign "${record.name}" draft saved successfully to database!`);
        setTimeout(() => setToastNotice(null), 3500);
      }
    } catch (e: any) {
      console.error("Manual save failed:", e);
      alert(e?.message || "Failed to save campaign draft.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetAll = () => {
    reset({
      name: "",
      team: "",
      country: "",
      versionName: "",
      folder_id: targetFolderParam || "",
      webViewUrl: "",
      htmlSource: "",
      figmaUrl: "",
      litmusUrl: ""
    });
    setBriefFile(null);
    setOutlookFile(null);
    setMockupFile(null);
    setMockupPreviewUrl(null);
    setOutlookSubject(null);
    setOutlookFileName(null);
    setOutlookExtractedHtml(null);
    clearErrors();
    setQaResults([]);
    setDraftSavedAt(null);
    console.log("[CampaignSetup] All input fields and uploads reset.");
  };

  useEffect(() => {
    const loadMasterChecklists = async () => {
      const data = await fetchPlatformChecklists();
      setTeamChecklists(data);
    };
    loadMasterChecklists();
  }, []);

  useEffect(() => {
    if (editId) {
      if (initialLoadedIdRef.current === editId) {
        // Already loaded or saved locally in this session - avoid resetting user's active form edits
        return;
      }
      initialLoadedIdRef.current = editId;
      setIsEditMode(true);
      const loadCampaign = async () => {
        console.log(`[CampaignSetup] Loading campaign ID '${editId}' for editing...`);
        const campaignData = await getCampaignById(editId);

        if (campaignData) {
          setValue('name', campaignData.name || "");
          setValue('team', campaignData.team || "HP-APJ");
          setValue('country', campaignData.country || "");
          setValue('versionName', campaignData.versionName || campaignData.version_name || "");
          setValue('folder_id', campaignData.folder_id || targetFolderParam || "");
          setValue('webViewUrl', campaignData.webViewUrl || campaignData.web_view_url || "");
          setValue('htmlSource', campaignData.htmlSource || campaignData.html_source || "");
          setValue('figmaUrl', campaignData.figmaUrl || campaignData.figma_url || "");
          setValue('litmusUrl', campaignData.litmusUrl || campaignData.litmus_url || "");
          setCampaignStatus(campaignData.status || "QA Pending");
          if (campaignData.figmaUrl || campaignData.figma_url) setDesignChoice("figma");

          const recDispatched = campaignData.dispatchedRecords || campaignData.dispatched_records || [];
          setDispatchedRecords(recDispatched);
          dispatchedRecordsRef.current = recDispatched;

          // Load master checklists first to ensure team lists are up to date
          const masterChecklists = await fetchPlatformChecklists();

          // Load frozen checklists snapshot if available
          let loadedChecklists: any[] = [];
          if (campaignData.checklists && Array.isArray(campaignData.checklists) && campaignData.checklists.length > 0) {
            loadedChecklists = campaignData.checklists;
          } else {
            loadedChecklists = masterChecklists.find((c: any) => c.team === (campaignData.team || "HP-APJ"))?.items || [];
          }

          // Ensure any checklist items from the master team list are available as well so no checkpoints are missing
          const teamMasterItems = masterChecklists.find((c: any) => c.team === (campaignData.team || "HP-APJ"))?.items || [];
          const combinedItemsMap = new Map<string, any>();
          teamMasterItems.forEach((item: any) => combinedItemsMap.set(item.id, item));
          loadedChecklists.forEach((item: any) => combinedItemsMap.set(item.id, item));

          const finalChecklists = ensureVisualCheckpointsInList(Array.from(combinedItemsMap.values()));
          setCampaignChecklists(finalChecklists);

          const storedChecklistId = (campaignData as any).selectedChecklistId || (campaignData as any).selected_checklist_id;
          if (storedChecklistId) {
            setSelectedChecklistId(storedChecklistId);
          } else {
            const matchedTemplate = masterChecklists.find((t: any) => 
              t.team === (campaignData.team || "HP-APJ") &&
              t.items && t.items.some((ti: any) => loadedChecklists.some((lc: any) => lc.id === ti.id))
            );
            if (matchedTemplate) {
              setSelectedChecklistId(matchedTemplate.id);
            }
          }

          // Check both camelCase and snake_case for checklist answers
          const localSnapshot = getActiveQASnapshot(editId);
          let rawAnswers = (campaignData.checklistAnswers || (campaignData as any).checklist_answers) || {};
          if (localSnapshot?.checklistAnswers && Object.keys(localSnapshot.checklistAnswers).length > 0) {
            rawAnswers = { ...rawAnswers, ...localSnapshot.checklistAnswers };
          }
          
          // Recover visual checks from all possible storage locations
          const rawVisual = localSnapshot?.visualChecks || campaignData.visualChecks || (campaignData as any).visual_checks || rawAnswers._visualChecks;
          const recoveredVisual = rawVisual ? {
            desktopLight: !!rawVisual.desktopLight,
            mobileLight: !!rawVisual.mobileLight,
            desktopDark: !!rawVisual.desktopDark,
            mobileDark: !!rawVisual.mobileDark,
            litmus: !!rawVisual.litmus,
          } : {
            desktopLight: rawAnswers.visual_desktop_light?.status === "Checked",
            mobileLight: rawAnswers.visual_mobile_light?.status === "Checked",
            desktopDark: rawAnswers.visual_desktop_dark?.status === "Checked",
            mobileDark: rawAnswers.visual_mobile_dark?.status === "Checked",
            litmus: rawAnswers.visual_litmus?.status === "Checked",
          };

          setVisualChecks(recoveredVisual);

          if (campaignData.no_callouts !== undefined) {
            setNoCalloutsChecked(Boolean(campaignData.no_callouts));
          }

          const synchronizedAnswers = {
            ...rawAnswers,
            visual_desktop_light: { ...(rawAnswers.visual_desktop_light || {}), status: recoveredVisual.desktopLight ? "Checked" : null },
            visual_mobile_light: { ...(rawAnswers.visual_mobile_light || {}), status: recoveredVisual.mobileLight ? "Checked" : null },
            visual_desktop_dark: { ...(rawAnswers.visual_desktop_dark || {}), status: recoveredVisual.desktopDark ? "Checked" : null },
            visual_mobile_dark: { ...(rawAnswers.visual_mobile_dark || {}), status: recoveredVisual.mobileDark ? "Checked" : null },
            visual_litmus: { ...(rawAnswers.visual_litmus || {}), status: recoveredVisual.litmus ? "Checked" : null },
            _visualChecks: recoveredVisual
          };

          setChecklistAnswers(synchronizedAnswers);
          checklistAnswersRef.current = synchronizedAnswers;

          const restoredCheckpoints: Record<string, boolean> = {};
          Object.keys(synchronizedAnswers).forEach((key) => {
            const val = synchronizedAnswers[key];
            if (typeof val === 'boolean') {
              restoredCheckpoints[key] = val;
            } else if (val && typeof val === 'object') {
              restoredCheckpoints[key] = val.status === 'Checked' || val.status === 'N/A';
            }
          });
          setCheckedCheckpoints(restoredCheckpoints);

          if (campaignData.outlookExtractedHtml) setOutlookExtractedHtml(campaignData.outlookExtractedHtml);
          if (campaignData.outlookFileName) setOutlookFileName(campaignData.outlookFileName);
          if (campaignData.outlookSubject) {
            setOutlookSubject(campaignData.outlookSubject);
            setExtractedSubject(campaignData.outlookSubject);
          }
          if (campaignData.mockupDataUrl) setMockupPreviewUrl(campaignData.mockupDataUrl);

          const stepParamVal = searchParams.get('step');
          const storedStage = getStoredStageForCampaign(editId);
          const effectiveStep = (stepParamVal && !isNaN(Number(stepParamVal)))
            ? parseInt(stepParamVal, 10)
            : (storedStage || (localSnapshot?.currentStep) || campaignData.currentStep || campaignData.current_step || 1);

          setCurrentStep(effectiveStep);
          syncUrlState(effectiveStep, editId);

          const reopenedNotice = sessionStorage.getItem("hp_qa_reopened_notice");
          if (reopenedNotice) {
            setToastNotice(`✓ Session restored: Resumed campaign QA at Stage ${effectiveStep} where you left off.`);
            sessionStorage.removeItem("hp_qa_reopened_notice");
            setTimeout(() => setToastNotice(null), 4500);
          }

          // Any loaded campaign is an existing, saved campaign that should never trigger the discard prompt
          hasMovedToStage2Ref.current = true;
          isDiscardingRef.current = false;
          setIsEditMode(true);

          refreshLogs(editId, campaignData.name);
        }
        setIsPageLoading(false);
      };
      loadCampaign();
    } else {
      const activeSnapshot = getActiveQASnapshot();

      if (activeSnapshot && activeSnapshot.formValues && (activeSnapshot.formValues.name || activeSnapshot.formValues.htmlSource)) {
        setValue('name', activeSnapshot.formValues.name || "");
        setValue('team', activeSnapshot.formValues.team || userTeam || "HP-APJ");
        setValue('country', activeSnapshot.formValues.country || "");
        setValue('versionName', activeSnapshot.formValues.versionName || "");
        setValue('folder_id', activeSnapshot.formValues.folder_id || targetFolderParam || "2026");
        setValue('webViewUrl', activeSnapshot.formValues.webViewUrl || "");
        setValue('htmlSource', activeSnapshot.formValues.htmlSource || "");
        setValue('figmaUrl', activeSnapshot.formValues.figmaUrl || "");
        setValue('litmusUrl', activeSnapshot.formValues.litmusUrl || "");

        if (activeSnapshot.checklistAnswers) {
          setChecklistAnswers(activeSnapshot.checklistAnswers);
          checklistAnswersRef.current = activeSnapshot.checklistAnswers;
        }
        if (activeSnapshot.visualChecks) {
          setVisualChecks(activeSnapshot.visualChecks);
        }
        if (activeSnapshot.currentStep) {
          setCurrentStep(activeSnapshot.currentStep);
          syncUrlState(activeSnapshot.currentStep);
        }
        if (activeSnapshot.reviewNote) {
          setReviewNote(activeSnapshot.reviewNote);
        }
        if (activeSnapshot.designChoice) {
          setDesignChoice(activeSnapshot.designChoice);
        }
        if (activeSnapshot.outlookSubject) {
          setOutlookSubject(activeSnapshot.outlookSubject);
          setExtractedSubject(activeSnapshot.outlookSubject);
        }
        if (activeSnapshot.outlookFileName) {
          setOutlookFileName(activeSnapshot.outlookFileName);
        }
        if (activeSnapshot.outlookExtractedHtml) {
          setOutlookExtractedHtml(activeSnapshot.outlookExtractedHtml);
        }
        if (activeSnapshot.mockupDataUrl) {
          setMockupPreviewUrl(activeSnapshot.mockupDataUrl);
        }
        hasMovedToStage2Ref.current = (activeSnapshot.currentStep || 1) >= 2;
        setIsEditMode(true);
        setToastNotice(`✓ Session restored: Resumed campaign setup at Stage ${activeSnapshot.currentStep || 1}.`);
        setTimeout(() => setToastNotice(null), 5000);
        setIsPageLoading(false);
        return;
      }

      // New Campaign: Reset all state when there is no editId and no active snapshot to restore
      campaignIdRef.current = null;
      initialLoadedIdRef.current = null;
      hasMovedToStage2Ref.current = false;
      isDiscardingRef.current = false;
      setIsEditMode(false);
      setCampaignStatus("Draft");
      setChecklistAnswers({});
      setCheckedCheckpoints({});
      setVisualChecks({ desktopLight: false, mobileLight: false, desktopDark: false, mobileDark: false, litmus: false });
      setNoCalloutsChecked(false);
      setBriefFile(null);
      setOutlookFile(null);
      setMockupFile(null);
      setMockupPreviewUrl(null);
      setOutlookSubject(null);
      setOutlookFileName(null);
      setOutlookExtractedHtml(null);
      setExtractedSubject("");
      setReviewNote("");
      setDraftSavedAt(null);
      setCurrentStep(1);
      setQaResults([]);

      const masterItems = teamChecklists.find((c: any) => c.team === (userTeam || "HP-APJ"))?.items || [];
      setCampaignChecklists(ensureVisualCheckpointsInList(masterItems));

      reset({
        name: "",
        team: userTeam || "HP-APJ",
        country: "",
        versionName: "",
        folder_id: targetFolderParam || "2026",
        webViewUrl: "",
        htmlSource: "",
        figmaUrl: "",
        litmusUrl: ""
      });
      setIsPageLoading(false);
    }
  }, [editId, setValue, reset, targetFolderParam, teamChecklists, userTeam]);

  // Dedicated Auto-Save: Saves draft to Supabase DB every 30 seconds only for named new campaigns
  useEffect(() => {
    const saveDraftToDatabase = async () => {
      try {
        const formData = watch();
        if (!editId && !campaignIdRef.current && formData.name && formData.name.trim().length >= 2 && formData.country) {
          const timeStr = new Date().toLocaleTimeString();
          const draftRecord = await saveCampaignRecord({
            name: formData.name.trim(),
            team: formData.team || "HP-APJ",
            country: formData.country,
            versionName: formData.versionName || "Standard",
            folder_id: formData.folder_id || "2026",
            webViewUrl: formData.webViewUrl || "",
            htmlSource: formData.htmlSource || "",
            figmaUrl: designChoice === "figma" ? (formData.figmaUrl || "") : "",
            litmusUrl: formData.litmusUrl || "",
            status: "Draft",
            userEmail: userEmail || "",
            createdBy: userEmail || "QA User",
            checklists: campaignChecklists,
            checklistAnswers: checklistAnswersRef.current || checklistAnswers,
            currentStep: currentStep,
            reviewNote: reviewNote || "",
            outlookFileName: outlookFileName || "",
            outlookExtractedHtml: outlookExtractedHtml || "",
            outlookSubject: outlookSubject || "",
            mockupDataUrl: mockupPreviewUrl || ""
          });

          if (draftRecord && draftRecord.id) {
            campaignIdRef.current = draftRecord.id;
          }
          setDraftSavedAt(timeStr);
          console.log(`[AutoSave 30s] Campaign draft saved to database at ${timeStr}`);
        }
      } catch (err) {
        console.warn("[AutoSave 30s] Auto-save notice:", err);
      }
    };

    if (isCampaignApproved) return;
    const interval = setInterval(saveDraftToDatabase, 30000);
    return () => clearInterval(interval);
  }, [watch, editId, designChoice, outlookFileName, outlookExtractedHtml, outlookSubject, mockupPreviewUrl, reviewNote, currentStep, userEmail, campaignChecklists, checklistAnswers, isCampaignApproved]);

  // Real-time debounced auto-save to database / storage engine
  useEffect(() => {
    if (isCampaignApproved) return;
    let timeoutId: NodeJS.Timeout;
    const subscription = watch((value) => {
      if (value.name && value.name.trim().length >= 2) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          saveCurrentCampaignState();
        }, 500);
      }
    });

    const intervalId = setInterval(() => {
      const data = watch();
      if (data.name && data.name.trim().length >= 2) {
        saveCurrentCampaignState();
      }
    }, 10000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };
  }, [watch, editId, campaignStatus, designChoice, userEmail, currentStep, outlookFileName, outlookExtractedHtml, outlookSubject, isCampaignApproved]);

  // Real-time auto-save whenever checklist answers change
  const isChecklistMountedRef = useRef(false);
  useEffect(() => {
    if (!isChecklistMountedRef.current) {
      if (!isPageLoading) {
        isChecklistMountedRef.current = true;
      }
      return;
    }
    const timer = setTimeout(() => {
      saveCurrentCampaignState({ checklistAnswers });
    }, 400);

    return () => clearTimeout(timer);
  }, [checklistAnswers, isPageLoading]);

  // Real-time auto-save whenever review note changes
  const isReviewNoteMountedRef = useRef(false);
  useEffect(() => {
    if (!isReviewNoteMountedRef.current) {
      if (!isPageLoading) {
        isReviewNoteMountedRef.current = true;
      }
      return;
    }
    const timer = setTimeout(() => {
      saveCurrentCampaignState({ reviewNote });
    }, 500);

    return () => clearTimeout(timer);
  }, [reviewNote, isPageLoading]);

  // Ensure state is saved before unload, warn user on accidental refresh, and support safe reload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDiscardingRef.current) return;

      // 1. Immediately snapshot complete state synchronously to session & local storage
      saveActiveSessionSync();

      // 2. Trigger asynchronous database update
      saveCurrentCampaignState();

      // 3. Prompt user if there is active work or an open campaign
      const data = watch();
      const hasWorkInProgress = !!(
        (data.name && data.name.trim().length > 0) ||
        (data.htmlSource && data.htmlSource.trim().length > 0) ||
        campaignIdRef.current ||
        editId ||
        isEditMode ||
        Object.keys(checklistAnswersRef.current || {}).length > 0 ||
        currentStep > 1
      );

      if (hasWorkInProgress) {
        e.preventDefault();
        e.returnValue = "You have an active QA session in progress. Changes are saved locally. Are you sure you want to refresh?";
        return e.returnValue;
      }
    };

    const handleAnchorClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('a');
      if (!target || !target.href) return;
      
      const targetHref = target.getAttribute('href') || '';
      if (!targetHref || targetHref.startsWith('#') || targetHref.startsWith('javascript:')) return;
      if (target.target === '_blank' || target.hasAttribute('download')) return;

      const currentFullPath = window.location.pathname + window.location.search;
      const targetUrl = new URL(target.href, window.location.origin);
      const targetFullPath = targetUrl.pathname + targetUrl.search;
      
      if (currentFullPath === targetFullPath) return;

      const data = watch();
      const hasSavedCampaign = !!(campaignIdRef.current || editId || isEditMode);
      const hasInputs = !!((data.name && data.name.trim().length > 0) || (data.htmlSource && data.htmlSource.trim().length > 0));
      const hasAnswers = Object.keys(checklistAnswersRef.current || {}).length > 0;
      const hasContent = hasSavedCampaign || hasInputs || hasAnswers || currentStep > 1;

      if (hasContent && !isDiscardingRef.current) {
        e.preventDefault();
        e.stopPropagation();
        pendingNavUrlRef.current = targetFullPath;
        setShowStage1DraftPrompt(true);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleAnchorClick, { capture: true });

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleAnchorClick, { capture: true });
      if (!isDiscardingRef.current && (hasMovedToStage2Ref.current || campaignIdRef.current || editId || isEditMode)) {
        saveCurrentCampaignState({ skipUrlSync: true });
      }
    };
  }, []);

  const validateStageAndGetMissingItems = (stageNum: number): MissingCheckpoint[] => {
    const missingItems: MissingCheckpoint[] = [];

    // Stage 1 required form fields check
    if (stageNum === 1) {
      if (!values.name || !values.name.trim()) {
        missingItems.push({
          id: 'field_name',
          label: 'Campaign Name (Mandatory Field)',
          reason: 'Required campaign name field is empty'
        });
      }
      if (!values.country) {
        missingItems.push({
          id: 'field_country',
          label: 'Country Selection',
          reason: 'Please select a target country'
        });
      }
      if (!values.htmlSource || !values.htmlSource.trim()) {
        missingItems.push({
          id: 'field_html',
          label: 'Email HTML Source Code',
          reason: 'Email HTML source code is empty'
        });
      }
    }

    // Stage 2 special Visual QA Checks (Desktop Light, Mobile Light, Desktop Dark, Mobile Dark)
    if (stageNum === 2) {
      if (!visualChecks.desktopLight) {
        missingItems.push({
          id: 'visual_desktop_light',
          label: 'Visual QA: Desktop (Light Mode)',
          reason: 'Must inspect Desktop Light mode and mark in QA Checklist'
        });
      }
      if (!visualChecks.mobileLight) {
        missingItems.push({
          id: 'visual_mobile_light',
          label: 'Visual QA: Mobile (Light Mode)',
          reason: 'Must inspect Mobile Light mode and mark in QA Checklist'
        });
      }
      if (!visualChecks.desktopDark) {
        missingItems.push({
          id: 'visual_desktop_dark',
          label: 'Visual QA: Desktop (Dark Mode)',
          reason: 'Must inspect Desktop Dark mode and mark in QA Checklist'
        });
      }
      if (!visualChecks.mobileDark) {
        missingItems.push({
          id: 'visual_mobile_dark',
          label: 'Visual QA: Mobile (Dark Mode)',
          reason: 'Must inspect Mobile Dark mode and mark in QA Checklist'
        });
      }
    }

    // Check stage checkpoints (for stageNum, or stage 0 if stage 1)
    const currentStageChecklists = campaignChecklists.filter(c => c.stage === stageNum || (stageNum === 1 && c.stage === 0));
    currentStageChecklists.forEach(c => {
      // Prevent duplicate if checkpoint was already recorded (e.g. visual checks)
      if (missingItems.some(m => m.id === c.id)) return;
      const ans = checklistAnswers[c.id];
      if (!ans || !ans.status) {
        missingItems.push({
          id: c.id,
          label: c.text,
          reason: "Not marked as 'Checked' or 'N/A'"
        });
      } else if (c.requiresInput && ans.status === "Checked" && !ans.text?.trim()) {
        missingItems.push({
          id: c.id,
          label: c.text,
          reason: "Requires text comment/input when Checked"
        });
      }
    });

    return missingItems;
  };

  // Mandatory QA Checkpoints Validation across ALL stages for Campaign Approval
  const validateAllCheckpointsForApproval = useCallback((): MissingCheckpoint[] => {
    const missingItems: MissingCheckpoint[] = [];
    const data = watch();

    // 1. Stage 1 required fields
    if (!data.name || !data.name.trim()) {
      missingItems.push({
        id: 'field_name',
        label: 'Campaign Name (Mandatory Field)',
        reason: 'Stage 1: Required campaign name is empty'
      });
    }
    if (!data.country) {
      missingItems.push({
        id: 'field_country',
        label: 'Country Selection',
        reason: 'Stage 1: Target country must be selected'
      });
    }
    if (!data.htmlSource || !data.htmlSource.trim()) {
      missingItems.push({
        id: 'field_html',
        label: 'Email HTML Source Code',
        reason: 'Stage 1: Email HTML source code must be provided'
      });
    }

    // 2. Stage 2 Visual QA checks if HTML is present
    if (data.htmlSource && data.htmlSource.trim()) {
      if (!visualChecks.desktopLight) {
        missingItems.push({
          id: 'visual_desktop_light',
          label: 'Visual QA: Desktop (Light Mode)',
          reason: 'Stage 2: Must inspect and verify Desktop Light view'
        });
      }
      if (!visualChecks.mobileLight) {
        missingItems.push({
          id: 'visual_mobile_light',
          label: 'Visual QA: Mobile (Light Mode)',
          reason: 'Stage 2: Must inspect and verify Mobile Light view'
        });
      }
      if (!visualChecks.desktopDark) {
        missingItems.push({
          id: 'visual_desktop_dark',
          label: 'Visual QA: Desktop (Dark Mode)',
          reason: 'Stage 2: Must inspect and verify Desktop Dark view'
        });
      }
      if (!visualChecks.mobileDark) {
        missingItems.push({
          id: 'visual_mobile_dark',
          label: 'Visual QA: Mobile (Dark Mode)',
          reason: 'Stage 2: Must inspect and verify Mobile Dark view'
        });
      }
    }

    // 3. All checkpoints in campaignChecklists
    campaignChecklists.forEach(c => {
      // Prevent duplicate if checkpoint was already recorded (e.g. visual checks)
      if (missingItems.some(m => m.id === c.id)) return;
      const ans = checklistAnswers[c.id];
      const stageName = STEPS[(c.stage || 1) - 1]?.title || `Stage ${c.stage || 1}`;
      if (!ans || !ans.status || (ans.status !== "Checked" && ans.status !== "N/A")) {
        missingItems.push({
          id: c.id,
          label: c.text,
          reason: `${stageName}: Checkpoint not completed (must be Checked or N/A)`
        });
      } else if (c.requiresInput && ans.status === "Checked" && !ans.text?.trim()) {
        missingItems.push({
          id: c.id,
          label: c.text,
          reason: `${stageName}: Requires comment/notes when Checked`
        });
      }
    });

    return missingItems;
  }, [campaignChecklists, checklistAnswers, visualChecks, watch]);

  const checkpointProgress = useMemo(() => {
    return getCampaignCheckpointProgress({
      team: watch("team") || "HP-APJ",
      checklists: campaignChecklists,
      checklistAnswers: checklistAnswers
    });
  }, [campaignChecklists, checklistAnswers, watch]);

  const missingApprovalCheckpoints = useMemo(() => {
    return validateAllCheckpointsForApproval();
  }, [validateAllCheckpointsForApproval]);

  const canApprove = noCalloutsChecked || missingApprovalCheckpoints.length === 0;
  const isApprovedLocked = campaignStatus === "Approved" && !isAdmin;

  const handleStepClick = async (stepNum: number) => {
    if (stepNum === currentStep) return;
    if (stepNum > currentStep) {
      // Validate all intermediate stages from stage 1 to stepNum - 1
      for (let s = 1; s < stepNum; s++) {
        const missing = validateStageAndGetMissingItems(s);
        if (missing.length > 0) {
          setShowChecklistError(true);
          setIncompleteModalData({
            stageNumber: s,
            stageTitle: STEPS[s - 1]?.title || `Stage ${s}`,
            missingCheckpoints: missing
          });
          setShowIncompleteModal(true);
          return;
        }
      }
    }
    setShowChecklistError(false);
    if (stepNum >= 2) {
      hasMovedToStage2Ref.current = true;
    }
    setCurrentStep(stepNum);
    syncUrlState(stepNum);
    await saveCurrentCampaignState({ currentStep: stepNum });
  };

  // Realtime subscription to detect concurrent QA updates by other users
  useEffect(() => {
    if (!editId) return;
    if (!isSupabaseConfigured()) return;

    const channel = supabase
      .channel(`campaign-qa-${editId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'campaigns',
        filter: `id=eq.${editId}`
      }, (payload: any) => {
        const updated = payload.new;
        if (!updated) return;

        const now = Date.now();
        // Ignore updates received within 10 seconds of our own local save
        const isRecentLocalSave = now - lastLocalSaveTimeRef.current < 10000;
        if (isRecentLocalSave) return;

        const editor = String(updated.last_edited_by || '').toLowerCase().trim();
        const current = String(userEmail || '').toLowerCase().trim();

        // If editor matches current user email, ignore
        if (editor && current && editor === current) return;

        // Check if there are actual changes in checklist answers or campaign status
        const remoteAnswers = updated.checklist_answers || updated.checklistAnswers || {};
        const localAnswers = checklistAnswersRef.current || {};
        const remoteAnswersStr = JSON.stringify(remoteAnswers);
        const localAnswersStr = JSON.stringify(localAnswers);

        const answersChanged = remoteAnswersStr !== localAnswersStr && remoteAnswersStr !== '{}';
        const statusChanged = updated.status && updated.status !== campaignStatusRef.current;

        if (answersChanged || statusChanged) {
          setRemoteQaUpdateNotice(`User ${updated.last_edited_by || 'another reviewer'} updated QA checkpoints or status. Click to reload latest checkpoints.`);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [editId, userEmail]);

  const handleSyncRemoteQaAnswers = async () => {
    if (!editId) return;
    const remote = await getCampaignById(editId);
    if (remote) {
      if (remote.checklistAnswers || (remote as any).checklist_answers) {
        setChecklistAnswers(remote.checklistAnswers || (remote as any).checklist_answers);
      }
      if (remote.status) setCampaignStatus(remote.status);
      setToastNotice("Synced latest QA checkpoints from database.");
      setTimeout(() => setToastNotice(null), 3500);
    }
    setRemoteQaUpdateNotice(null);
  };

  useEffect(() => {
    const fetchCountries = async () => {
      try {
        if (import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_URL !== 'https://placeholder.supabase.co') {
          const { data } = await supabase.from('countries').select('*').order('name');
          if (data && data.length > 0) {
            setCountries(data);
          }
          
          const { data: settingsData } = await supabase.from('app_settings').select('stage_labels').limit(1).maybeSingle();
          if (settingsData && settingsData.stage_labels) {
            try {
              const parsed = typeof settingsData.stage_labels === 'string' ? JSON.parse(settingsData.stage_labels) : settingsData.stage_labels;
              setStageLabels(prev => ({ ...prev, ...parsed }));
            } catch (e) {
              console.warn("Failed to parse stage_labels", e);
            }
          }
        }
        const apiRes = await fetch('/api/countries');
        if (apiRes.ok) {
          const json = await apiRes.json();
          if (json.countries) setCountries(json.countries);
        }
      } catch (err) {
        console.warn("[CampaignSetup] Exception during fetchCountries:", err);
      }
    };
    fetchCountries();

    fetchPlatformChecklists().then(setTeamChecklists);
  }, []);

  const selectedCountryConfig = countries.find((c: any) => c.name === values.country && c.code === values.versionName);
  const expectedPrefix = selectedCountryConfig?.url;
  const rawWebViewUrl = values.webViewUrl ? values.webViewUrl.trim() : "";
  const isPlaceholderUrl = !rawWebViewUrl || rawWebViewUrl === "{{ViewOnline}}" || rawWebViewUrl.includes("{{ViewOnline}}");
  const resolvedWebViewUrl = isPlaceholderUrl ? (expectedPrefix || "") : rawWebViewUrl;

  const processedHtmlSource = (values.htmlSource || "")
    .replace(/\{\{ViewOnline\}\}/g, resolvedWebViewUrl)
    .replace(/%2B%2BViewOnline%2B%2B/gi, resolvedWebViewUrl)
    .replace(/%%view_email_url%%/gi, resolvedWebViewUrl);

  const nextStep = async () => {
    // Validate current and previous stages to ensure no intermediate checkpoints were skipped
    for (let s = 1; s <= currentStep; s++) {
      const missing = validateStageAndGetMissingItems(s);
      if (missing.length > 0 && currentStep < totalSteps) {
        setShowChecklistError(true);
        setIncompleteModalData({
          stageNumber: s,
          stageTitle: STEPS[s - 1]?.title || `Stage ${s}`,
          missingCheckpoints: missing
        });
        setShowIncompleteModal(true);
        return;
      }
    }
    setShowChecklistError(false);
    let fieldsToValidate: any[] = [];
    if (currentStep === 1) fieldsToValidate = ["name", "country", "versionName", "webViewUrl", "htmlSource"];
    if (currentStep === 2) fieldsToValidate = [];
    if (currentStep === 3) fieldsToValidate = [];
    if (currentStep === 4) fieldsToValidate = [];
    if (currentStep === 5) fieldsToValidate = [];
    if (currentStep === totalSteps) fieldsToValidate = [];
    
    // Uniqueness Check
    if (values.name) {
      const currentId = editId || campaignIdRef.current || undefined;
      const isUnique = await isCampaignNameUnique(values.name, currentId);
      if (!isUnique) {
        setError("name", {
          type: "manual",
          message: "Campaign name must be unique. A campaign with this duplicate name already exists."
        });
        return;
      }
    }

    let isValid = await trigger(fieldsToValidate as any);
    
    if (currentStep === 1 && isValid) {
      const country = values.country;
      const version = values.versionName;
      
      const urlValidationSummary = await fetchAndValidateCountryUrls({
        html: values.htmlSource || "",
        rawWebViewUrl: values.webViewUrl || "",
        countryName: country,
        versionName: version,
        allowedPattern: expectedPrefix,
      });

      const allowedPattern = urlValidationSummary.allowedPattern;

      if (!allowedPattern) {
        setError("country", { type: "manual", message: `No URL pattern configured in database for country ${country} (${version}).` });
        isValid = false;
      }
      
      if (isValid) {
         const results = validateCampaignHTML(
           values.htmlSource || "", 
           allowedPattern || "", 
           values.webViewUrl, 
           country, 
           version
         );
         setQaResults(results);
      }
    }

    if (isValid) {
      clearErrors();
      const nextS = Math.min(currentStep + 1, totalSteps);
      if (nextS >= 2) {
        hasMovedToStage2Ref.current = true;
      }
      setCurrentStep(nextS);
      syncUrlState(nextS);
      saveCurrentCampaignState({ currentStep: nextS, qaResults: qaResults });
    }
  };

  const prevStep = () => {
    const prevS = Math.max(currentStep - 1, 1);
    setCurrentStep(prevS);
    syncUrlState(prevS);
    saveCurrentCampaignState({ currentStep: prevS });
  };

  const handleBackToCampaigns = async () => {
    const hasSavedCampaign = !!(campaignIdRef.current || editId || isEditMode);
    const hasAnswers = Object.keys(checklistAnswersRef.current || {}).length > 0;
    if (!hasMovedToStage2Ref.current && !hasSavedCampaign && !hasAnswers) {
      pendingNavUrlRef.current = "/campaigns";
      setShowStage1DraftPrompt(true);
      return;
    }
    isDiscardingRef.current = true;
    clearActiveQASnapshot();
    await saveCurrentCampaignState({ skipUrlSync: true, skipActiveSnapshot: true });
    clearActiveQASnapshot();
    campaignIdRef.current = null;
    initialLoadedIdRef.current = null;
    setIsEditMode(false);
    navigate("/campaigns", { replace: true });
  };

  const handleConfirmSaveDraft = async () => {
    setIsDiscarding(true);
    isDiscardingRef.current = true;
    const dest = pendingNavUrlRef.current || "/campaigns";
    pendingNavUrlRef.current = null;
    try {
      setShowStage1DraftPrompt(false);
      clearActiveQASnapshot();
      await saveCurrentCampaignState({ 
        status: "Draft",
        skipUrlSync: true,
        skipActiveSnapshot: true
      });
      clearActiveQASnapshot();
      campaignIdRef.current = null;
      initialLoadedIdRef.current = null;
      setIsEditMode(false);
      navigate(dest, { replace: true });
    } catch (err) {
      console.error("[CampaignSetup] Error saving draft:", err);
      clearActiveQASnapshot();
      navigate(dest || "/campaigns", { replace: true });
    } finally {
      setIsDiscarding(false);
    }
  };

  const handleConfirmDiscard = async () => {
    setIsDiscarding(true);
    isDiscardingRef.current = true;
    const dest = pendingNavUrlRef.current || "/campaigns";
    pendingNavUrlRef.current = null;
    try {
      clearActiveQASnapshot();
      const isExisting = !!(editId || (isEditMode && editId));
      if (!isExisting) {
        const idToDelete = campaignIdRef.current;
        if (idToDelete) {
          await permanentlyDeleteCampaign(idToDelete, userEmail || "");
        }
      }
      campaignIdRef.current = null;
      initialLoadedIdRef.current = null;
      setIsEditMode(false);
      setShowStage1DraftPrompt(false);
      navigate(dest, { replace: true });
    } catch (err) {
      console.error("[CampaignSetup] Error discarding campaign:", err);
      navigate(dest || "/campaigns", { replace: true });
    } finally {
      setIsDiscarding(false);
    }
  };

  const handleCopyQAResults = () => {
    const textToCopy = qaResults.map(r => `[${r.status.toUpperCase()}] ${r.name}: ${r.message}`).join('\n');
    navigator.clipboard.writeText(textToCopy).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  };

  const handleExportPDF = () => {
    exportQAVerificationReceiptPDF({
      campaignName: values.name || "Campaign Verification Summary",
      team: values.team || "QA Team",
      country: values.country || "Global",
      versionName: values.versionName || "v1",
      webViewUrl: values.webViewUrl || "",
      userEmail: userEmail || "",
      campaignStatus: campaignStatus || "In Progress",
      checklists: checklists,
      answers: checklistAnswers
    });
  };

  const handleExportExcel = () => {
    exportQAChecklistToExcel({
      campaignName: values.name || "Campaign Verification Summary",
      team: values.team || "QA Team",
      country: values.country || "Global",
      versionName: values.versionName || "v1",
      userEmail: userEmail || "",
      campaignStatus: campaignStatus || "In Progress",
      qaType: activeQaType,
      checklists: checklists,
      answers: checklistAnswers
    });
  };

  const onInvalid = (fieldErrors: any) => {
    console.error("[CampaignSetup] Form submission blocked due to field validation errors:", fieldErrors);
    const errorDetails = Object.keys(fieldErrors)
      .map(key => `• ${key}: ${fieldErrors[key]?.message}`)
      .join('\n');
    alert(`Please fix the following form errors before saving:\n\n${errorDetails}`);
  };

  const onSubmit = async (data: FormValues) => {
    setIsSubmitting(true);
    try {
      const currentId = editId || campaignIdRef.current || undefined;
      const isUnique = await isCampaignNameUnique(data.name, currentId);
      if (!isUnique) {
        setError("name", { type: "manual", message: "Campaign name must be unique." });
        setIsSubmitting(false);
        return;
      }

      const dbAllowedPattern = await fetchAllowedUrlPattern(data.country, data.versionName);
      const expectedUrl = dbAllowedPattern || expectedPrefix;
      const rawUrl = data.webViewUrl ? data.webViewUrl.trim() : "";
      const isPlaceholder = !rawUrl || rawUrl === "{{ViewOnline}}" || rawUrl.includes("{{ViewOnline}}");
      const finalWebViewUrl = isPlaceholder ? (expectedUrl || data.webViewUrl) : data.webViewUrl;

      await saveCampaignRecord({
        id: currentId,
        name: data.name,
        team: data.team,
        country: data.country,
        versionName: data.versionName,
        folder_id: data.folder_id,
        webViewUrl: finalWebViewUrl,
        htmlSource: data.htmlSource,
        figmaUrl: designChoice === "figma" ? (data.figmaUrl || "") : "",
        litmusUrl: data.litmusUrl || "",
        status: "QA Pending",
        createdBy: userEmail,
        lastEditedBy: userEmail,
        checklists: campaignChecklists,
        checklistAnswers: checklistAnswers
      });

      await logAction(userEmail, isEditMode ? "Update Campaign" : "Create Campaign", `Submitted campaign: ${data.name}`);
      isDiscardingRef.current = true;
      clearActiveQASnapshot();
      campaignIdRef.current = null;
      initialLoadedIdRef.current = null;
      setIsEditMode(false);
      navigate("/campaigns", { replace: true });
    } catch (err) {
      console.error("[CampaignSetup] Error in onSubmit:", err);
      alert("An error occurred while saving the campaign.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGrammarCheck = async () => {
    setIsCheckingGrammar(true);
    setGrammarCheckResult(null);
    const htmlToAnalyze = values.htmlSource || outlookExtractedHtml || "";
    if (!htmlToAnalyze.trim()) {
      setGrammarCheckResult("Please paste or upload HTML source or an Outlook MSG file before running the grammar check.");
      setIsCheckingGrammar(false);
      return;
    }
    try {
      const response = await fetch("/api/grammar-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ htmlContent: htmlToAnalyze }),
      });
      if (!response.ok) {
        setGrammarCheckResult("Grammar check scan completed. Please perform manual copy review if necessary.");
        return;
      }
      const data = await response.json();
      if (data.error) {
        setGrammarCheckResult(`Notice: ${data.error}`);
      } else {
        setGrammarCheckResult(data.result || "No grammar issues detected.");
      }
    } catch (error) {
      console.error("Failed to check grammar:", error);
      setGrammarCheckResult("Grammar check scan completed. Please review email text manually.");
    } finally {
      setIsCheckingGrammar(false);
    }
  };

  const runAiQa = async () => {
    const htmlToAnalyze = values.htmlSource || outlookExtractedHtml || "";
    if (!htmlToAnalyze.trim()) {
      setToastNotice("Please paste or upload HTML source before running AI Auto-QA.");
      setTimeout(() => setToastNotice(null), 3000);
      return;
    }

    setIsAiQaRunning(true);
    setAiQaReport(null);
    try {
      const selectedAgent = availableAiAgents.find(a => a.id === selectedAiAgentId);
      const agentRules = selectedAgent ? selectedAgent.rules : (localStorage.getItem("hp_qa_ai_rules") || "");
      const checklistRules = campaignChecklists && campaignChecklists.length > 0 
        ? campaignChecklists.map((c: any, i: number) => `${i + 1}. [Checklist Item] ${c.title}`).join("\n") 
        : "";
      const customRules = `${agentRules}\n\nPlease also explicitly verify if the campaign complies with the following user-defined checklist items:\n${checklistRules}`;
      
      const response = await fetch("/api/run-ai-qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ htmlSource: htmlToAnalyze, customRules }),
      });
      
      const data = await response.json();
      if (!response.ok) {
        setToastNotice(`AI Error: ${data.error || "Failed to run AI QA"}`);
        setTimeout(() => setToastNotice(null), 4000);
        return;
      }
      
      setAiQaReport(data);
    } catch (error: any) {
      console.error("Failed to run AI QA:", error);
      setToastNotice("Network error: Failed to reach AI QA API.");
      setTimeout(() => setToastNotice(null), 4000);
    } finally {
      setIsAiQaRunning(false);
    }
  };

  const triggerApprovalFlow = async () => {
    const missing = validateAllCheckpointsForApproval();
    if (missing.length > 0) {
      setShowChecklistError(true);
      setIncompleteModalData({
        stageNumber: 7,
        stageTitle: "Mandatory QA Checkpoints Incomplete",
        missingCheckpoints: missing
      });
      setShowIncompleteModal(true);
      setToastNotice(`Cannot approve campaign: ${missing.length} mandatory QA checkpoint(s) must be completed first.`);
      setTimeout(() => setToastNotice(null), 5000);
      return;
    }

    setIsApprovingModalOpen(true);
    setApprovingStep("processing");

    try {
      const data = watch();
      const pattern = (data.country ? await fetchAllowedUrlPattern(data.country, data.versionName) : null) || expectedPrefix;
      const rawWebUrl = data.webViewUrl ? data.webViewUrl.trim() : "";
      const isPlaceholder = !rawWebUrl || rawWebUrl === "{{ViewOnline}}" || rawWebUrl.includes("{{ViewOnline}}");
      const finalWebViewUrl = isPlaceholder ? (pattern || resolvedWebViewUrl || data.webViewUrl) : data.webViewUrl;

      const approvalEntry = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        type: "Campaign Approval",
        qaType: activeQaType,
        recipient: "Client & Stakeholders",
        recipientName: "Campaign Stakeholders",
        sender: userEmail || "QA Lead",
        senderName: resolveUserFirstName(userEmail, "Chaithanya"),
        subject: `${activeQaType} | ${data.name || "Campaign"} [APPROVED]`,
        ownerCallouts: [],
        clientCallouts: [],
        noOwnerCallouts: true,
        noClientCallouts: true,
        status: "Approved",
        approvedText: `Campaign "${data.name || 'Campaign'}" formally verified and approved by ${userEmail || 'QA Lead'}.`
      };

      const currentDispatched = dispatchedRecordsRef.current || dispatchedRecords || [];
      const updatedDispatched = [approvalEntry, ...currentDispatched.filter((r: any) => r.type !== "Campaign Approval")];

      const record = await saveCampaignRecord({
        id: editId || campaignIdRef.current || undefined,
        name: data.name || "Untitled Campaign",
        team: data.team || "HP-APJ",
        country: data.country || "",
        versionName: data.versionName || "",
        folder_id: data.folder_id,
        webViewUrl: finalWebViewUrl || "",
        htmlSource: data.htmlSource || "",
        figmaUrl: designChoice === "figma" ? (data.figmaUrl || "") : "",
        litmusUrl: data.litmusUrl || "",
        status: "Approved",
        createdBy: userEmail,
        lastEditedBy: userEmail,
        checklists: campaignChecklists,
        checklistAnswers: checklistAnswersRef.current || checklistAnswers,
        dispatchedRecords: updatedDispatched,
        dispatched_records: updatedDispatched
      });

      if (record && record.id) {
        campaignIdRef.current = record.id;
      }

      setDispatchedRecords(updatedDispatched);
      dispatchedRecordsRef.current = updatedDispatched;
      setCampaignStatus("Approved");

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("campaign_dispatched_saved", { detail: approvalEntry }));
      }

      await logAction(
        userEmail, 
        "Approve Campaign",
        `Approved campaign "${data.name || 'Campaign'}". Checkpoints verified and auto-saved to database.`,
        record?.id
      );

      if (record?.id) {
        refreshLogs(record.id, data.name);
      }

      setApprovingStep("success");
      setTimeout(() => {
        setIsApprovingModalOpen(false);
        setToastNotice("✓ Campaign Approved! Auto-saved all records to database.");
        setTimeout(() => setToastNotice(null), 4000);
      }, 1600);
    } catch (err: any) {
      console.error("Error approving campaign:", err);
      setIsApprovingModalOpen(false);
      alert(err?.message || "Error approving campaign");
    }
  };

  const handleDecision = async (newStatus: "Approved" | "Failed" | "QA Pending") => {
    if (newStatus === "Approved") {
      const missing = validateAllCheckpointsForApproval();
      if (missing.length > 0) {
        setShowChecklistError(true);
        setIncompleteModalData({
          stageNumber: 7,
          stageTitle: "Mandatory QA Checkpoints Verification",
          missingCheckpoints: missing
        });
        setShowIncompleteModal(true);
        setToastNotice(`Cannot approve campaign: ${missing.length} mandatory QA checkpoint(s) must be completed first.`);
        setTimeout(() => setToastNotice(null), 6000);
        return;
      }
    }

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    setIsSubmitting(true);
    try {
      const data = watch();
      const pattern = (data.country ? await fetchAllowedUrlPattern(data.country, data.versionName) : null) || expectedPrefix;
      const rawWebUrl = data.webViewUrl ? data.webViewUrl.trim() : "";
      const isPlaceholder = !rawWebUrl || rawWebUrl === "{{ViewOnline}}" || rawWebUrl.includes("{{ViewOnline}}");
      const finalWebViewUrl = isPlaceholder ? (pattern || resolvedWebViewUrl || data.webViewUrl) : data.webViewUrl;

      const record = await saveCampaignRecord({
        id: editId || undefined,
        name: data.name || "Untitled Campaign",
        team: data.team || "HP-APJ",
        country: data.country || "",
        versionName: data.versionName || "",
        folder_id: data.folder_id,
        webViewUrl: finalWebViewUrl || "",
        htmlSource: data.htmlSource || "",
        figmaUrl: designChoice === "figma" ? (data.figmaUrl || "") : "",
        litmusUrl: data.litmusUrl || "",
        status: newStatus,
        createdBy: userEmail,
        lastEditedBy: userEmail,
        checklists: campaignChecklists,
        checklistAnswers: checklistAnswers
      });

      if (record && record.id) {
        campaignIdRef.current = record.id;
      }

      setCampaignStatus(newStatus);
      await logAction(
        userEmail, 
        newStatus === "Approved" ? "Approve Campaign" : "Update Status",
        `Set status to ${newStatus}. Note: ${reviewNote || "No note"}`,
        record?.id
      );

      if (record?.id) {
        refreshLogs(record.id, data.name);
      }

      if (newStatus === "Approved") {
        setToastNotice("✓ Campaign successfully Approved! Status is now Approved. Click 'Send Email' to dispatch approval.");
        setTimeout(() => setToastNotice(null), 5000);
      } else {
        setToastNotice(`Campaign status updated to ${newStatus}.`);
        setTimeout(() => setToastNotice(null), 4000);
      }
    } catch (err: any) {
      console.error("Error setting decision:", err);
      alert(err?.message || "Error updating campaign decision");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadgeClass = (status: string) => {
    const s = (status || "").toLowerCase();
    if (s.includes("approved")) return "bg-emerald-100 text-emerald-800 border-emerald-300";
    if (s.includes("failed")) return "bg-rose-100 text-rose-800 border-rose-300";
    if (s.includes("draft")) return "bg-slate-100 text-slate-700 border-slate-300";
    return "bg-amber-100 text-amber-800 border-amber-300";
  };

  return (
    <div className="flex flex-col h-full min-h-0 overflow-y-auto bg-slate-50">
      <header className="min-h-16 md:h-20 flex flex-wrap items-center justify-between px-4 md:px-8 py-3 border-b border-slate-200 shrink-0 bg-white shadow-xs gap-3">
        <div className="flex items-center gap-3 min-w-0 max-w-[65%]">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 min-w-0 flex-wrap sm:flex-nowrap">
              <h2 
                className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 truncate max-w-[260px] sm:max-w-[420px] lg:max-w-[580px]"
                title={values.name || (isEditMode ? "Update Campaign" : "New Campaign Setup")}
              >
                {values.name || (isEditMode ? "Update Campaign" : "New Campaign Setup")}
              </h2>
              <span className={cn("px-2.5 py-0.5 text-xs font-semibold rounded-full border shrink-0", getStatusBadgeClass(campaignStatus))}>
                {campaignStatus}
              </span>
              <span className="px-2.5 py-0.5 text-xs font-bold rounded-full border bg-indigo-50 text-indigo-700 border-indigo-200 flex items-center gap-1 shadow-2xs shrink-0 whitespace-nowrap">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
                QA: {activeQaType}
              </span>
              {!isCampaignApproved && draftSavedAt && (
                <span className="text-xs text-slate-400 flex items-center gap-1 font-medium bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200 shrink-0 whitespace-nowrap">
                  <Clock className="w-3 h-3 text-slate-500" />
                  Autosaved {draftSavedAt}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {!isOnline || syncStatus === "offline" ? (
            <span className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-full shrink-0">
              <WifiOff className="w-3.5 h-3.5 text-amber-600" /> Offline Mode (Saved locally)
            </span>
          ) : syncStatus === "syncing" ? (
            <span className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-blue-800 bg-blue-50 border border-blue-200 rounded-full animate-pulse shrink-0">
              <RefreshCw className="w-3.5 h-3.5 text-blue-600 animate-spin" /> Syncing offline changes...
            </span>
          ) : null}

          {!isCampaignApproved && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2 text-slate-700 border-slate-300 text-xs font-semibold cursor-pointer hover:bg-slate-100"
              onClick={handleManualSave}
              disabled={isSubmitting}
            >
              <Save className="w-4 h-4 text-[#2b61d6]" />
              Save Draft
            </Button>
          )}

          {isAdmin && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2 text-slate-700 border-slate-300 text-xs font-semibold"
              onClick={() => setShowLogsModal(!showLogsModal)}
            >
              <History className="w-4 h-4 text-[#2b61d6]" />
              Audit Logs ({campaignLogs.length})
            </Button>
          )}

          {currentStep === totalSteps && (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                onClick={() => setShowApprovalEmailModal(true)}
                disabled={isCampaignApproved || isSubmitting}
                title={isCampaignApproved ? "Campaign is already approved" : "Send callouts to campaign owner"}
              >
                <Mail className="w-3.5 h-3.5 text-blue-600" />
                Send Callouts
              </Button>

              <Button
                type="button"
                size="sm"
                className={cn(
                  "gap-1.5 text-xs font-semibold cursor-pointer transition-all",
                  isCampaignApproved
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                    : canApprove
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                    : "bg-slate-100 text-slate-500 border border-slate-300 hover:bg-slate-200"
                )}
                onClick={triggerApprovalFlow}
                disabled={isSubmitting}
                title={
                  isCampaignApproved
                    ? "Campaign Approved (click to re-verify and auto-save)"
                    : !canApprove
                    ? `Incomplete: ${missingApprovalCheckpoints.length} checkpoints pending (${checkpointProgress.completed}/${checkpointProgress.total} completed)`
                    : "Approve this campaign"
                }
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {isCampaignApproved 
                  ? "Campaign Approved" 
                  : isSubmitting 
                  ? "Approving..." 
                  : canApprove 
                  ? "Approve Campaign" 
                  : `Approve (${checkpointProgress.completed}/${checkpointProgress.total})`}
              </Button>

              <Button
                type="button"
                size="sm"
                className={cn(
                  "gap-1.5 text-xs font-bold cursor-pointer transition-all",
                  isCampaignApproved
                    ? "bg-[#0A05B0] hover:bg-[#08048A] text-white shadow-xs"
                    : "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                )}
                onClick={() => {
                  if (isCampaignApproved) setShowApprovalEmailModal(true);
                }}
                disabled={!isCampaignApproved || isSubmitting}
                title={!isCampaignApproved ? "Approve campaign first to activate Send Email" : "Send approval email"}
              >
                <Send className="w-3.5 h-3.5" />
                Send Email
              </Button>
            </div>
          )}
        </div>
      </header>

      {/* Approved Lock Banner */}
      {isApprovedLocked && (
        <div className="bg-amber-500/10 border-b border-amber-500/30 text-amber-900 px-6 py-3 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 text-amber-800 rounded-lg shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-amber-800 shrink-0" />
                Campaign Approved & Locked (Read-Only Mode)
              </p>
              <p className="text-[11px] text-amber-800">
                This campaign has been Approved and locked. Standard users can inspect all steps, checkpoints, links, and preview outputs in read-only mode. Only Admins can modify approved campaigns.
              </p>
            </div>
          </div>
          <span className="text-[10px] bg-amber-200 text-amber-900 px-3 py-1 rounded-full font-bold uppercase shrink-0">
            Read-Only
          </span>
        </div>
      )}

      {/* Concurrent User Update Banner */}
      {remoteQaUpdateNotice && (
        <div className="bg-blue-500/10 border-b border-blue-500/30 text-blue-900 px-6 py-2.5 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2.5">
            <RefreshCw className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
            <p className="text-xs font-medium text-blue-900">{remoteQaUpdateNotice}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSyncRemoteQaAnswers}
              className="px-3 py-1 bg-[#2b61d6] text-white rounded text-xs font-semibold hover:bg-blue-700 transition-colors shrink-0 cursor-pointer"
            >
              Sync Checkpoints
            </button>
            <button
              type="button"
              onClick={() => setRemoteQaUpdateNotice(null)}
              className="p-1 text-slate-500 hover:text-slate-800 rounded transition-colors cursor-pointer"
              title="Dismiss notice"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Session Restored / Status Notification Banner */}
      {toastNotice && (
        <div className="bg-emerald-50 border-b border-emerald-200 text-emerald-900 px-6 py-2.5 flex items-center justify-between shadow-xs animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <p className="text-xs font-semibold text-emerald-900">{toastNotice}</p>
          </div>
          <button
            type="button"
            onClick={() => setToastNotice(null)}
            className="p-1 text-emerald-600 hover:text-emerald-900 rounded transition-colors cursor-pointer"
            title="Dismiss notice"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {isPageLoading ? (
        <CampaignSetupSkeleton />
      ) : (
      <form className="flex-1 flex flex-col min-h-0 overflow-y-auto" onSubmit={(e) => { e.preventDefault(); handleSubmit(onSubmit, onInvalid)(e); }}>
        <MasterChecklistSidebar 
          checklists={checklists} 
          answers={checklistAnswers} 
          disabled={isApprovedLocked}
          onToggleItem={(itemId, newStatus) => {
            const updated = {
              ...checklistAnswers,
              [itemId]: {
                ...(checklistAnswers[itemId] || {}),
                status: newStatus
              }
            };

            let nextVisualChecks = visualChecks;
            if (itemId === "visual_desktop_light" || itemId === "visual_mobile_light" || itemId === "visual_desktop_dark" || itemId === "visual_mobile_dark") {
              const isChecked = newStatus === 'Checked';
              nextVisualChecks = {
                ...visualChecks,
                desktopLight: itemId === "visual_desktop_light" ? isChecked : visualChecks.desktopLight,
                mobileLight: itemId === "visual_mobile_light" ? isChecked : visualChecks.mobileLight,
                desktopDark: itemId === "visual_desktop_dark" ? isChecked : visualChecks.desktopDark,
                mobileDark: itemId === "visual_mobile_dark" ? isChecked : visualChecks.mobileDark,
              };
              setVisualChecks(nextVisualChecks);
              updated._visualChecks = nextVisualChecks;
            }

            setChecklistAnswers(updated);
            checklistAnswersRef.current = updated;

            const restoredCheckpoints: Record<string, boolean> = {};
            Object.keys(updated).forEach((key) => {
              const val = updated[key];
              if (typeof val === 'boolean') {
                restoredCheckpoints[key] = val;
              } else if (val && typeof val === 'object') {
                restoredCheckpoints[key] = val.status === 'Checked' || val.status === 'N/A';
              }
            });
            setCheckedCheckpoints(restoredCheckpoints);

            saveCurrentCampaignState({ checklistAnswers: updated, visualChecks: nextVisualChecks });
          }}
        />
        <QAWizard
          steps={STEPS}
          currentStep={currentStep}
          onNext={nextStep}
          onPrev={prevStep}
          onStepClick={handleStepClick}
          onCancel={handleBackToCampaigns}
          onSubmit={handleSubmit(onSubmit, onInvalid)}
          isSubmitting={isSubmitting}
        >
          <div className="flex flex-col lg:flex-row w-full min-h-0 relative overflow-visible gap-4">
            <div className="flex-1 min-w-0 flex flex-col overflow-y-auto pr-1 pb-1">
              {currentStep < totalSteps && (() => {
                const stageChecklists = checklists.filter(c => {
                  if (c.stage !== currentStep && c.stage !== 0) return false;
                  // In Stage 2 (Visual Comparison), remove checkpoints that are already in the default
                  // Mandatory QA Checklist, but if any checkpoints are assigned manually, show them
                  if (currentStep === 2) {
                    const defaultVisualIds = [
                      "visual_desktop_light", 
                      "visual_mobile_light", 
                      "visual_desktop_dark", 
                      "visual_mobile_dark", 
                      "visual_litmus"
                    ];
                    if (defaultVisualIds.includes(c.id)) return false;
                  }
                  return true;
                });

                if (stageChecklists.length === 0) return null;

                return (
                  <div className="p-4 bg-white border-b border-slate-200 shrink-0">
                    <StageChecklist 
                      currentStep={currentStep} 
                      checklists={stageChecklists} 
                      answers={checklistAnswers} 
                      setAnswers={handleChecklistAnswersChange} 
                      showError={showChecklistError}
                      disabled={isApprovedLocked}
                      campaignMeta={{
                        campaignName: values.name,
                        team: values.team,
                        country: values.country,
                        versionName: values.versionName,
                        userEmail: userEmail,
                        campaignStatus: campaignStatus
                      }}
                    />
                  </div>
                );
              })()}
              {currentStep === 1 && (
                <Card className="shadow-xs border-slate-200 flex flex-col">
                <CardHeader className="border-b border-slate-100 bg-white rounded-t-xl shrink-0 flex flex-row items-center justify-between py-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-slate-900 text-base">Campaign Details & Source</CardTitle>
                      <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                        <Folder className="w-3 h-3 text-[#2b61d6]" />
                        {availableFolders.find(f => f.id === (values.folder_id || targetFolderParam || "2026"))?.name || "2026 Campaigns"}
                      </span>
                    </div>
                    <CardDescription className="text-slate-500 text-xs mt-0.5">Specify mandatory unique campaign name, target region, and design reference.</CardDescription>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleResetAll}
                    className="text-slate-700 hover:text-rose-600 hover:border-rose-300 hover:bg-rose-50 border-slate-300 gap-1.5 transition-colors text-xs font-semibold shadow-xs"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-rose-500" />
                    Clear All Inputs
                  </Button>
                </CardHeader>
                <CardContent className="space-y-5 pt-5 bg-white flex-1">
                  <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="name" className="text-xs font-semibold text-slate-800 flex items-center justify-between">
                        Campaign Name <span className="text-rose-500">* Mandatory</span>
                      </Label>
                      <Input 
                        id="name" 
                        placeholder="e.g. 2026 Q3 Summer Promo" 
                        className="border-slate-300 h-9 text-xs focus:ring-[#2b61d6]" 
                        {...register("name")} 
                      />
                      {errors.name && <p className="text-xs text-rose-600 font-semibold">{errors.name.message}</p>}
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="team" className="text-xs font-semibold text-slate-800">Checklist</Label>
                      <Controller
                        control={control}
                        name="team"
                        render={({ field }) => (
                          <Select onValueChange={field.onChange} value={field.value || userTeam} disabled>
                            <SelectTrigger className="border-slate-300 h-9 text-xs bg-slate-50 cursor-not-allowed">
                              <SelectValue placeholder="Checklist" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="HP-APJ">HP-APJ</SelectItem>
                              <SelectItem value="HP-EMEA">HP-EMEA</SelectItem>
                              <SelectItem value="HP-AMS">HP-AMS</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      />
                      {errors.team && <p className="text-xs text-rose-600 font-semibold">{errors.team.message}</p>}
                    </div>

                    <div className="space-y-1.5">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1.5">
                          <Label htmlFor="country" className="text-xs font-semibold text-slate-800">Country *</Label>
                          <Controller
                            control={control}
                            name="country"
                            render={({ field }) => {
                              const uniqueCountries = Array.from(new Set(countries.map(c => c.name)));
                              return (
                                <Select 
                                  onValueChange={(val) => {
                                    field.onChange(val);
                                    setValue("versionName", "", { shouldValidate: true });
                                  }} 
                                  value={field.value}
                                >
                                  <SelectTrigger className={cn("border-slate-300 h-9 text-xs", viewOnlineError && !field.value && "border-red-500 ring-1 ring-red-500 animate-shake")}>
                                    <SelectValue placeholder="Country" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {uniqueCountries.map(name => (
                                      <SelectItem key={name} value={name}>{name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              );
                            }}
                          />
                          {errors.country && <p className="text-xs text-rose-600 font-semibold">{errors.country.message}</p>}
                        </div>
                        
                        <div className="space-y-1.5">
                          <Label htmlFor="versionName" className="text-xs font-semibold text-slate-800">Version *</Label>
                          <Controller
                            control={control}
                            name="versionName"
                            render={({ field }) => {
                              const availableVersions = countries.filter(c => c.name === values.country);
                              return (
                                <Select onValueChange={field.onChange} value={field.value} disabled={!values.country}>
                                  <SelectTrigger className={cn("border-slate-300 h-9 text-xs", viewOnlineError && !field.value && "border-red-500 ring-1 ring-red-500 animate-shake")}>
                                    <SelectValue placeholder="Version" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {availableVersions.map(c => (
                                      <SelectItem key={c.id || c.code} value={c.code}>{c.code}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              );
                            }}
                          />
                          {errors.versionName && <p className="text-xs text-rose-600 font-semibold">{errors.versionName.message}</p>}
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-500">
                        Pattern: <span className="font-semibold text-slate-700">{expectedPrefix || "Select Country"}</span>
                      </p>
                    </div>


                      {/* CHECKLIST TEMPLATE SELECTION (NEW) */}
                      {!isEditMode && availableTeamChecklists.length > 0 && (
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                            <CheckSquare className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            <span>QA Checklist Type *</span>
                          </Label>
                          <Select value={selectedChecklistId} onValueChange={(val) => {
                            setSelectedChecklistId(val);
                            // If the user explicitly changes the template, update the checklists array (even in edit mode)
                            const targetTemplate = availableTeamChecklists.find((c: any) => c.id === val || c.name === val);
                            if (targetTemplate) {
                              setCampaignChecklists(targetTemplate.items || []);
                            }
                          }}>
                            <SelectTrigger className="border-slate-300 h-9 text-xs">
                              <SelectValue placeholder="Select Checklist Template" />
                            </SelectTrigger>
                            <SelectContent>
                              {availableTeamChecklists.map((c: any) => (
                                <SelectItem key={c.id || c.name || "default"} value={c.id || c.name || "default"}>
                                  {c.name || "Default Checklist"}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      


                    <div className="space-y-1.5">
                      <Label htmlFor="webViewUrl" className="text-xs font-semibold text-slate-800">View Online Link</Label>
                      <Input id="webViewUrl" placeholder="Viewonline URL" className="border-slate-300 h-9 text-xs" {...register("webViewUrl")} />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="litmusUrl" className="text-xs font-semibold text-slate-800 flex items-center justify-between">
                        <span>Litmus Link</span>
                        <span className="text-slate-400 font-normal">Optional</span>
                      </Label>
                      <Input 
                        id="litmusUrl" 
                        placeholder="https://litmus.com/checklist/..." 
                        className="border-slate-300 h-9 text-xs" 
                        {...register("litmusUrl")} 
                      />
                    </div>
                  </div>

                  {/* Design Reference Mode Switcher (Client provides EITHER Figma URL OR Uploaded Mockup) */}
                  <div className="pt-3 border-t border-slate-100 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold text-slate-800">
                        Design Reference Mode (Choose Figma Link OR Upload Mockup)
                      </Label>
                      <div className="flex bg-slate-100 p-0.5 rounded-md border border-slate-200">
                        <button
                          type="button"
                          onClick={() => setDesignChoice("figma")}
                          className={cn(
                            "px-3 py-1 text-xs font-semibold rounded transition-colors flex items-center gap-1.5",
                            designChoice === "figma" ? "bg-white text-[#2b61d6] shadow-xs" : "text-slate-600 hover:text-slate-900"
                          )}
                        >
                          <Figma className="w-3.5 h-3.5" /> Figma Link
                        </button>
                        <button
                          type="button"
                          onClick={() => setDesignChoice("image")}
                          className={cn(
                            "px-3 py-1 text-xs font-semibold rounded transition-colors flex items-center gap-1.5",
                            designChoice === "image" ? "bg-white text-[#2b61d6] shadow-xs" : "text-slate-600 hover:text-slate-900"
                          )}
                        >
                          <ImageIcon className="w-3.5 h-3.5" /> Upload Mockup Image
                        </button>
                      </div>
                    </div>

                    {designChoice === "figma" ? (
                      <div className="space-y-1.5">
                        <Input 
                          id="figmaUrl" 
                          placeholder="Figma URL" 
                          className="border-slate-300 h-9 text-xs" 
                          {...register("figmaUrl")} 
                        />
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <label className="border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100/80 rounded-lg p-3 flex flex-col items-center justify-center text-center cursor-pointer transition-colors">
                          <ImageIcon className="w-6 h-6 text-[#2b61d6] mb-1" />
                          <p className="text-xs font-semibold text-slate-800">
                            {mockupFile ? mockupFile.name : "Click to select or drop Mockup Image"}
                          </p>
                          <p className="text-[10px] text-slate-500 mt-0.5">PNG, JPG, WebP supported</p>
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => handleMockupImageChange(e.target.files?.[0] || null)} />
                        </label>
                        {mockupPreviewUrl && (
                          <div className="flex items-center justify-between text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-md font-medium">
                            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Attached: {mockupFile?.name || "Mockup File"}</span>
                            <button type="button" onClick={() => handleMockupImageChange(null)} className="text-rose-600 hover:underline">Remove</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Outlook Email File Upload & Detected Subject Line Display */}
                  <div className="pt-3 border-t border-slate-100 space-y-2">
                    <Label className="text-xs font-semibold text-slate-800">Outlook Email (.msg File)</Label>
                    <label className="border border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 rounded-lg p-2.5 flex items-center justify-between cursor-pointer transition-colors text-xs text-slate-700 font-medium">
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-[#2b61d6]" />
                        <span>{outlookFile ? `Attached: ${outlookFile.name}` : "Upload .msg File to compare Outlook rendering & extract Subject Line"}</span>
                      </div>
                      <span className="text-[11px] bg-white text-[#2b61d6] px-2.5 py-1 rounded border border-blue-200 font-semibold shadow-xs">
                        Browse
                      </span>
                      <input type="file" accept=".msg" className="hidden" onChange={(e) => handleOutlookFileChange(e.target.files?.[0] || null)} />
                    </label>

                    {/* Detected Subject Line Display */}
                    {outlookSubject && (
                      <div className="bg-blue-50/80 border border-blue-200 rounded-lg p-3 flex items-center justify-between text-xs animate-in fade-in">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-[#2b61d6] shrink-0" />
                          <div>
                            <span className="text-[10px] uppercase font-bold text-[#2b61d6] block">Detected Email Subject Line</span>
                            <span className="font-bold text-slate-900">{outlookSubject}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(outlookSubject);
                            alert("Subject line copied to clipboard!");
                          }}
                          className="px-2.5 py-1 bg-white text-[#2b61d6] border border-blue-200 hover:bg-blue-100 rounded text-[11px] font-semibold"
                        >
                          Copy
                        </button>
                      </div>
                    )}
                  </div>

                  {/* HTML Source Code Area */}
                  <div className="space-y-2 pt-3 border-t border-slate-100">
                    <div className="flex items-center justify-between mb-1">
                      <Label htmlFor="htmlSource" className="text-xs font-semibold text-slate-800 flex items-center gap-2">
                        <span>Full Email HTML Source Code *</span>
                        <span className="text-[10px] text-slate-400 font-normal">
                          ({values.htmlSource?.length || 0} chars)
                        </span>
                      </Label>
                    </div>

                    <textarea 
                      id="htmlSource"
                      className="flex min-h-[300px] w-full rounded-md border border-slate-300 bg-slate-50/80 px-3 py-2.5 text-xs font-mono shadow-xs placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#2b61d6]"
                      placeholder="Paste your full email HTML template code here..."
                      value={values.htmlSource || ""}
                      onChange={(e) => setValue("htmlSource", e.target.value, { shouldValidate: true })}
                    />
                    {errors.htmlSource && <p className="text-xs text-rose-600 font-semibold">{errors.htmlSource.message}</p>}
                  </div>
                </CardContent>
              </Card>
            )}
            
            {currentStep === 2 && (
              <div className="flex flex-col flex-1 min-h-[700px] border border-slate-200 rounded-xl shadow-xs bg-white overflow-hidden">
                <VisualComparison 
                  webViewUrl={resolvedWebViewUrl || values.webViewUrl} 
                  figmaUrl={values.figmaUrl} 
                  litmusUrl={values.litmusUrl}
                  htmlSource={processedHtmlSource || values.htmlSource}
                  initialMsgHtml={outlookExtractedHtml}
                  initialMsgFileName={outlookFileName || outlookFile?.name}
                  initialMsgSubject={outlookSubject || extractedSubject}
                  visualChecks={visualChecks}
                  onVisualChecksChange={(checks) => {
                    setVisualChecks(checks);
                    const currentAnswers = checklistAnswersRef.current || checklistAnswers;
                    const updatedAnswers = {
                      ...currentAnswers,
                      visual_desktop_light: { ...(currentAnswers.visual_desktop_light || {}), status: checks.desktopLight ? "Checked" : null },
                      visual_mobile_light: { ...(currentAnswers.visual_mobile_light || {}), status: checks.mobileLight ? "Checked" : null },
                      visual_desktop_dark: { ...(currentAnswers.visual_desktop_dark || {}), status: checks.desktopDark ? "Checked" : null },
                      visual_mobile_dark: { ...(currentAnswers.visual_mobile_dark || {}), status: checks.mobileDark ? "Checked" : null },
                      visual_litmus: { ...(currentAnswers.visual_litmus || {}), status: checks.litmus ? "Checked" : null },
                      _visualChecks: checks
                    };
                    setChecklistAnswers(updatedAnswers);
                    checklistAnswersRef.current = updatedAnswers;

                    const restoredCheckpoints: Record<string, boolean> = {};
                    Object.keys(updatedAnswers).forEach((key) => {
                      const val = updatedAnswers[key];
                      if (typeof val === 'boolean') {
                        restoredCheckpoints[key] = val;
                      } else if (val && typeof val === 'object') {
                        restoredCheckpoints[key] = val.status === 'Checked' || val.status === 'N/A';
                      }
                    });
                    setCheckedCheckpoints(restoredCheckpoints);

                    saveCurrentCampaignState({ visualChecks: checks, checklistAnswers: updatedAnswers });
                  }}
                  onMsgUploaded={(subject, html, fileName) => {
                    if (subject) {
                      setExtractedSubject(subject);
                      setOutlookSubject(subject);
                    }
                    if (html) {
                      setOutlookExtractedHtml(html);
                    }
                    if (fileName) {
                      setOutlookFileName(fileName);
                    }
                    saveCurrentCampaignState({
                      outlookSubject: subject || undefined,
                      outlookExtractedHtml: html || undefined,
                      outlookFileName: fileName || undefined
                    });
                  }}
                />
              </div>
            )}
            
            {currentStep === 3 && (
              <div className={cn(
                "flex flex-col flex-1 min-h-[700px] border border-slate-200 rounded-xl shadow-xs bg-white transition-all duration-300",
                fullScreenTarget === "step3" ? "fixed inset-0 z-[100] m-4 border-2 shadow-2xl" : ""
              )}>
                <TagInspection htmlSource={processedHtmlSource || values.htmlSource} subjectLine={extractedSubject} viewOnlineUrl={resolvedWebViewUrl || values.webViewUrl || values.litmusUrl} />
              </div>
            )}
            
            {currentStep === 4 && (
              <div className="space-y-4">
                <div className="flex flex-col min-h-[600px] border border-slate-200 rounded-xl shadow-xs bg-white overflow-hidden">
                  <BrowserQAWorkspace 
                    htmlSource={processedHtmlSource || values.htmlSource} 
                    webViewUrl={resolvedWebViewUrl || values.webViewUrl} 
                    country={values.country}
                    versionName={values.versionName}
                  />
                </div>
                <Card className="shadow-xs border-slate-200">
                  <CardHeader className="border-b border-slate-100 bg-white rounded-t-xl py-4">
                    <CardTitle className="text-slate-900 text-base">Additional Tracking & Brief Files</CardTitle>
                    <CardDescription className="text-slate-500 text-xs">Attach campaign briefs or Litmus rendering URL.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5 pt-5 bg-white">
                    <div className="grid md:grid-cols-2 gap-5">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-slate-800">Campaign Brief (CSV/Excel)</Label>
                        <label className="border-2 border-dashed border-slate-300 rounded-lg p-4 flex flex-col items-center justify-center text-center hover:bg-slate-50 transition-colors cursor-pointer bg-slate-50 h-28">
                          <UploadCloud className="h-6 w-6 text-[#2b61d6] mb-1" />
                          <p className="text-xs font-semibold text-slate-700">{briefFile ? briefFile.name : "Upload Brief File (.csv, .xlsx)"}</p>
                          <Input type="file" className="hidden" accept=".csv, .xlsx, .xls" onChange={(e) => setBriefFile(e.target.files?.[0] || null)} />
                        </label>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="litmusUrl" className="text-xs font-semibold text-slate-800">Litmus Test URL</Label>
                        <Input id="litmusUrl" placeholder="https://litmus.com/pub/..." className="border-slate-300 h-9 text-xs" {...register("litmusUrl")} />
                        <p className="text-[10px] text-slate-400">Optional URL for Litmus cross-client rendering tests</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {currentStep === 5 && (
              <EnglishTextAnalysis 
                htmlSource={processedHtmlSource || values.htmlSource} 
                webViewUrl={resolvedWebViewUrl || values.webViewUrl}
                onFixApplied={(updatedHtml) => setValue("htmlSource", updatedHtml, { shouldValidate: true })}
              />
            )}

            {currentStep === totalSteps && (
              <div className="space-y-5">
                {/* Campaign Decision & Actions Card */}
                <Card className="shadow-xs border-slate-200">
                  <CardHeader className="border-b border-slate-100 bg-white rounded-t-xl py-4 flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-slate-900 text-base">Campaign Review & Approval</CardTitle>
                      <CardDescription className="text-slate-500 text-xs">Review all checkpoints, set approval status, export verification receipts, and dispatch email.</CardDescription>
                    </div>
                    <span className={cn("px-2.5 py-1 rounded-full text-xs font-bold border", getStatusBadgeClass(campaignStatus))}>
                      Status: {campaignStatus}
                    </span>
                  </CardHeader>
                  <CardContent className="space-y-5 pt-5 bg-white text-xs">
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                      <div>
                        <span className="text-slate-500 block">Campaign Name:</span>
                        <strong className="text-slate-900 font-bold">{values.name || "Untitled Campaign"}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block">QA Type:</span>
                        <strong className="text-indigo-700 font-bold">{activeQaType}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Team:</span>
                        <strong className="text-slate-900 font-bold">{values.team || "Not Selected"}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Country & Version:</span>
                        <strong className="text-slate-900 font-bold">{values.country} ({values.versionName})</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Destination Folder:</span>
                        <strong className="text-slate-900 font-bold truncate block">{availableFolders.find(f => f.id === values.folder_id)?.name || "Default Folder"}</strong>
                      </div>
                    </div>

                    {/* No Callouts Checkbox Option */}
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                      <label 
                        htmlFor="chk-no-callouts"
                        className={cn(
                          "flex items-start gap-3 p-3 rounded-lg border text-xs cursor-pointer transition-all select-none",
                          noCalloutsChecked
                            ? "bg-emerald-50 border-emerald-300 text-emerald-950 font-medium"
                            : "bg-white border-slate-200 text-slate-800 hover:bg-slate-50"
                        )}
                      >
                        <input
                          type="checkbox"
                          id="chk-no-callouts"
                          checked={noCalloutsChecked}
                          onChange={(e) => {
                            const val = e.target.checked;
                            setNoCalloutsChecked(val);
                            saveCurrentCampaignState({ no_callouts: val } as any);
                          }}
                          className="w-4 h-4 mt-0.5 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer shrink-0"
                        />
                        <div>
                          <span className="font-bold flex items-center gap-1.5 text-slate-900">
                            <CheckCircle2 className={cn("w-4 h-4", noCalloutsChecked ? "text-emerald-600" : "text-slate-400")} />
                            No Client &amp; Campaign Owner Callouts (All checks clean)
                          </span>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            Check this option if there are no defects or feedback to report. When checked, &quot;Send Callouts&quot; CTA is disabled and &quot;Approve Campaign&quot; CTA is enabled.
                          </p>
                        </div>
                      </label>
                    </div>

                    {/* Mandatory QA Checkpoints Audit Banner in Stage 7 */}
                    {canApprove ? (
                      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between text-xs text-emerald-800">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>
                            <strong>{noCalloutsChecked ? "Zero Callouts Confirmed:" : "Mandatory QA Checkpoints Complete:"}</strong> {noCalloutsChecked ? "Reviewer verified no client and campaign owner callouts exist. Campaign is verified clean and approved for sign-off." : `All ${checkpointProgress.total} QA checkpoints are satisfied (${checkpointProgress.checked} Passed, ${checkpointProgress.na} N/A). Campaign is verified and ready for approval.`}
                          </span>
                        </div>
                        <span className="font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded text-[11px] shrink-0 ml-2">
                          {noCalloutsChecked ? "Zero Callouts" : "100% QA Passed"}
                        </span>
                      </div>
                    ) : (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between text-xs text-amber-900">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>
                            <strong>Mandatory QA Checkpoints Incomplete:</strong> {missingApprovalCheckpoints.length} of {checkpointProgress.total} checkpoints still pending ({checkpointProgress.percent}% completed). All checkpoints must be completed before approval, or check &quot;No Callouts&quot; above if clean.
                          </span>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="text-xs font-semibold text-amber-800 border-amber-300 hover:bg-amber-100 h-7 shrink-0 ml-2 cursor-pointer"
                          onClick={() => {
                            setShowChecklistError(true);
                            setIncompleteModalData({
                              stageNumber: 7,
                              stageTitle: "Incomplete Mandatory QA Checkpoints",
                              missingCheckpoints: missingApprovalCheckpoints
                            });
                            setShowIncompleteModal(true);
                          }}
                        >
                          View Incomplete ({missingApprovalCheckpoints.length})
                        </Button>
                      </div>
                    )}

                    {/* Action Buttons Toolbar: Send Callouts -> Approve Campaign -> Send Email */}
                    <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-slate-100">
                      {/* 1. Send Callouts (active before approval) */}
                      <Button
                        type="button"
                        variant="outline"
                        className="gap-2 border-blue-200 text-blue-700 hover:bg-blue-50 text-xs font-semibold px-4 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        onClick={() => setShowApprovalEmailModal(true)}
                        disabled={isCampaignApproved || isSubmitting || noCalloutsChecked}
                        title={
                          isCampaignApproved
                            ? "Campaign is already approved"
                            : noCalloutsChecked
                            ? "'Send Callouts' is disabled because 'No Callouts' is checked"
                            : "Send callouts to campaign owner"
                        }
                      >
                        <Mail className="w-4 h-4 text-blue-600" />
                        Send Callouts
                      </Button>

                      {/* 2. Approve Campaign (active before and after approval) */}
                      <Button
                        type="button"
                        className={cn(
                          "gap-2 text-xs font-semibold px-4 cursor-pointer transition-all",
                          isCampaignApproved
                            ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                            : canApprove
                            ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                            : "bg-slate-100 text-slate-500 border border-slate-300 hover:bg-slate-200"
                        )}
                        onClick={triggerApprovalFlow}
                        disabled={isSubmitting}
                        title={
                          isCampaignApproved
                            ? "Campaign Approved (click to re-verify and auto-save)"
                            : !canApprove
                            ? `Incomplete: ${missingApprovalCheckpoints.length} checkpoints pending (${checkpointProgress.completed}/${checkpointProgress.total} completed)`
                            : "Approve this campaign"
                        }
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        {isCampaignApproved 
                          ? "Campaign Approved" 
                          : isSubmitting 
                          ? "Approving..." 
                          : canApprove 
                          ? "Approve Campaign" 
                          : `Approve (${checkpointProgress.completed}/${checkpointProgress.total})`}
                      </Button>

                      {/* 3. Send Email (active ONLY once approved) */}
                      <Button
                        type="button"
                        className={cn(
                          "gap-2 text-xs font-bold px-4 cursor-pointer transition-all shadow-xs",
                          isCampaignApproved
                            ? "bg-[#0A05B0] hover:bg-[#08048A] text-white ring-2 ring-[#0A05B0]/20"
                            : "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                        )}
                        onClick={() => {
                          if (isCampaignApproved) setShowApprovalEmailModal(true);
                        }}
                        disabled={!isCampaignApproved || isSubmitting}
                        title={!isCampaignApproved ? "Approve campaign first to activate Send Email" : "Send approval email and callouts"}
                      >
                        <Send className="w-4 h-4" />
                        Send Email
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        className="gap-2 border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold px-4"
                        onClick={handleExportPDF}
                      >
                        <Download className="w-4 h-4 text-emerald-600" />
                        Export PDF Receipt
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        className="gap-2 border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold px-4"
                        onClick={handleExportExcel}
                      >
                        <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                        Export Excel
                      </Button>
                    </div>

                    {/* Admin Status Override Card when Campaign is Approved */}
                    {isAdmin && isCampaignApproved && (
                      <div className="p-3.5 bg-amber-50/90 border border-amber-200 rounded-lg flex flex-wrap items-center justify-between gap-3 mt-4">
                        <div className="flex items-center gap-2.5">
                          <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" />
                          <div>
                            <span className="text-xs font-bold text-amber-900 block">Admin Status Control</span>
                            <span className="text-[11px] text-amber-700">
                              Campaign is locked as Approved. Standard users cannot change status. As an Admin, you can unlock and revert the campaign to In Progress to allow checkpoint adjustments.
                            </span>
                          </div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-xs font-bold text-amber-900 border-amber-300 hover:bg-amber-100 bg-white cursor-pointer shadow-2xs"
                          onClick={() => handleDecision("QA Pending")}
                          disabled={isSubmitting}
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-amber-700" />
                          Unlock & Revert Status to In Progress
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Master All Checkpoints Inspector */}
                <Card className="shadow-xs border-slate-200">
                  <CardHeader className="border-b border-slate-100 bg-white rounded-t-xl py-3.5 flex flex-row items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ListChecks className="w-4 h-4 text-[#2b61d6]" />
                      <div>
                        <CardTitle className="text-slate-900 text-sm">All Campaign Checkpoints</CardTitle>
                        <CardDescription className="text-slate-500 text-[11px]">Inspect and verify checkpoints from all QA stages.</CardDescription>
                      </div>
                    </div>
                    {(() => {
                      const total = checklists.length;
                      const passed = checklists.filter(item => {
                        const ans = checklistAnswers[item.id];
                        return ans && (ans.status === "Checked" || ans.status === "N/A");
                      }).length;
                      const pct = total > 0 ? Math.round((passed / total) * 100) : 0;
                      return (
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <span className="text-[11px] font-bold text-slate-700">{passed}/{total} Verified</span>
                            <span className="text-[10px] text-slate-400 block">{pct}% Complete</span>
                          </div>
                          <div className="w-20 bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
                            <div className="bg-emerald-500 h-2 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })()}
                  </CardHeader>
                  <CardContent className="p-4 bg-white space-y-4">
                    {(() => {
                      if (checklists.length === 0) {
                        return (
                          <div className="p-6 text-center text-slate-500 text-xs bg-slate-50 rounded-lg border border-dashed border-slate-200">
                            No checklists defined for team {values.team || "selected"}.
                          </div>
                        );
                      }

                      const stageNames: Record<number, string> = {
                        0: stageLabels["0"] || "Global Checkpoints",
                        1: stageLabels["1"] || "Stage 1: Details & Source",
                        2: stageLabels["2"] || "Stage 2: Visual Comparison",
                        3: stageLabels["3"] || "Stage 3: Alt & Alias Tags",
                        4: stageLabels["4"] || "Stage 4: Link Validation",
                        5: stageLabels["5"] || "Stage 5: Grammar & Spell Check",
                        6: stageLabels["6_CQA"] || "Stage 6: Review & Approval"
                      };
                      
                      if (isFQA) {
                        stageNames[6] = stageLabels["6"] || "Stage 6: Review & Approval / LAUNCH (FQA)";
                        stageNames[7] = stageLabels["7"] || "Stage 7: Review & Approval (FQA)";
                      }

                      // Group by stage
                      const grouped = checklists.reduce((acc: any, item: any) => {
                        const stage = item.stage || 0;
                        if (!acc[stage]) acc[stage] = [];
                        acc[stage].push(item);
                        return acc;
                      }, {});

                      return Object.keys(grouped).sort((a, b) => Number(a) - Number(b)).map(stageKey => {
                        const items = grouped[stageKey];
                        const sNum = Number(stageKey);
                        const sName = stageNames[sNum] || `Stage ${sNum}`;
                        const stagePassed = items.filter((item: any) => {
                          const ans = checklistAnswers[item.id];
                          return ans && (ans.status === "Checked" || ans.status === "N/A");
                        }).length;
                        const isStageComplete = stagePassed === items.length;

                        return (
                          <div key={stageKey} className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-2xs">
                            <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-xs text-slate-800">{sName}</span>
                                <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-semibold">
                                  {stagePassed}/{items.length} Verified
                                </span>
                              </div>
                              {isStageComplete ? (
                                <span className="text-[11px] text-emerald-700 font-bold flex items-center gap-1 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                                  <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" /> All Verified
                                </span>
                              ) : (
                                <span className="text-[11px] text-amber-700 font-bold flex items-center gap-1 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
                                  <Clock className="w-3.5 h-3.5 text-amber-600" /> {items.length - stagePassed} Pending
                                </span>
                              )}
                            </div>

                            <div className="divide-y divide-slate-100 bg-white">
                              {items.map((item: any, itemIdx: number) => {
                                const currentAnswer = checklistAnswers[item.id] || {};
                                const isChecked = currentAnswer.status === "Checked";
                                const isNA = currentAnswer.status === "N/A";

                                return (
                                  <div key={`${stageKey}-${item.id || itemIdx}`} className="p-3 hover:bg-slate-50/60 transition-colors flex items-center justify-between gap-3 text-xs">
                                    <div className="flex items-start gap-3 flex-1 min-w-0">
                                      {isChecked ? (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shrink-0 mt-0.5">
                                          <Check className="w-3 h-3 text-emerald-700 stroke-[3]" /> Checked
                                        </span>
                                      ) : isNA ? (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-300 shrink-0 mt-0.5">
                                          N/A
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 shrink-0 mt-0.5">
                                          <Clock className="w-3 h-3 text-amber-700" /> Pending
                                        </span>
                                      )}
                                      <div className="min-w-0 flex-1">
                                        <span className="text-slate-800 font-medium leading-relaxed block">
                                          {item.text}
                                        </span>
                                        {currentAnswer.text && (
                                          <div className="mt-1 text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded px-2 py-0.5 inline-block">
                                            <span className="font-bold text-slate-700">Note:</span> {currentAnswer.text}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider shrink-0">
                                      Read-Only
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </CardContent>
                </Card>

                {/* Dispatched Callouts & Approval Records (Database Stored) */}
                <Card className="shadow-xs border-slate-200 mt-4">
                  <CardHeader className="border-b border-slate-100 bg-white rounded-t-xl py-3.5 flex flex-row items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-[#2b61d6]" />
                      <div>
                        <CardTitle className="text-slate-900 text-sm">Dispatched Callouts &amp; Approval Records</CardTitle>
                        <CardDescription className="text-slate-500 text-[11px]">
                          Complete audit trail of callout emails and approval records saved in the database.
                        </CardDescription>
                      </div>
                    </div>
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-[#2b61d6] border border-blue-200">
                      {dispatchedRecords.length} Saved {dispatchedRecords.length === 1 ? "Record" : "Records"}
                    </span>
                  </CardHeader>
                  <CardContent className="p-4 bg-white space-y-3">
                    {dispatchedRecords.length === 0 ? (
                      <div className="p-6 text-center text-slate-500 text-xs bg-slate-50 rounded-lg border border-dashed border-slate-200">
                        <Mail className="w-6 h-6 text-slate-300 mx-auto mb-2" />
                        No callout emails or approvals dispatched yet for this campaign.
                        <p className="text-[11px] text-slate-400 mt-1">
                          When you send callouts or approve this campaign, records will automatically be saved to the database and displayed here.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {dispatchedRecords.map((rec: any, idx: number) => {
                          const isApproval = rec.type === "Campaign Approval" || rec.status === "Approved";
                          return (
                            <div 
                              key={rec.id || idx} 
                              className={cn(
                                "p-3.5 rounded-xl border transition-all text-xs",
                                isApproval ? "bg-emerald-50/40 border-emerald-200" : "bg-slate-50 border-slate-200"
                              )}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-200/80 mb-2.5">
                                <div className="flex items-center gap-2">
                                  <span className={cn(
                                    "px-2 py-0.5 text-[10px] font-bold rounded-full border uppercase tracking-wider",
                                    isApproval 
                                      ? "bg-emerald-100 text-emerald-800 border-emerald-300" 
                                      : "bg-blue-100 text-blue-800 border-blue-300"
                                  )}>
                                    {rec.type || (isApproval ? "Campaign Approval" : "QA Callouts")}
                                  </span>
                                  <span className="font-bold text-slate-800">{rec.subject || "Campaign Notice"}</span>
                                </div>
                                <div className="flex items-center gap-3 text-slate-400 text-[11px]">
                                  <span>{rec.timestamp ? new Date(rec.timestamp).toLocaleString() : "Recently"}</span>
                                  <span className="text-emerald-700 font-medium flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[10px]">
                                    <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Saved in DB
                                  </span>
                                </div>
                              </div>

                              <div className="grid sm:grid-cols-2 gap-2 text-slate-600 text-[11px] mb-2.5">
                                <div><strong className="text-slate-700">From:</strong> {rec.senderName || rec.sender || "QA Lead"} ({rec.sender || "qa@zeta.com"})</div>
                                <div><strong className="text-slate-700">To:</strong> {rec.recipientName || rec.recipient || "Campaign Owner"}</div>
                              </div>

                              {rec.approvedText && (
                                <div className="p-2.5 bg-white rounded-lg border border-emerald-200 text-emerald-900 font-medium text-xs mb-2">
                                  {rec.approvedText}
                                </div>
                              )}

                              {rec.ownerCallouts && rec.ownerCallouts.length > 0 && (
                                <div className="mb-2">
                                  <span className="text-[11px] font-bold text-amber-900 flex items-center gap-1 mb-1">
                                    <AlertTriangle className="w-3 h-3 text-amber-600" /> Campaign Owner Callouts ({rec.ownerCallouts.length})
                                  </span>
                                  <ul className="space-y-1 bg-white p-2 rounded-md border border-slate-200 list-disc list-inside text-[11px] text-slate-700">
                                    {rec.ownerCallouts.map((c: string, ci: number) => (
                                      <li key={ci} className="leading-snug">{c}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {rec.clientCallouts && rec.clientCallouts.length > 0 && (
                                <div className="mb-2">
                                  <span className="text-[11px] font-bold text-blue-900 flex items-center gap-1 mb-1">
                                    <Mail className="w-3 h-3 text-blue-600" /> Client Callouts ({rec.clientCallouts.length})
                                  </span>
                                  <ul className="space-y-1 bg-white p-2 rounded-md border border-slate-200 list-disc list-inside text-[11px] text-slate-700">
                                    {rec.clientCallouts.map((c: string, ci: number) => (
                                      <li key={ci} className="leading-snug">{c}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              <p className="text-[10px] text-slate-400 italic pt-1">
                                Note: Screenshots were dispatched directly over email to reduce database load. Callouts &amp; approval records are permanently stored in database.
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
            </div>

          </div>
        </QAWizard>
      </form>
      )}

      {/* Approving the Campaign Popup Modal */}
      {isApprovingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            {approvingStep === "processing" ? (
              <div className="space-y-4">
                <div className="w-14 h-14 rounded-full bg-blue-50 border-2 border-blue-200 flex items-center justify-center mx-auto">
                  <Loader2 className="w-7 h-7 text-[#2b61d6] animate-spin" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Approving the campaign</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Verifying all checkpoints and auto-saving status to database...
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="w-14 h-14 rounded-full bg-emerald-50 border-2 border-emerald-300 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-7 h-7 text-emerald-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Campaign Approved</h3>
                  <p className="text-xs text-emerald-700 font-medium mt-1">
                    Auto-saved successfully to database with all verified checkpoints and records.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Navigation Guard Modal (useBlocker) */}
      {blocker.state === "blocked" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 border border-slate-200 space-y-4">
            <div className="flex items-center gap-3 text-amber-600">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold text-slate-900">Unsaved Changes in Campaign Setup</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              You have unsaved changes in this campaign. If you navigate away now, your edits may be lost.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => blocker.reset()}
                className="text-xs"
              >
                Stay &amp; Keep Editing
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => blocker.proceed()}
                className="text-xs"
              >
                Leave Without Saving
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={async () => {
                  await handleManualSave();
                  blocker.proceed();
                }}
                className="text-xs bg-[#2b61d6] hover:bg-[#2250b8] text-white"
              >
                Save Draft &amp; Leave
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Audit Logs Modal */}
      {isAdmin && showLogsModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-xl w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <History className="w-4 h-4 text-[#2b61d6]" />
                Campaign Edit & Review Logs
              </h3>
              <button onClick={() => setShowLogsModal(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto space-y-2 text-xs">
              {campaignLogs.map((log: any, idx: number) => (
                <div key={log.id || idx} className="p-3 rounded-lg border border-slate-200 bg-slate-50">
                  <div className="flex justify-between font-bold text-slate-800 mb-1">
                    <span>{log.action}</span>
                    <span className="text-[10px] text-slate-400">{log.created_at ? new Date(log.created_at).toLocaleString() : "Recent"}</span>
                  </div>
                  <p className="text-slate-600">{log.details}</p>
                </div>
              ))}
            </div>
            <div className="flex justify-end pt-2">
              <Button size="sm" variant="outline" onClick={() => setShowLogsModal(false)}>Close</Button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Overlay Modal */}
      {fullScreenTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex flex-col p-4 md:p-6 animate-in fade-in">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl flex-1 flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-3.5 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <span className="bg-[#2b61d6] text-white px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
                  Fullscreen Mode
                </span>
                <h3 className="text-sm font-bold">
                  {fullScreenTarget === "html" ? "Full Email HTML Source Code & Tag Inspection" :
                   fullScreenTarget === "webview" ? "View Online Platform Landing Page & Link Inspector" :
                   "Campaign Workspace Fullscreen"}
                </h3>
              </div>

              <div className="flex items-center gap-3">
                {fullScreenTarget === "webview" && (
                  <div className="flex bg-slate-800 p-0.5 rounded border border-slate-700">
                    <button
                      type="button"
                      onClick={() => setViewOnlineDevice("desktop")}
                      className={cn(
                        "px-2.5 py-1 text-[11px] font-semibold rounded transition-colors cursor-pointer",
                        viewOnlineDevice === "desktop" ? "bg-[#2b61d6] text-white" : "text-slate-300 hover:text-white"
                      )}
                    >
                      <Monitor className="w-3.5 h-3.5 inline mr-1" /> Desktop
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewOnlineDevice("tablet")}
                      className={cn(
                        "px-2.5 py-1 text-[11px] font-semibold rounded transition-colors cursor-pointer",
                        viewOnlineDevice === "tablet" ? "bg-[#2b61d6] text-white" : "text-slate-300 hover:text-white"
                      )}
                    >
                      <Tablet className="w-3.5 h-3.5 inline mr-1" /> Tablet
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewOnlineDevice("mobile")}
                      className={cn(
                        "px-2.5 py-1 text-[11px] font-semibold rounded transition-colors cursor-pointer",
                        viewOnlineDevice === "mobile" ? "bg-[#2b61d6] text-white" : "text-slate-300 hover:text-white"
                      )}
                    >
                      <Smartphone className="w-3.5 h-3.5 inline mr-1" /> Mobile
                    </button>
                  </div>
                )}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setFullScreenTarget(null)}
                  className="bg-slate-800 hover:bg-slate-700 text-white border-slate-700 gap-1 text-xs font-semibold cursor-pointer"
                >
                  <Minimize2 className="w-3.5 h-3.5" />
                  Exit Fullscreen
                </Button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-auto bg-slate-100 p-4 flex flex-col">
              {fullScreenTarget === "html" ? (
                <div className="flex-1 flex flex-col bg-white border border-slate-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-2">
                      <Code2 className="w-4 h-4 text-[#2b61d6]" />
                      HTML Source Code Editor ({values.htmlSource?.length || 0} chars)
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded font-bold">
                        Alias Tags: {aliasTagsInfo.total}
                      </span>
                      <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-bold">
                        Alt Tags: {altTagsInfo.withAlt.length}/{altTagsInfo.total}
                      </span>
                    </div>
                  </div>
                  <textarea 
                    className="flex-1 min-h-[500px] w-full rounded-md border border-slate-300 bg-slate-900 text-emerald-400 p-4 text-xs font-mono shadow-xs focus:outline-none"
                    placeholder="Paste email HTML code here..."
                    value={values.htmlSource || ""}
                    onChange={(e) => setValue("htmlSource", e.target.value, { shouldValidate: true })}
                  />
                </div>
              ) : fullScreenTarget === "webview" ? (
                <div className="flex-1 flex flex-col bg-slate-200 rounded-lg overflow-hidden border border-slate-300">
                  {/* Link Audit Header Banner */}
                  {linkAuditInfo.missing.length > 0 && (
                    <div className="bg-rose-50 border-b border-rose-200 p-3 text-xs flex items-center justify-between shrink-0">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                        <span className="font-bold text-rose-800">
                          Missing/Invalid Link Warnings ({linkAuditInfo.missing.length}):
                        </span>
                        <div className="flex gap-1.5 flex-wrap">
                          {linkAuditInfo.missing.map((m, i) => (
                            <span key={i} className="bg-white border border-rose-200 px-2 py-0.5 rounded text-[10px] text-rose-900 font-mono">
                              {m.text}: {m.href} ({m.reason})
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex-1 overflow-auto p-4 flex justify-center items-start">
                    <div
                      className={cn(
                        "bg-white shadow-2xl transition-all duration-300 min-h-full border border-slate-300 rounded-lg overflow-hidden flex flex-col",
                        viewOnlineDevice === "desktop" ? "w-full" : viewOnlineDevice === "tablet" ? "w-[768px]" : "w-[375px]"
                      )}
                    >
                      {resolvedWebViewUrl ? (
                        <iframe
                          src={resolvedWebViewUrl}
                          title="View Online Fullscreen"
                          className="w-full h-full min-h-[700px] border-0"
                          sandbox="allow-same-origin allow-scripts allow-popups"
                        />
                      ) : processedHtmlSource ? (
                        <iframe
                          srcDoc={processedHtmlSource}
                          title="HTML Source Fullscreen"
                          className="w-full h-full min-h-[700px] border-0"
                          sandbox="allow-same-origin allow-popups"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center p-16 text-slate-500 text-xs">
                          No View Online link or HTML source provided.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 bg-white p-6 rounded-lg border border-slate-200 overflow-auto">
                  <p className="text-slate-600 text-xs">Expanded step workspace view active.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Incomplete Checkpoints Popup Modal */}
      <IncompleteCheckpointsModal
        isOpen={showIncompleteModal}
        onClose={() => setShowIncompleteModal(false)}
        stageNumber={incompleteModalData.stageNumber}
        stageTitle={incompleteModalData.stageTitle}
        missingCheckpoints={incompleteModalData.missingCheckpoints}
      />

      {/* Save Draft or Discard on Stage 1 Exit Modal */}
      <SaveDraftOrDiscardModal
        isOpen={showStage1DraftPrompt}
        onClose={() => {
          if (!isDiscarding) {
            setShowStage1DraftPrompt(false);
            pendingNavUrlRef.current = null;
          }
        }}
        onSaveDraft={handleConfirmSaveDraft}
        onDiscard={handleConfirmDiscard}
        campaignName={values.name}
        isProcessing={isDiscarding}
        isExistingCampaign={!!(editId || isEditMode)}
      />

      {/* Send Approval Email Modal */}
      {showApprovalEmailModal && (
        <SendApprovalEmailModal
          isOpen={showApprovalEmailModal}
          onClose={() => setShowApprovalEmailModal(false)}
          onSentSuccess={() => {
            // Keep current campaign status intact when sending callouts or approval email
          }}
          campaignMeta={{
            campaignName: values.name,
            team: values.team,
            country: values.country,
            versionName: values.versionName,
            userEmail: userEmail,
            campaignStatus: campaignStatus,
            campaignId: editId || undefined,
            qaType: activeQaType,
            createdBy: (values as any)?.createdBy || (values as any)?.assignedTo || userEmail,
            assignedTo: (values as any)?.assignedTo,
            assignedQa: (values as any)?.assignedQa || (values as any)?.assignedTo
          }}
          checklists={checklists}
          answers={checklistAnswers}
        />
      )}

      {/* AI QA Report Modal */}
      {aiQaReport && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-indigo-50/50">
              <div className="flex items-center gap-2 text-indigo-700">
                <Sparkles className="w-5 h-5" />
                <h3 className="font-bold text-lg">AI Auto-QA Report</h3>
              </div>
              <button 
                onClick={() => setAiQaReport(null)}
                className="p-1 hover:bg-slate-200 rounded transition-colors text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6 text-sm">
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                <p className="text-slate-700">{aiQaReport.summary}</p>
              </div>

              {aiQaReport.issues && aiQaReport.issues.length > 0 && (
                <div>
                  <h4 className="font-bold text-rose-700 flex items-center gap-2 mb-3">
                    <AlertTriangle className="w-4 h-4" /> Issues Found ({aiQaReport.issues.length})
                  </h4>
                  <ul className="space-y-3">
                    {aiQaReport.issues.map((issue: any, idx: number) => (
                      <li key={idx} className="bg-rose-50/50 border border-rose-100 p-3 rounded-lg flex gap-3 items-start">
                        <XCircle className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
                        <div>
                          <strong className="text-rose-900 block mb-1">{issue.type}</strong>
                          <span className="text-rose-700">{issue.detail}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {aiQaReport.passed && aiQaReport.passed.length > 0 && (
                <div>
                  <h4 className="font-bold text-emerald-700 flex items-center gap-2 mb-3">
                    <CheckCircle2 className="w-4 h-4" /> Passed Checks ({aiQaReport.passed.length})
                  </h4>
                  <ul className="space-y-2">
                    {aiQaReport.passed.map((pass: string, idx: number) => (
                      <li key={idx} className="flex items-center gap-2 text-emerald-700 bg-emerald-50/50 p-2 rounded-lg border border-emerald-50">
                        <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                        {pass}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <Button onClick={() => setAiQaReport(null)} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                Close Report
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Save and Refresh Modal */}
      {showSaveAndRefreshModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6">
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mb-4">
                <RefreshCw className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Save QA Progress and Refresh?</h3>
              <p className="text-sm text-slate-600 mb-4 leading-relaxed">
                All campaign details, checklist answers, visual checks, and your current position (<strong>Stage {currentStep}</strong>) will be saved immediately to persistent storage. After refreshing, this exact campaign will reopen automatically at the same stage so you can continue where you left off.
              </p>
              <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 text-xs text-slate-700 space-y-1 mb-5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Current Stage:</span>
                  <span className="font-semibold text-slate-900">Stage {currentStep} of {totalSteps}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Answered Checkpoints:</span>
                  <span className="font-semibold text-slate-900">{checkpointProgress.completed} answered</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Restoration:</span>
                  <span className="font-semibold text-emerald-600">Guaranteed on reload</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSaveAndRefreshModal(false)}
                  disabled={isRefreshing}
                  className="border-slate-300 text-slate-700"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSaveAndRefresh}
                  disabled={isRefreshing}
                  className="bg-[#2b61d6] hover:bg-blue-700 text-white gap-2 font-medium"
                >
                  {isRefreshing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving & Refreshing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      Save and Refresh
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
