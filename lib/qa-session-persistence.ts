/**
 * QA Session Persistence Utility
 * Guarantees that active QA sessions, stage progress, checklist answers,
 * and form values are preserved across browser refreshes, reloads, or accidental navigation.
 */

export interface ActiveQASessionSnapshot {
  campaignId: string | null;
  currentStep: number;
  formValues: {
    name?: string;
    team?: string;
    country?: string;
    versionName?: string;
    folder_id?: string;
    webViewUrl?: string;
    htmlSource?: string;
    figmaUrl?: string;
    litmusUrl?: string;
  };
  checklistAnswers: Record<string, any>;
  visualChecks: {
    desktopLight: boolean;
    mobileLight: boolean;
    desktopDark: boolean;
    mobileDark: boolean;
  };
  status?: string;
  reviewNote?: string;
  designChoice?: "figma" | "image";
  outlookSubject?: string | null;
  outlookFileName?: string | null;
  outlookExtractedHtml?: string | null;
  mockupDataUrl?: string | null;
  timestamp: number;
}

const SESSION_STORAGE_KEY = "hp_qa_active_session";
const BACKUP_STORAGE_KEY = "hp_qa_active_session_backup";
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export function saveActiveQASnapshot(snapshot: Partial<ActiveQASessionSnapshot>): void {
  try {
    const existing: Partial<ActiveQASessionSnapshot> = getActiveQASnapshot() || {};
    const merged: ActiveQASessionSnapshot = {
      campaignId: snapshot.campaignId !== undefined ? snapshot.campaignId : (existing.campaignId || null),
      currentStep: snapshot.currentStep !== undefined ? snapshot.currentStep : (existing.currentStep || 1),
      formValues: {
        ...(existing.formValues || {}),
        ...(snapshot.formValues || {})
      },
      checklistAnswers: snapshot.checklistAnswers !== undefined ? snapshot.checklistAnswers : (existing.checklistAnswers || {}),
      visualChecks: snapshot.visualChecks !== undefined ? snapshot.visualChecks : (existing.visualChecks || {
        desktopLight: false,
        mobileLight: false,
        desktopDark: false,
        mobileDark: false
      }),
      status: snapshot.status || existing.status || "Draft",
      reviewNote: snapshot.reviewNote !== undefined ? snapshot.reviewNote : (existing.reviewNote || ""),
      designChoice: snapshot.designChoice || existing.designChoice || "figma",
      outlookSubject: snapshot.outlookSubject !== undefined ? snapshot.outlookSubject : (existing.outlookSubject || null),
      outlookFileName: snapshot.outlookFileName !== undefined ? snapshot.outlookFileName : (existing.outlookFileName || null),
      outlookExtractedHtml: snapshot.outlookExtractedHtml !== undefined ? snapshot.outlookExtractedHtml : (existing.outlookExtractedHtml || null),
      mockupDataUrl: snapshot.mockupDataUrl !== undefined ? snapshot.mockupDataUrl : (existing.mockupDataUrl || null),
      timestamp: Date.now()
    };

    const serialized = JSON.stringify(merged);
    sessionStorage.setItem(SESSION_STORAGE_KEY, serialized);
    localStorage.setItem(BACKUP_STORAGE_KEY, serialized);

    if (merged.campaignId) {
      localStorage.setItem(`hp_qa_campaign_stage_${merged.campaignId}`, String(merged.currentStep));
    }
  } catch (err) {
    console.warn("[QASessionPersistence] Failed to save active QA snapshot:", err);
  }
}

export function getActiveQASnapshot(targetCampaignId?: string | null): ActiveQASessionSnapshot | null {
  try {
    let raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      raw = localStorage.getItem(BACKUP_STORAGE_KEY);
    }
    if (!raw) return null;

    const parsed: ActiveQASessionSnapshot = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    // Check age
    if (parsed.timestamp && Date.now() - parsed.timestamp > MAX_AGE_MS) {
      clearActiveQASnapshot();
      return null;
    }

    if (targetCampaignId) {
      if (parsed.campaignId && String(parsed.campaignId) === String(targetCampaignId)) {
        return parsed;
      }
      return null;
    }

    return parsed;
  } catch (err) {
    console.warn("[QASessionPersistence] Failed to read active QA snapshot:", err);
    return null;
  }
}

export function getStoredStageForCampaign(campaignId: string): number | null {
  try {
    const raw = localStorage.getItem(`hp_qa_campaign_stage_${campaignId}`);
    if (raw) {
      const step = parseInt(raw, 10);
      if (!isNaN(step) && step >= 1 && step <= 7) {
        return step;
      }
    }
  } catch {}
  return null;
}

export function clearActiveQASnapshot(): void {
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.removeItem(BACKUP_STORAGE_KEY);
  } catch (err) {
    console.warn("[QASessionPersistence] Failed to clear active QA snapshot:", err);
  }
}
