import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Mail, 
  Send, 
  Search, 
  Users, 
  Check, 
  Copy, 
  X, 
  CheckCircle2, 
  Loader2, 
  FileSpreadsheet, 
  Download, 
  AlertTriangle, 
  Image as ImageIcon, 
  Trash2, 
  ListPlus, 
  Paperclip,
  CheckSquare,
  Square
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { logAction } from "@/lib/logger";
import { generateQAChecklistExcelBase64, exportQAChecklistToExcel } from "@/lib/export-qa-excel";
import { getActiveSession } from "@/lib/session";
import { resolveUserFullName, resolveUserFirstName, loadAppUsersMetadata } from "@/lib/userNames";
import { getCampaignById, saveCampaignRecord } from "@/lib/campaign-storage";

/**
 * Formats a clean, humanized name from a raw name or email address,
 * explicitly avoiding generic placeholders like "QA User" or raw emails.
 */
export function formatFriendlyName(rawName?: string, email?: string): string {
  return resolveUserFullName(rawName || email, "");
}

export interface TeamUser {
  id: string;
  name: string;
  email: string;
  role?: string;
  team?: string;
  status?: string;
}

export interface BulletScreenshot {
  id: string;
  name: string;
  dataUrl: string;
  caption?: string;
  sizeKb?: number;
}

export interface CalloutBullet {
  id: string;
  text: string;
  screenshot?: BulletScreenshot;
}

interface SendApprovalEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaignMeta: {
    campaignName?: string;
    team?: string;
    country?: string;
    versionName?: string;
    userEmail?: string;
    createdBy?: string;
    assignedTo?: string;
    assignedQa?: string;
    assignedUser?: string;
    campaignStatus?: string;
    campaignId?: string;
    qaType?: string;
  };
  checklists?: Array<{
    id: string;
    stage: number;
    text: string;
    requiresInput?: boolean;
  }>;
  answers?: Record<string, { status?: string | null; text?: string }>;
  onSentSuccess?: (record?: any) => void;
}

export function SendApprovalEmailModal({
  isOpen,
  onClose,
  campaignMeta,
  checklists = [],
  answers = {},
  onSentSuccess
}: SendApprovalEmailModalProps) {
  // Determine normalized QA Type (CQA, FQA, CQA_OFT) based on campaign setup
  const normalizedQaType = useMemo(() => {
    const raw = (campaignMeta?.qaType || "").toUpperCase().trim();
    if (raw.includes("OFT")) return "CQA_OFT";
    if (raw.includes("FQA")) return "FQA";
    if (raw.includes("CQA")) return "CQA";
    if (checklists && checklists.length > 0) {
      if (checklists.some(c => c.id?.startsWith("apj-oft"))) return "CQA_OFT";
      if (checklists.some(c => c.stage === 7 || c.id?.startsWith("apj-content"))) return "FQA";
    }
    return "CQA";
  }, [campaignMeta?.qaType, checklists]);

  const effectiveQaType = normalizedQaType;

  // Determine whether campaign is approved
  const isApproved = useMemo(() => {
    const status = (campaignMeta?.campaignStatus || "").toLowerCase();
    return status.includes("approved");
  }, [campaignMeta?.campaignStatus]);

  // Dynamically determine assigned QA user and active logged-in user
  const activeSession = getActiveSession();

  const assignedQaName = useMemo(() => {
    const meta = campaignMeta as any;
    const candidate = meta?.assignedQa || meta?.assignedTo || meta?.assignedUser || meta?.createdBy;
    return resolveUserFullName(candidate, "");
  }, [campaignMeta]);

  const loggedInUserName = useMemo(() => {
    if (activeSession?.name && !/^qa\s*user$/i.test(activeSession.name.trim()) && !activeSession.name.includes('@')) {
      return activeSession.name.trim();
    }
    return resolveUserFullName(activeSession?.email || campaignMeta?.userEmail, "Chaithanya");
  }, [activeSession, campaignMeta?.userEmail]);

  // Users state (showing all users across the team)
  const [allUsers, setAllUsers] = useState<TeamUser[]>([]);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<TeamUser | null>(null);

  // Dynamic Recipient Name & Email state
  const [recipientName, setRecipientName] = useState<string>(() => {
    const meta = campaignMeta as any;
    const candidate = meta?.assignedQa || meta?.assignedTo || meta?.assignedUser || meta?.createdBy;
    const candidateResolved = resolveUserFullName(candidate, "");
    if (candidateResolved) return candidateResolved;
    const session = getActiveSession();
    return resolveUserFullName(session?.name || session?.email || campaignMeta?.userEmail, "Campaign Reviewer");
  });
  const [recipientEmail, setRecipientEmail] = useState<string>("");

  // Campaign Owner Callouts State (Required unless noOwnerCallouts checked)
  const [ownerCalloutBullets, setOwnerCalloutBullets] = useState<CalloutBullet[]>([]);
  const [newOwnerCalloutInput, setNewOwnerCalloutInput] = useState<string>("");
  const [noOwnerCallouts, setNoOwnerCallouts] = useState<boolean>(false);
  const [showBulkOwnerCallouts, setShowBulkOwnerCallouts] = useState<boolean>(false);
  const [bulkOwnerCalloutsText, setBulkOwnerCalloutsText] = useState<string>("");

  // Client Callouts State (Required unless noClientCallouts checked)
  const [clientCalloutBullets, setClientCalloutBullets] = useState<CalloutBullet[]>([]);
  const [newClientCalloutInput, setNewClientCalloutInput] = useState<string>("");
  const [noClientCallouts, setNoClientCallouts] = useState<boolean>(false);
  const [showBulkClientCallouts, setShowBulkClientCallouts] = useState<boolean>(false);
  const [bulkClientCalloutsText, setBulkClientCalloutsText] = useState<string>("");

  // Hidden file inputs for image attachment per bullet
  const ownerBulletFileInputRef = useRef<HTMLInputElement | null>(null);
  const clientBulletFileInputRef = useRef<HTMLInputElement | null>(null);
  const activeBulletTargetRef = useRef<{ section: 'owner' | 'client'; bulletId: string } | null>(null);

  // Email Fields
  const campaignName = campaignMeta?.campaignName || "Campaign Verification";
  const [subject, setSubject] = useState(`${normalizedQaType} | ${campaignName}`);
  const [ccEmails, setCcEmails] = useState<string[]>([]);
  const [customCcInput, setCustomCcInput] = useState("");
  const [isCopied, setIsCopied] = useState(false);
  const [isSubjectCopied, setIsSubjectCopied] = useState(false);
  const [dispatchStatus, setDispatchStatus] = useState<{
    type: "success" | "info" | "error";
    text: string;
  } | null>(null);
  const [isSending, setIsSending] = useState(false);

  // Determine Login User First Name (e.g., "Chaithanya", "Malik", strictly a human first name, never an email address)
  const loginUserFirstName = useMemo(() => {
    const session = getActiveSession();
    return resolveUserFirstName(
      session?.name || session?.email || campaignMeta?.createdBy || campaignMeta?.userEmail,
      "Chaithanya"
    );
  }, [campaignMeta?.userEmail, campaignMeta?.createdBy, allUsers]);

  const [senderFirstName, setSenderFirstName] = useState(loginUserFirstName);

  useEffect(() => {
    setSenderFirstName(loginUserFirstName);
  }, [loginUserFirstName]);

  // Keep subject updated with exact pattern: `${normalizedQaType} | ${campaignName}`
  useEffect(() => {
    setSubject(`${normalizedQaType} | ${campaignName}`);
  }, [campaignName, normalizedQaType]);

  // Fetch all users in the team
  useEffect(() => {
    let isMounted = true;
    const fetchUsers = async () => {
      loadAppUsersMetadata();
      let usersList: TeamUser[] = [];
      try {
        const { data, error } = await supabase.from('app_users').select('*').neq('status', 'banned');
        if (!error && data && data.length > 0) {
          usersList = data;
        }
      } catch {}

      if (usersList.length === 0) {
        try {
          const apiRes = await fetch('/api/app-users');
          if (apiRes.ok) {
            const json = await apiRes.json();
            if (json.users && Array.isArray(json.users) && json.users.length > 0) {
              usersList = json.users;
            }
          }
        } catch {}
      }

      if (usersList.length === 0) {
        const session = getActiveSession();
        if (session?.email) {
          usersList = [
            { id: session.email, name: session.name || "Active QA Member", email: session.email, team: session.team || "HP-APJ", role: session.role || "admin" }
          ];
        }
      }

      if (isMounted) {
        setAllUsers(usersList);
        
        // Auto-select initial recipient from team
        if (usersList.length > 0) {
          const matched = usersList.find(u => 
            (assignedQaName && u.name.toLowerCase().includes(assignedQaName.toLowerCase())) ||
            (campaignMeta?.createdBy && u.name.toLowerCase().includes(campaignMeta.createdBy.toLowerCase())) ||
            (campaignMeta?.userEmail && u.email.toLowerCase() === campaignMeta.userEmail.toLowerCase()) ||
            (activeSession?.email && u.email.toLowerCase() === activeSession.email.toLowerCase())
          ) || usersList[0];

          setSelectedUser(matched);
          const initialGreeting = assignedQaName || resolveUserFullName(matched.name || matched.email, loggedInUserName);
          if (!recipientName || /^qa\s*user$/i.test(recipientName.trim()) || recipientName.includes("@")) {
            setRecipientName(initialGreeting);
          }
          setRecipientEmail(matched.email);
        }
      }
    };

    fetchUsers();
    return () => { isMounted = false; };
  }, [campaignMeta?.userEmail, campaignMeta?.createdBy, assignedQaName, loggedInUserName]);

  const handleSelectUser = (user: TeamUser) => {
    setSelectedUser(user);
    const friendly = resolveUserFullName(user.name || user.email, "Campaign Reviewer");
    setRecipientName(friendly);
    setRecipientEmail(user.email || "");
  };

  const handleToggleCc = (userEmail: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!userEmail) return;
    const clean = userEmail.trim().toLowerCase();
    if (ccEmails.some(c => c.toLowerCase() === clean)) {
      setCcEmails(ccEmails.filter(c => c.toLowerCase() !== clean));
    } else {
      setCcEmails([...ccEmails, userEmail]);
    }
  };

  // All team users matching search query
  const filteredUsers = useMemo(() => {
    const q = userSearchQuery.toLowerCase().trim();
    if (!q) return allUsers;
    return allUsers.filter(u => {
      const matchName = (u.name || "").toLowerCase().includes(q);
      const matchEmail = (u.email || "").toLowerCase().includes(q);
      const matchTeam = (u.team || "").toLowerCase().includes(q);
      const matchRole = (u.role || "").toLowerCase().includes(q);
      return matchName || matchEmail || matchTeam || matchRole;
    });
  }, [allUsers, userSearchQuery]);

  const effectiveRecipientName = useMemo(() => {
    if (recipientName && recipientName.trim() && !/^qa\s*user$/i.test(recipientName.trim()) && !recipientName.includes("@")) {
      return recipientName.trim();
    }
    if (assignedQaName && !/^qa\s*user$/i.test(assignedQaName.trim()) && !assignedQaName.includes("@")) {
      return assignedQaName.trim();
    }
    if (loggedInUserName && !/^qa\s*user$/i.test(loggedInUserName.trim()) && !loggedInUserName.includes("@")) {
      return loggedInUserName.trim();
    }
    if (selectedUser?.name && !/^qa\s*user$/i.test(selectedUser.name.trim()) && !selectedUser.name.includes("@")) {
      return selectedUser.name.trim();
    }
    if (recipientEmail && recipientEmail.trim()) {
      const derived = resolveUserFullName(recipientEmail.trim(), "");
      if (derived) return derived;
    }
    if (selectedUser?.email) {
      const derived = resolveUserFullName(selectedUser.email, "");
      if (derived) return derived;
    }
    return "Campaign Reviewer";
  }, [recipientName, assignedQaName, loggedInUserName, selectedUser, recipientEmail]);

  const effectiveTargetEmail = recipientEmail.trim() || selectedUser?.email || "";

  // Helper to handle image paste for a bullet in either section
  const attachImageToBullet = (section: 'owner' | 'client', bulletId: string, file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        const screenshot: BulletScreenshot = {
          id: `shot_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          name: file.name || "Pasted_Screenshot.png",
          dataUrl,
          caption: "",
          sizeKb: Math.round(file.size / 1024)
        };
        if (section === 'owner') {
          setOwnerCalloutBullets(prev => prev.map(b => b.id === bulletId ? { ...b, screenshot } : b));
        } else {
          setClientCalloutBullets(prev => prev.map(b => b.id === bulletId ? { ...b, screenshot } : b));
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const handleBulletPaste = (section: 'owner' | 'client', bulletId: string, e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf("image") !== -1) {
        e.preventDefault();
        e.stopPropagation();
        const file = item.getAsFile();
        if (file) {
          attachImageToBullet(section, bulletId, file);
        }
        break;
      }
    }
  };

  const openBulletImagePicker = (section: 'owner' | 'client', bulletId: string) => {
    activeBulletTargetRef.current = { section, bulletId };
    if (section === 'owner') {
      ownerBulletFileInputRef.current?.click();
    } else {
      clientBulletFileInputRef.current?.click();
    }
  };

  const handleBulletFileInputChange = (section: 'owner' | 'client', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const target = activeBulletTargetRef.current;
    if (!file || !target || target.section !== section) return;
    attachImageToBullet(section, target.bulletId, file);
    e.target.value = "";
    activeBulletTargetRef.current = null;
  };

  // Campaign Owner Callouts Handlers
  const handleAddOwnerCallout = () => {
    const trimmed = newOwnerCalloutInput.trim();
    if (!trimmed) return;
    setOwnerCalloutBullets(prev => [...prev, {
      id: `owner_b_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      text: trimmed
    }]);
    setNewOwnerCalloutInput("");
  };

  const handleImportBulkOwnerCallouts = () => {
    if (!bulkOwnerCalloutsText.trim()) return;
    const lines = bulkOwnerCalloutsText
      .split('\n')
      .map(l => l.replace(/^[•\-\*\d\.\)\s]+/, '').trim())
      .filter(Boolean);
    if (lines.length > 0) {
      const newItems: CalloutBullet[] = lines.map(line => ({
        id: `owner_b_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        text: line
      }));
      setOwnerCalloutBullets(prev => [...prev, ...newItems]);
      setBulkOwnerCalloutsText("");
      setShowBulkOwnerCallouts(false);
    }
  };

  // Client Callouts Handlers
  const handleAddClientCallout = () => {
    const trimmed = newClientCalloutInput.trim();
    if (!trimmed) return;
    setClientCalloutBullets(prev => [...prev, {
      id: `client_b_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      text: trimmed
    }]);
    setNewClientCalloutInput("");
  };

  const handleImportBulkClientCallouts = () => {
    if (!bulkClientCalloutsText.trim()) return;
    const lines = bulkClientCalloutsText
      .split('\n')
      .map(l => l.replace(/^[•\-\*\d\.\)\s]+/, '').trim())
      .filter(Boolean);
    if (lines.length > 0) {
      const newItems: CalloutBullet[] = lines.map(line => ({
        id: `client_b_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        text: line
      }));
      setClientCalloutBullets(prev => [...prev, ...newItems]);
      setBulkClientCalloutsText("");
      setShowBulkClientCallouts(false);
    }
  };

  // Plain Text Email Body
  const emailBodyText = useMemo(() => {
    const recName = effectiveRecipientName;

    const approvalBlock = isApproved
      ? `\n\n${effectiveQaType} Approved!\nCheck list uploaded to OneDrive`
      : "";

    const activeOwnerBullets = !noOwnerCallouts ? ownerCalloutBullets.filter(b => b.text.trim()) : [];
    const ownerBlock = activeOwnerBullets.length > 0
      ? `\n\nCallouts for Campaign Owner:\n` + activeOwnerBullets.map(b => {
          let line = `• ${b.text.trim()}`;
          if (b.screenshot) {
            line += `\n  [Screenshot: ${b.screenshot.caption || b.screenshot.name || 'Image attached'}]`;
          }
          return line;
        }).join('\n')
      : "";

    const activeClientBullets = !noClientCallouts ? clientCalloutBullets.filter(b => b.text.trim()) : [];
    const clientBlock = activeClientBullets.length > 0
      ? `\n\nClient Callouts:\n` + activeClientBullets.map(b => {
          let line = `• ${b.text.trim()}`;
          if (b.screenshot) {
            line += `\n  [Screenshot: ${b.screenshot.caption || b.screenshot.name || 'Image attached'}]`;
          }
          return line;
        }).join('\n')
      : "";

    return `Hi ${recName} ,${approvalBlock}${ownerBlock}${clientBlock}

Thanks!
${senderFirstName || "Chaithanya"}`;
  }, [
    effectiveRecipientName, 
    isApproved, 
    effectiveQaType, 
    noOwnerCallouts, 
    ownerCalloutBullets, 
    noClientCallouts, 
    clientCalloutBullets, 
    senderFirstName
  ]);

  const handleCopyBody = () => {
    navigator.clipboard.writeText(emailBodyText);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleCopySubject = () => {
    navigator.clipboard.writeText(subject);
    setIsSubjectCopied(true);
    setTimeout(() => setIsSubjectCopied(false), 2000);
  };

  const handleAddCustomCc = (e: React.KeyboardEvent | React.MouseEvent) => {
    if ('key' in e && e.key !== 'Enter' && e.key !== ',') return;
    e.preventDefault();
    const clean = customCcInput.trim().replace(/,/g, '');
    if (clean && clean.includes('@') && !ccEmails.includes(clean)) {
      setCcEmails([...ccEmails, clean]);
      setCustomCcInput("");
    }
  };

  const removeCc = (email: string) => {
    setCcEmails(ccEmails.filter(e => e !== email));
  };

  const handleDownloadExcel = () => {
    try {
      exportQAChecklistToExcel({
        campaignName: campaignName,
        team: campaignMeta?.team || "Zeta QA",
        country: campaignMeta?.country || "Global",
        versionName: campaignMeta?.versionName || "v1",
        userEmail: campaignMeta?.userEmail || activeSession?.email || "",
        campaignStatus: campaignMeta?.campaignStatus || (isApproved ? "Approved" : "In Progress"),
        qaType: effectiveQaType,
        checklists: checklists || [],
        answers: answers || {}
      });
    } catch (err) {
      console.error("Error exporting Excel checklist:", err);
    }
  };

  const handleLogAndSend = async () => {
    if (!effectiveTargetEmail) {
      setDispatchStatus({
        type: "error",
        text: "Please select a user or enter a recipient email address."
      });
      return;
    }

    // Validation: Campaign Owner Callouts is required unless noOwnerCallouts is checked
    const activeOwnerBullets = ownerCalloutBullets.filter(b => b.text.trim());
    if (!noOwnerCallouts && activeOwnerBullets.length === 0) {
      setDispatchStatus({
        type: "error",
        text: "Callouts for Campaign Owner are required. Please add at least one bullet point or check 'No campaign owner callouts'."
      });
      return;
    }

    // Validation: Client Callouts is required unless noClientCallouts is checked
    const activeClientBullets = clientCalloutBullets.filter(b => b.text.trim());
    if (!noClientCallouts && activeClientBullets.length === 0) {
      setDispatchStatus({
        type: "error",
        text: "Client Callouts are required. Please add at least one bullet point or check 'No client callouts'."
      });
      return;
    }

    setIsSending(true);
    setDispatchStatus(null);
    try {
      // Generate official Excel checklist attachment
      const attachments: any[] = [];
      try {
        const excelData = generateQAChecklistExcelBase64({
          campaignName: campaignName,
          team: campaignMeta?.team || "Zeta QA",
          country: campaignMeta?.country || "Global",
          versionName: campaignMeta?.versionName || "v1",
          userEmail: campaignMeta?.userEmail || activeSession?.email || "",
          campaignStatus: campaignMeta?.campaignStatus || (isApproved ? "Approved" : "In Progress"),
          qaType: effectiveQaType,
          checklists: checklists || [],
          answers: answers || {}
        });
        if (excelData && excelData.base64) {
          attachments.push({
            filename: excelData.filename,
            content: excelData.base64,
            contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          });
        }
      } catch (err) {
        console.warn("Could not generate QA Excel checklist attachment:", err);
      }

      const totalCheckpointsCount = checklists?.length || 22;
      const passedCheckpointsCount = checklists?.filter((c: any) => answers?.[c.id]?.status === 'Checked' || answers?.[c.id]?.status === 'N/A')?.length || totalCheckpointsCount;
      const computedScore = totalCheckpointsCount > 0 ? `${Math.round((passedCheckpointsCount / totalCheckpointsCount) * 100)}%` : "100%";

      const cleanOwnerCallouts = noOwnerCallouts ? [] : activeOwnerBullets.map(b => ({
        text: b.text.trim(),
        screenshot: b.screenshot ? {
          name: b.screenshot.name,
          dataUrl: b.screenshot.dataUrl,
          caption: b.screenshot.caption || undefined
        } : undefined
      }));

      const cleanClientCallouts = noClientCallouts ? [] : activeClientBullets.map(b => ({
        text: b.text.trim(),
        screenshot: b.screenshot ? {
          name: b.screenshot.name,
          dataUrl: b.screenshot.dataUrl,
          caption: b.screenshot.caption || undefined
        } : undefined
      }));

      const response = await fetch('/api/send-approval-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: effectiveTargetEmail,
          cc: ccEmails.join(","),
          subject: subject,
          body: emailBodyText,
          senderEmail: campaignMeta?.userEmail,
          senderName: senderFirstName || "Chaithanya",
          recipientName: effectiveRecipientName,
          assignedQaName: assignedQaName || undefined,
          loggedInUserName: loggedInUserName || undefined,
          campaignName: campaignName,
          team: campaignMeta?.team || "Zeta QA",
          country: campaignMeta?.country || "Global",
          versionName: campaignMeta?.versionName || "v1",
          qaType: effectiveQaType,
          isApproved: isApproved,
          callouts: cleanOwnerCallouts,
          ownerCallouts: cleanOwnerCallouts,
          clientCallouts: cleanClientCallouts,
          screenshots: [],
          complianceScore: computedScore,
          totalCheckpoints: totalCheckpointsCount,
          passedCheckpoints: passedCheckpointsCount,
          attachments: attachments,
          checklists: checklists || [],
          answers: answers || {}
        })
      });

      let result: any = null;
      try {
        result = await response.json();
      } catch (_) {
        result = { success: response.ok, error: "Unexpected response from email server" };
      }

      if (response.ok && result?.success) {
        // Prepare database persistence record: ONLY text, NO SCREENSHOTS in database!
        const cleanRecordBullets = (bullets: CalloutBullet[]) => 
          bullets.map(b => ({ id: b.id, text: (b.text || "").trim() })).filter(b => b.text.length > 0);

        const dispatchRecord = {
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          type: isApproved ? "Approval Email" : "Callouts Email",
          qaType: effectiveQaType,
          recipient: effectiveTargetEmail,
          recipientName: effectiveRecipientName,
          sender: campaignMeta?.userEmail || activeSession?.email || "QA Lead",
          senderName: senderFirstName || "Chaithanya",
          subject: subject,
          ownerCallouts: noOwnerCallouts ? [] : cleanRecordBullets(activeOwnerBullets),
          clientCallouts: noClientCallouts ? [] : cleanRecordBullets(activeClientBullets),
          noOwnerCallouts,
          noClientCallouts,
          status: isApproved ? "Approved" : "Callouts Sent"
        };

        if (campaignMeta?.campaignId) {
          try {
            const existingRec = await getCampaignById(campaignMeta.campaignId);
            if (existingRec) {
              const prev = existingRec.dispatchedRecords || existingRec.dispatched_records || [];
              const updatedList = [...prev, dispatchRecord];
              await saveCampaignRecord({
                ...existingRec,
                dispatchedRecords: updatedList,
                dispatched_records: updatedList
              });
            }
          } catch (storageErr) {
            console.warn("Notice saving dispatch record to campaign database:", storageErr);
          }
        }

        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("campaign_dispatched_saved", { detail: dispatchRecord }));
        }

        logAction(
          campaignMeta?.userEmail || activeSession?.email || "QA Lead",
          isApproved ? "Approval Email Dispatched" : "Callouts Email Dispatched",
          `Sent ${effectiveQaType} email for "${campaignName}" to ${effectiveRecipientName} <${effectiveTargetEmail}>${ccEmails.length > 0 ? ` (CC: ${ccEmails.join(", ")})` : ""}${cleanOwnerCallouts.length > 0 ? ` [${cleanOwnerCallouts.length} owner callouts]` : ""}${cleanClientCallouts.length > 0 ? ` [${cleanClientCallouts.length} client callouts]` : ""}`,
          campaignMeta?.campaignId
        ).catch(() => {});

        if (onSentSuccess) onSentSuccess(dispatchRecord);
        
        // Exact user requirement: after sending email msg should be like "CQA email sent" / "FQA email sent" / "CQA_OFT email sent"
        setDispatchStatus({
          type: "success",
          text: `${effectiveQaType} email sent`
        });
        
        setTimeout(() => {
          onClose();
        }, 2000);
      } else {
        const errorMsg = result?.error || result?.message || "Failed to dispatch email.";
        setDispatchStatus({
          type: "error",
          text: errorMsg
        });
      }
    } catch (e: any) {
      setDispatchStatus({
        type: "error",
        text: `Network error: ${e.message || "Could not reach server to dispatch email."}`
      });
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-6xl xl:max-w-7xl my-auto overflow-hidden flex flex-col max-h-[94vh]">
        
        {/* Header - Clean without logo and without SMTP Ready badge */}
        <div className="bg-gradient-to-r from-[#0A05B0] via-[#160E7A] to-[#0A05B0] text-white px-6 py-3.5 flex items-center justify-between shrink-0 shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center text-white">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full text-white/95">
                  Zeta QA Platform
                </span>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                  isApproved 
                    ? "bg-emerald-500/30 text-emerald-200 border-emerald-400/30" 
                    : "bg-amber-500/30 text-amber-200 border-amber-400/30"
                }`}>
                  {isApproved ? `${effectiveQaType} Approval` : `${effectiveQaType} Callouts (Pre-Approval)`}
                </span>
              </div>
              <h2 className="text-base font-bold text-white tracking-tight mt-0.5">
                {isApproved ? `Send ${effectiveQaType} Approval Email` : `Send ${effectiveQaType} Callouts to Campaign Owner`}
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Hidden inputs for bullet-specific screenshot upload */}
        <input
          ref={ownerBulletFileInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => handleBulletFileInputChange('owner', e)}
          className="hidden"
        />
        <input
          ref={clientBulletFileInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => handleBulletFileInputChange('client', e)}
          className="hidden"
        />

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs text-slate-700">
          
          {/* Main Grid: Team & Callouts on Left, Plain Preview on Right */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left Column (5 Cols) */}
            <div className="lg:col-span-5 space-y-4 border-b lg:border-b-0 lg:border-r border-slate-200 pb-5 lg:pb-0 lg:pr-5">
              
              {/* Team Members List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
                    <Users className="w-3.5 h-3.5 text-[#0A05B0]" />
                    Team Members
                    <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-semibold">
                      {filteredUsers.length}
                    </span>
                  </label>
                  <span className="text-[10px] text-slate-400 font-medium">Click to select recipient</span>
                </div>

                {/* Quick Search */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    placeholder="Search name, email, or role..."
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0A05B0] focus:bg-white"
                  />
                  {userSearchQuery && (
                    <button
                      onClick={() => setUserSearchQuery("")}
                      className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* All Users Cards */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 space-y-1.5 max-h-40 overflow-y-auto">
                  {filteredUsers.length === 0 ? (
                    <div className="py-4 text-center text-slate-400 text-xs">
                      No team members match "{userSearchQuery}"
                    </div>
                  ) : (
                    filteredUsers.map((u) => {
                      const isSelected = (selectedUser?.id && selectedUser.id === u.id) || 
                        (recipientEmail && recipientEmail.toLowerCase() === (u.email || "").toLowerCase());
                      const isCc = ccEmails.some(c => c.toLowerCase() === (u.email || "").toLowerCase());

                      return (
                        <div
                          key={u.id || u.email}
                          onClick={() => handleSelectUser(u)}
                          className={`p-2 rounded-lg border transition-all flex items-center justify-between gap-2 cursor-pointer ${
                            isSelected
                              ? "bg-white border-[#0A05B0] shadow-xs"
                              : "bg-white/80 border-slate-200/80 hover:bg-white hover:border-slate-300"
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 ${
                              isSelected ? "bg-[#0A05B0] text-white" : "bg-slate-200 text-slate-700"
                            }`}>
                              {String(u.name || u.email || "U").substring(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0 truncate">
                              <div className="flex items-center gap-1.5">
                                <span className={`font-semibold text-xs truncate ${isSelected ? "text-[#0A05B0]" : "text-slate-900"}`}>
                                  {u.name || (u.email ? u.email.split("@")[0] : "User")}
                                </span>
                                {u.role && (
                                  <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-medium shrink-0">
                                    {u.role}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-500 truncate">{u.email || ""}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => handleToggleCc(u.email || "", e)}
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded transition-colors cursor-pointer ${
                                isCc
                                    ? "bg-indigo-100 text-[#0A05B0] border border-indigo-200"
                                    : "bg-slate-100 text-slate-500 hover:bg-slate-200 border border-slate-200"
                              }`}
                              title={isCc ? "Remove from CC" : "Add to CC"}
                            >
                              {isCc ? "CC ✓" : "+ CC"}
                            </button>

                            {isSelected && (
                              <div className="w-5 h-5 rounded-full bg-[#0A05B0] text-white flex items-center justify-center">
                                <Check className="w-3 h-3" />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Compact CC Bar */}
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-700">
                      CC Recipients ({ccEmails.length}):
                    </span>
                    <span className="text-[10px] text-slate-400">Add custom CC below</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {ccEmails.map((email) => (
                      <span
                        key={email}
                        className="inline-flex items-center gap-1 bg-white border border-slate-300 text-[#0A05B0] text-[11px] px-2 py-0.5 rounded-md font-medium"
                      >
                        {email}
                        <button
                          type="button"
                          onClick={() => removeCc(email)}
                          className="hover:text-rose-600 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}

                    <div className="inline-flex items-center gap-1">
                      <input
                        type="email"
                        value={customCcInput}
                        onChange={(e) => setCustomCcInput(e.target.value)}
                        onKeyDown={handleAddCustomCc}
                        placeholder="Add CC email (press Enter)..."
                        className="px-2 py-1 bg-white border border-slate-200 rounded-md text-[11px] text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0A05B0] w-48"
                      />
                      {customCcInput && (
                        <button
                          type="button"
                          onClick={(e) => handleAddCustomCc(e)}
                          className="px-2 py-1 bg-[#0A05B0] text-white text-[10px] font-bold rounded-md cursor-pointer"
                        >
                          Add
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* 1. Callouts for Campaign Owner (Required - with "No callouts" checkbox) */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <ListPlus className="w-3.5 h-3.5 text-[#0A05B0]" />
                    <span className="font-bold text-slate-900 text-xs">Callouts to Campaign Owner</span>
                    <span className="text-rose-500 font-bold">*</span>
                    {ownerCalloutBullets.length > 0 && !noOwnerCallouts && (
                      <span className="text-[10px] bg-indigo-100 text-[#0A05B0] font-bold px-2 py-0.2 rounded-full">
                        {ownerCalloutBullets.length} bullet{ownerCalloutBullets.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  
                  <button
                    type="button"
                    onClick={() => setShowBulkOwnerCallouts(!showBulkOwnerCallouts)}
                    disabled={noOwnerCallouts}
                    className="text-[11px] text-[#0A05B0] hover:underline font-semibold cursor-pointer disabled:opacity-40"
                  >
                    {showBulkOwnerCallouts ? "Single Line" : "+ Bulk Paste"}
                  </button>
                </div>

                {/* Checkbox: No campaign owner callouts */}
                <label className="flex items-center gap-2 p-2 bg-white border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
                  <input
                    type="checkbox"
                    checked={noOwnerCallouts}
                    onChange={(e) => setNoOwnerCallouts(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-[#0A05B0] focus:ring-[#0A05B0] cursor-pointer"
                  />
                  <span className="text-xs font-semibold text-slate-800">
                    No campaign owner callouts
                  </span>
                </label>

                {!noOwnerCallouts && (
                  <>
                    {/* Bulk Paste Box */}
                    {showBulkOwnerCallouts ? (
                      <div className="space-y-2 p-2 bg-white border border-slate-200 rounded-lg">
                        <textarea
                          rows={3}
                          value={bulkOwnerCalloutsText}
                          onChange={(e) => setBulkOwnerCalloutsText(e.target.value)}
                          placeholder="Paste callouts (one per line)..."
                          className="w-full p-2 bg-slate-50 border border-slate-200 rounded text-xs text-slate-800 focus:outline-none focus:border-[#0A05B0] focus:bg-white resize-none"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setShowBulkOwnerCallouts(false)}
                            className="px-2.5 py-1 text-slate-500 hover:text-slate-700 text-xs font-medium cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleImportBulkOwnerCallouts}
                            className="px-3 py-1 bg-[#0A05B0] text-white text-xs font-bold rounded cursor-pointer"
                          >
                            Add Lines
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Single Callout Input */
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={newOwnerCalloutInput}
                          onChange={(e) => setNewOwnerCalloutInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddOwnerCallout(); } }}
                          placeholder="Add bullet point (press Enter)..."
                          className="flex-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0A05B0]"
                        />
                        <button
                          type="button"
                          onClick={handleAddOwnerCallout}
                          disabled={!newOwnerCalloutInput.trim()}
                          className="px-3 py-1.5 bg-[#0A05B0] hover:bg-[#08048A] text-white font-bold text-xs rounded-lg disabled:opacity-50 cursor-pointer"
                        >
                          Add
                        </button>
                      </div>
                    )}

                    {/* Bullets List with Paste Image option on each bullet */}
                    {ownerCalloutBullets.length > 0 && (
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                        {ownerCalloutBullets.map((bullet) => (
                          <div
                            key={bullet.id}
                            onPaste={(e) => handleBulletPaste('owner', bullet.id, e)}
                            className="p-2 bg-white border border-slate-200 hover:border-slate-300 rounded-lg shadow-2xs space-y-2 group transition-all"
                          >
                            <div className="flex items-start justify-between gap-1.5">
                              <div className="flex items-start gap-1.5 flex-1 min-w-0">
                                <span className="text-[#0A05B0] font-bold text-xs mt-1 shrink-0">•</span>
                                <input
                                  type="text"
                                  value={bullet.text}
                                  onChange={(e) => setOwnerCalloutBullets(prev => prev.map(b => b.id === bullet.id ? { ...b, text: e.target.value } : b))}
                                  onPaste={(e) => handleBulletPaste('owner', bullet.id, e)}
                                  placeholder="Describe callout... (paste image here with Ctrl+V)"
                                  className="w-full bg-slate-50/70 hover:bg-slate-50 focus:bg-white border border-slate-200/80 focus:border-[#0A05B0] text-xs text-slate-800 rounded px-2 py-1 focus:outline-none transition-colors"
                                />
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => openBulletImagePicker('owner', bullet.id)}
                                  className={`p-1 rounded text-xs flex items-center gap-1 transition-colors cursor-pointer ${
                                    bullet.screenshot 
                                      ? "bg-blue-50 text-[#0A05B0] border border-blue-200 font-bold" 
                                      : "text-slate-500 hover:text-[#0A05B0] hover:bg-blue-50 border border-slate-200"
                                  }`}
                                  title={bullet.screenshot ? "Replace screenshot" : "Attach screenshot to this bullet (or paste Ctrl+V)"}
                                >
                                  <ImageIcon className="w-3.5 h-3.5 text-[#0A05B0]" />
                                  <span className="text-[10px] hidden sm:inline">
                                    {bullet.screenshot ? "Image Attached" : "+ Image"}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setOwnerCalloutBullets(prev => prev.filter(b => b.id !== bullet.id))}
                                  className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 cursor-pointer transition-colors"
                                  title="Delete bullet point"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Screenshot rendered directly below this bullet point */}
                            {bullet.screenshot && (
                              <div className="ml-3 p-2 bg-slate-50 border border-slate-200 rounded-md space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-bold text-slate-700 flex items-center gap-1">
                                    <ImageIcon className="w-3 h-3 text-[#0A05B0]" />
                                    Attached Screenshot:
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setOwnerCalloutBullets(prev => prev.map(b => b.id === bullet.id ? { ...b, screenshot: undefined } : b))}
                                    className="text-slate-400 hover:text-rose-600 p-0.5 rounded cursor-pointer"
                                    title="Remove screenshot"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                                <div className="relative rounded overflow-hidden border border-slate-200 bg-white max-h-32 flex items-center justify-center">
                                  <img
                                    src={bullet.screenshot.dataUrl}
                                    alt={bullet.screenshot.name}
                                    className="max-h-32 max-w-full object-contain rounded"
                                  />
                                </div>
                                <input
                                  type="text"
                                  value={bullet.screenshot.caption || ""}
                                  onChange={(e) => setOwnerCalloutBullets(prev => prev.map(b => {
                                    if (b.id !== bullet.id || !b.screenshot) return b;
                                    return { ...b, screenshot: { ...b.screenshot, caption: e.target.value } };
                                  }))}
                                  placeholder="Optional screenshot caption..."
                                  className="w-full text-[10px] px-2 py-1 bg-white border border-slate-200 rounded text-slate-700 placeholder-slate-400 focus:outline-none focus:border-[#0A05B0]"
                                />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* 2. Client Callouts (Required - with "No client callouts" checkbox) */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <ListPlus className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="font-bold text-slate-900 text-xs">Client Callouts</span>
                    <span className="text-rose-500 font-bold">*</span>
                    {clientCalloutBullets.length > 0 && !noClientCallouts && (
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.2 rounded-full">
                        {clientCalloutBullets.length} bullet{clientCalloutBullets.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  
                  <button
                    type="button"
                    onClick={() => setShowBulkClientCallouts(!showBulkClientCallouts)}
                    disabled={noClientCallouts}
                    className="text-[11px] text-emerald-700 hover:underline font-semibold cursor-pointer disabled:opacity-40"
                  >
                    {showBulkClientCallouts ? "Single Line" : "+ Bulk Paste"}
                  </button>
                </div>

                {/* Checkbox: No client callouts */}
                <label className="flex items-center gap-2 p-2 bg-white border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
                  <input
                    type="checkbox"
                    checked={noClientCallouts}
                    onChange={(e) => setNoClientCallouts(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                  <span className="text-xs font-semibold text-slate-800">
                    No client callouts
                  </span>
                </label>

                {!noClientCallouts && (
                  <>
                    {/* Bulk Paste Box */}
                    {showBulkClientCallouts ? (
                      <div className="space-y-2 p-2 bg-white border border-slate-200 rounded-lg">
                        <textarea
                          rows={3}
                          value={bulkClientCalloutsText}
                          onChange={(e) => setBulkClientCalloutsText(e.target.value)}
                          placeholder="Paste client callouts (one per line)..."
                          className="w-full p-2 bg-slate-50 border border-slate-200 rounded text-xs text-slate-800 focus:outline-none focus:border-emerald-600 focus:bg-white resize-none"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setShowBulkClientCallouts(false)}
                            className="px-2.5 py-1 text-slate-500 hover:text-slate-700 text-xs font-medium cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleImportBulkClientCallouts}
                            className="px-3 py-1 bg-emerald-600 text-white text-xs font-bold rounded cursor-pointer"
                          >
                            Add Lines
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Single Callout Input */
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={newClientCalloutInput}
                          onChange={(e) => setNewClientCalloutInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddClientCallout(); } }}
                          placeholder="Add client bullet point (press Enter)..."
                          className="flex-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-600"
                        />
                        <button
                          type="button"
                          onClick={handleAddClientCallout}
                          disabled={!newClientCalloutInput.trim()}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg disabled:opacity-50 cursor-pointer"
                        >
                          Add
                        </button>
                      </div>
                    )}

                    {/* Bullets List with Paste Image option on each bullet */}
                    {clientCalloutBullets.length > 0 && (
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                        {clientCalloutBullets.map((bullet) => (
                          <div
                            key={bullet.id}
                            onPaste={(e) => handleBulletPaste('client', bullet.id, e)}
                            className="p-2 bg-white border border-slate-200 hover:border-slate-300 rounded-lg shadow-2xs space-y-2 group transition-all"
                          >
                            <div className="flex items-start justify-between gap-1.5">
                              <div className="flex items-start gap-1.5 flex-1 min-w-0">
                                <span className="text-emerald-600 font-bold text-xs mt-1 shrink-0">•</span>
                                <input
                                  type="text"
                                  value={bullet.text}
                                  onChange={(e) => setClientCalloutBullets(prev => prev.map(b => b.id === bullet.id ? { ...b, text: e.target.value } : b))}
                                  onPaste={(e) => handleBulletPaste('client', bullet.id, e)}
                                  placeholder="Describe client callout... (paste image here with Ctrl+V)"
                                  className="w-full bg-slate-50/70 hover:bg-slate-50 focus:bg-white border border-slate-200/80 focus:border-emerald-600 text-xs text-slate-800 rounded px-2 py-1 focus:outline-none transition-colors"
                                />
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => openBulletImagePicker('client', bullet.id)}
                                  className={`p-1 rounded text-xs flex items-center gap-1 transition-colors cursor-pointer ${
                                    bullet.screenshot 
                                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold" 
                                      : "text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 border border-slate-200"
                                  }`}
                                  title={bullet.screenshot ? "Replace screenshot" : "Attach screenshot to this bullet (or paste Ctrl+V)"}
                                >
                                  <ImageIcon className="w-3.5 h-3.5 text-emerald-600" />
                                  <span className="text-[10px] hidden sm:inline">
                                    {bullet.screenshot ? "Image Attached" : "+ Image"}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setClientCalloutBullets(prev => prev.filter(b => b.id !== bullet.id))}
                                  className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 cursor-pointer transition-colors"
                                  title="Delete bullet point"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Screenshot rendered directly below this bullet point */}
                            {bullet.screenshot && (
                              <div className="ml-3 p-2 bg-slate-50 border border-slate-200 rounded-md space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-bold text-slate-700 flex items-center gap-1">
                                    <ImageIcon className="w-3 h-3 text-emerald-600" />
                                    Attached Screenshot:
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setClientCalloutBullets(prev => prev.map(b => b.id === bullet.id ? { ...b, screenshot: undefined } : b))}
                                    className="text-slate-400 hover:text-rose-600 p-0.5 rounded cursor-pointer"
                                    title="Remove screenshot"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                                <div className="relative rounded overflow-hidden border border-slate-200 bg-white max-h-32 flex items-center justify-center">
                                  <img
                                    src={bullet.screenshot.dataUrl}
                                    alt={bullet.screenshot.name}
                                    className="max-h-32 max-w-full object-contain rounded"
                                  />
                                </div>
                                <input
                                  type="text"
                                  value={bullet.screenshot.caption || ""}
                                  onChange={(e) => setClientCalloutBullets(prev => prev.map(b => {
                                    if (b.id !== bullet.id || !b.screenshot) return b;
                                    return { ...b, screenshot: { ...b.screenshot, caption: e.target.value } };
                                  }))}
                                  placeholder="Optional screenshot caption..."
                                  className="w-full text-[10px] px-2 py-1 bg-white border border-slate-200 rounded text-slate-700 placeholder-slate-400 focus:outline-none focus:border-emerald-600"
                                />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

            </div>

            {/* Right Column: Subject, Plain Text Preview & Dispatch (7 Cols) */}
            <div className="lg:col-span-7 space-y-3.5">
              
              {/* Subject line and Sign-off Sender */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-8">
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-slate-800 text-xs flex items-center gap-1">
                      <span>Subject Line</span>
                      <span className="text-rose-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={handleCopySubject}
                      className="text-[11px] text-[#0A05B0] hover:underline flex items-center gap-1 cursor-pointer font-medium"
                    >
                      {isSubjectCopied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      {isSubjectCopied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-semibold text-slate-900 text-xs focus:outline-none focus:border-[#0A05B0] focus:bg-white"
                  />
                </div>

                <div className="sm:col-span-4">
                  <label className="block font-bold text-slate-800 text-xs mb-1">
                    Sign-off First Name
                  </label>
                  <input
                    type="text"
                    value={senderFirstName}
                    onChange={(e) => setSenderFirstName(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-semibold text-slate-800 text-xs focus:outline-none focus:border-[#0A05B0] focus:bg-white"
                  />
                </div>
              </div>

              {/* Email Preview: Plain Version Only (Formatted Email preview completely removed) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
                    <Mail className="w-3.5 h-3.5 text-[#0A05B0]" />
                    Email Preview
                  </label>

                  <button
                    type="button"
                    onClick={handleCopyBody}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
                    {isCopied ? "Copied Email Text!" : "Copy Text"}
                  </button>
                </div>

                {/* Plain Text Preview Container */}
                <div className="bg-slate-900 border border-slate-800 text-slate-100 rounded-xl p-4 font-mono text-xs shadow-inner space-y-3 leading-relaxed max-h-[380px] overflow-y-auto">
                  <div className="text-slate-400 border-b border-slate-800 pb-2 text-[11px] space-y-1">
                    <div>
                      <span className="text-slate-500 font-sans">To:</span>{" "}
                      <span className="text-blue-400 font-semibold font-sans">
                        {effectiveTargetEmail ? `${effectiveRecipientName} <${effectiveTargetEmail}>` : "[Select a team member on the left]"}
                      </span>
                    </div>
                    {ccEmails.length > 0 && (
                      <div>
                        <span className="text-slate-500 font-sans">CC:</span>{" "}
                        <span className="text-indigo-300 font-sans">{ccEmails.join(", ")}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-slate-500 font-sans">Subject:</span>{" "}
                      <span className="text-amber-300 font-bold font-sans">{subject}</span>
                    </div>
                  </div>

                  <div className="whitespace-pre-wrap text-slate-200 font-sans text-xs bg-slate-950/60 p-3.5 rounded-lg border border-slate-800">
                    {emailBodyText}
                  </div>

                  {/* Bullet screenshot attachments badge summary */}
                  {(ownerCalloutBullets.some(b => b.screenshot) || clientCalloutBullets.some(b => b.screenshot)) && (
                    <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 font-sans flex items-center gap-1">
                      <Paperclip className="w-3 h-3 text-slate-400" />
                      <span>
                        Attached callout screenshots:{" "}
                        {ownerCalloutBullets.filter(b => b.screenshot).length + clientCalloutBullets.filter(b => b.screenshot).length} image(s)
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Excel Checklist Attachment Card */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-indigo-50/80 border border-indigo-200 text-slate-800 shadow-2xs">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[#0A05B0] text-white flex items-center justify-center font-bold text-xs shadow-xs shrink-0">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-xs text-slate-900 flex items-center gap-1.5 flex-wrap">
                      <span>{`ZETA_QA_Checklist_${effectiveQaType.replace(/\s+/g, "_")}_${campaignName.replace(/[^a-zA-Z0-9_-]/g, "_")}.xlsx`}</span>
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                        Auto-Attached
                      </span>
                      <span className="text-[10px] bg-white text-[#0A05B0] font-bold px-2 py-0.5 rounded border border-indigo-200">
                        {effectiveQaType} Framework
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleDownloadExcel}
                  className="px-3 py-1.5 text-[11px] font-bold bg-white text-[#0A05B0] border border-indigo-300 rounded-lg hover:bg-indigo-50 flex items-center gap-1.5 transition-colors shrink-0 shadow-2xs cursor-pointer ml-2"
                  title="Download a local copy of this Excel verification sheet"
                >
                  <Download className="w-3.5 h-3.5 text-[#0A05B0]" />
                  <span>Download Excel</span>
                </button>
              </div>

              {/* Status Message */}
              {dispatchStatus && (
                <div
                  className={`p-3.5 rounded-xl border text-xs font-semibold flex items-start justify-between gap-3 shadow-2xs ${
                    dispatchStatus.type === "success"
                      ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                      : dispatchStatus.type === "info"
                      ? "bg-blue-50 border-blue-200 text-blue-900"
                      : "bg-rose-50 border-rose-200 text-rose-900"
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    {dispatchStatus.type === "success" && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    )}
                    {dispatchStatus.type === "error" && (
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    )}
                    <span>{dispatchStatus.text}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Action Buttons */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-end gap-3 shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="text-slate-700 border-slate-300 text-xs font-semibold px-4 cursor-pointer"
            disabled={isSending}
          >
            Close
          </Button>

          {/* Primary Action: Send Approval / Send Callouts */}
          <Button
            type="button"
            onClick={handleLogAndSend}
            disabled={isSending || !effectiveTargetEmail}
            className={`px-6 py-2.5 rounded-lg text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-all cursor-pointer hover:shadow-md ${
              isApproved
                ? "bg-[#0A05B0] hover:bg-[#08048A]"
                : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            {isSending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{isApproved ? "Sending Approval..." : "Sending Callouts..."}</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>{isApproved ? "Send Approval Email" : "Send Callouts to Campaign Owner"}</span>
              </>
            )}
          </Button>
        </div>

      </div>
    </div>
  );
}
