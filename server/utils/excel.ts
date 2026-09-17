import * as XLSX from "xlsx";

export interface ServerQAExcelParams {
  campaignName: string;
  team?: string;
  country?: string;
  versionName?: string;
  userEmail?: string;
  campaignStatus?: string;
  qaType?: string;
  checklists?: Array<{
    id: string;
    stage?: number;
    text: string;
  }>;
  answers?: Record<string, { status?: string | null; text?: string }>;
}

const DEFAULT_FALLBACK_CHECKPOINTS = [
  { id: "visual_desktop_light", stage: 2, text: "Desktop Light Mode Rendering & Layout Verification against Figma" },
  { id: "visual_mobile_light", stage: 2, text: "Mobile Light Mode Rendering & Layout Verification against Figma" },
  { id: "visual_desktop_dark", stage: 2, text: "Desktop Dark Mode Inversion & Color Verification" },
  { id: "visual_mobile_dark", stage: 2, text: "Mobile Dark Mode Inversion & Color Verification" },
  { id: "apj-cqa-brief-1", stage: 2, text: "Compare eDM content against Figma design including assets and typography" },
  { id: "apj-cqa-brief-2", stage: 2, text: "Compare text dimensions, padding, and spacing against Figma/XD specifications" },
  { id: "apj-cqa-links-1", stage: 4, text: "Header, Body, and Footer links are active with required UTM tracking tags" },
  { id: "apj-cqa-links-2", stage: 4, text: "CTAs route accurately to designated regional store landing pages" },
  { id: "apj-cqa-links-3", stage: 4, text: "Unsubscribe and Privacy Policy links verified against HP Global requirements" },
  { id: "apj-cqa-tags-1", stage: 3, text: "All imagery has descriptive ALT tags for accessibility compliance" },
  { id: "apj-cqa-tags-2", stage: 3, text: "Unique alias tags assigned across all actionable tracking links" },
  { id: "apj-cqa-copy-1", stage: 5, text: "Subject line, preheader, and headline spelling and grammar verified" },
  { id: "apj-cqa-copy-2", stage: 5, text: "Pricing, currency symbols, and promotional discount codes validated" },
  { id: "apj-cqa-copy-3", stage: 5, text: "Mandatory legal disclaimers, copyrights, and terms & conditions verified" },
  { id: "apj-cqa-sched-1", stage: 1, text: "Sender Profile, Delivery Profile, and from address accurate for target region" },
  { id: "apj-cqa-sched-2", stage: 1, text: "Deployment schedule date, time, and timezone match campaign brief" },
  { id: "apj-cqa-dep-1", stage: 6, text: "Target Data Extension and exclusion lists verified in tracking folder" },
  { id: "apj-cqa-dep-2", stage: 6, text: "Throttle rules verified if specified in the deployment brief" }
];

const stageNames: Record<number, string> = {
  0: "Global Checkpoints",
  1: "Details & Source",
  2: "Visual Comparison",
  3: "Alt & Alias Tags",
  4: "Link Validation",
  5: "Grammar & Spell Check",
  6: "Review & Approval / Launch",
  7: "Final Review & Sign-off"
};

export function generateServerQAChecklistBase64(params: ServerQAExcelParams): { filename: string; base64: string } {
  const {
    campaignName = "Untitled Campaign",
    team = "Zeta QA",
    country = "Global",
    versionName = "v1",
    userEmail = "",
    campaignStatus = "Approved",
    qaType = "CQA",
    checklists = [],
    answers = {}
  } = params;

  const normalizedQaType = (qaType || "CQA").toUpperCase();

  const activeChecklists = (checklists && checklists.length > 0)
    ? checklists
    : DEFAULT_FALLBACK_CHECKPOINTS;

  let totalPoints = 0;
  let passedCount = 0;
  let naCount = 0;
  let missedCount = 0;

  activeChecklists.forEach((item) => {
    totalPoints++;
    const status = answers[item.id]?.status;
    if (status === "Checked") passedCount++;
    else if (status === "N/A") naCount++;
    else missedCount++;
  });

  const passRate = totalPoints > 0 ? Math.round(((passedCount + naCount) / totalPoints) * 100) : 100;

  // Group active checklists by stage
  const groupedByStage: Record<number, typeof activeChecklists> = {};
  activeChecklists.forEach((item) => {
    const s = item.stage ?? 0;
    if (!groupedByStage[s]) groupedByStage[s] = [];
    groupedByStage[s].push(item);
  });

  const sortedStages = Object.keys(groupedByStage).map(Number).sort((a, b) => a - b);

  const boldRowIndices = new Set<number>();
  const sectionHeaderIndices = new Set<number>();
  const stageHeaderIndices = new Set<number>();

  const dataAOA: any[][] = [];

  // Row 0: Title Banner
  boldRowIndices.add(dataAOA.length);
  dataAOA.push([`ZETA ENTERPRISE EMAIL QUALITY ASSURANCE - ${normalizedQaType} VERIFICATION REPORT`, "", "", "", "", ""]);

  // Row 1: Subtitle
  dataAOA.push(["Zeta Global Enterprise Multi-Team QA Verification System", "", "", "", "", ""]);
  dataAOA.push([]); // Row 2: Spacer

  // Section 1: Campaign Metadata
  sectionHeaderIndices.add(dataAOA.length);
  boldRowIndices.add(dataAOA.length);
  dataAOA.push(["CAMPAIGN SPECIFICATION & METADATA", "", "", "", "", ""]);

  const metaRows: [string, string][] = [
    ["Campaign Name", campaignName],
    ["QA Checklist Type", normalizedQaType],
    ["Target Team / Region", `${team} - ${country}`],
    ["Version Name", versionName],
    ["Verified By QA Lead", userEmail],
    ["Campaign Verification Status", campaignStatus],
    ["Report Generated At", new Date().toLocaleString("en-US", { dateStyle: "full", timeStyle: "medium" })]
  ];

  metaRows.forEach(row => {
    dataAOA.push([row[0], row[1], "", "", "", ""]);
  });

  dataAOA.push([]); // Spacer

  // Section 2: Metrics
  sectionHeaderIndices.add(dataAOA.length);
  boldRowIndices.add(dataAOA.length);
  dataAOA.push(["COMPLIANCE & VERIFICATION METRICS", "", "", "", "", ""]);

  const metricRows: [string, string | number][] = [
    ["Total Checkpoints Evaluated", totalPoints],
    ["Passed Checkpoints", passedCount],
    ["Not Applicable / Exempt (N/A)", naCount],
    ["Pending / Action Required", missedCount],
    ["Overall Compliance Score", `${passRate}%`],
    ["Compliance Rating", passRate === 100 ? "EXCELLENT (100% PASS)" : passRate >= 90 ? "GOOD" : "NEEDS ATTENTION"]
  ];

  metricRows.forEach(row => {
    dataAOA.push([row[0], row[1], "", "", "", ""]);
  });

  dataAOA.push([]); // Spacer

  // Section 3: Audit Trail
  sectionHeaderIndices.add(dataAOA.length);
  boldRowIndices.add(dataAOA.length);
  dataAOA.push([`STAGE-WISE ${normalizedQaType} VERIFICATION AUDIT TRAIL`, "", "", "", "", ""]);

  // Table Column Header
  const tableHeaderIndex = dataAOA.length;
  boldRowIndices.add(tableHeaderIndex);
  dataAOA.push(["Stage #", "Stage Category", "Checkpoint ID", "Checkpoint Description", "Verification Status", "QA Notes & Inputs"]);

  const checkpointRowsIndices: number[] = [];

  // Append Stage-Wise grouped checkpoints
  sortedStages.forEach((stageNum) => {
    const stageItems = groupedByStage[stageNum];
    if (!stageItems || stageItems.length === 0) return;

    const stageLabel = stageNames[stageNum] || `Stage ${stageNum}`;
    const stagePassed = stageItems.filter(it => answers[it.id]?.status === "Checked" || answers[it.id]?.status === "N/A").length;

    // Stage Section Banner Row
    const stageRowIdx = dataAOA.length;
    stageHeaderIndices.add(stageRowIdx);
    boldRowIndices.add(stageRowIdx);
    dataAOA.push([
      `STAGE ${stageNum}`,
      `${stageLabel.toUpperCase()} (${stagePassed}/${stageItems.length} Verified)`,
      "",
      "",
      "",
      ""
    ]);

    // Checkpoint Rows for this Stage
    stageItems.forEach((item, idx) => {
      const ans = answers[item.id] || { status: null, text: "" };

      let statusLabel = "PENDING / MISSED";
      if (ans.status === "Checked") statusLabel = "PASSED";
      else if (ans.status === "N/A") statusLabel = "N/A (EXEMPT)";

      const rowIdx = dataAOA.length;
      checkpointRowsIndices.push(rowIdx);
      dataAOA.push([
        `${stageNum}.${idx + 1}`,
        stageLabel,
        item.id,
        item.text,
        statusLabel,
        ans.text || ""
      ]);
    });

    // Spacer row between stages
    dataAOA.push([]);
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(dataAOA);

  // Apply bold font styles and branding to relevant cells
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1:F1");
  for (let R = range.s.r; R <= range.e.r; ++R) {
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[cellAddress];
      if (!cell || !cell.v) continue;

      if (!cell.s) cell.s = {};

      // 1. Report Title Row (Row 0)
      if (R === 0) {
        cell.s = {
          font: { bold: true, sz: 14, color: { rgb: "0A05B0" } },
          alignment: { vertical: "center" }
        };
      }
      // 2. Section Headers
      else if (sectionHeaderIndices.has(R)) {
        cell.s = {
          font: { bold: true, sz: 12, color: { rgb: "0F172A" } },
          fill: { fgColor: { rgb: "F1F5F9" } }
        };
      }
      // 3. Table Column Headers
      else if (R === tableHeaderIndex) {
        cell.s = {
          font: { bold: true, sz: 11, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "0A05B0" } },
          alignment: { horizontal: "center", vertical: "center" }
        };
      }
      // 4. Stage Banner Rows
      else if (stageHeaderIndices.has(R)) {
        cell.s = {
          font: { bold: true, sz: 11, color: { rgb: "1E293B" } },
          fill: { fgColor: { rgb: "E2E8F0" } }
        };
      }
      // 5. Metadata & Metrics label column (Col A)
      else if (C === 0 && R < tableHeaderIndex && !sectionHeaderIndices.has(R)) {
        cell.s = {
          font: { bold: true, sz: 10, color: { rgb: "334155" } }
        };
      }
      // 6. Checkpoint title / description cells (Col C = Checkpoint ID, Col D = Description)
      else if (checkpointRowsIndices.includes(R) && (C === 2 || C === 3)) {
        cell.s = {
          font: { bold: C === 3, sz: 10, color: { rgb: "0F172A" } }
        };
      }
      // 7. Status column styling (Col E)
      else if (checkpointRowsIndices.includes(R) && C === 4) {
        const val = String(cell.v);
        const isPassed = val === "PASSED";
        cell.s = {
          font: { bold: true, sz: 10, color: { rgb: isPassed ? "059669" : "DC2626" } },
          alignment: { horizontal: "center" }
        };
      }
    }
  }

  ws["!cols"] = [
    { wch: 14 }, // Stage #
    { wch: 32 }, // Stage Category
    { wch: 24 }, // Checkpoint ID
    { wch: 76 }, // Description
    { wch: 22 }, // Status
    { wch: 38 }  // Notes
  ];

  const sheetName = `${normalizedQaType} Verification Checklist`.slice(0, 31);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const cleanName = campaignName.replace(/[^a-zA-Z0-9_-]/g, "_");
  const qaTypeStr = normalizedQaType.replace(/[^a-zA-Z0-9_-]/g, "_");
  const filename = `ZETA_QA_Checklist_${qaTypeStr}_${cleanName}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  const base64 = XLSX.write(wb, { type: "base64", bookType: "xlsx" });

  return { filename, base64 };
}
