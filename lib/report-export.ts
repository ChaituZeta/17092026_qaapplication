import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { CampaignRecord } from "@/lib/campaign-storage";
import { getCampaignCheckpointProgress, DEFAULT_CHECKLISTS } from "@/lib/checklist-utils";
import { DEFAULT_PLATFORM_CHECKLISTS } from "@/lib/checklist-storage";
import { resolveUserFullName } from "@/lib/userNames";

export interface ReportStatsData {
  totalCampaigns: number;
  totalCheckpoints: number;
  completedCheckpoints: number;
  checkedCount: number;
  naCount: number;
  pendingCount: number;
  fullyVerifiedCount: number;
  overallPercentage: number;
  qaPersonMap: Record<string, { count: number; completed: number; total: number }>;
}

/**
 * Clean and format CSV cell text to prevent delimiter collisions.
 */
function cleanCSV(val: any): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

/**
 * Trigger browser file download for text/csv data
 */
function downloadBlob(content: string, filename: string, mimeType: string = "text/csv;charset=utf-8;") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * 1. Export Campaigns Audit Table to CSV
 */
export function exportCampaignsToCSV(campaigns: CampaignRecord[], customFilename?: string) {
  const headers = [
    "Campaign Name",
    "Country",
    "Version",
    "Status",
    "Total Checkpoints",
    "Completed Checkpoints",
    "Verified (Checked)",
    "N/A Marked",
    "Pending (Left)",
    "QA Compliance Rate (%)",
    "QA Auditor",
    "Created Date",
    "Last QA Activity",
    "Campaign ID"
  ];

  const rows = campaigns.map((c) => {
    const prog = getCampaignCheckpointProgress(c);
    const rawQa = c.assignedQa || c.lastEditedBy || c.createdBy || c.userEmail;
    const qaPerson = resolveUserFullName(rawQa, "Chaithanya");

    return [
      cleanCSV(c.name),
      cleanCSV(c.country),
      cleanCSV(c.versionName || "Standard"),
      cleanCSV(c.status),
      prog.total,
      prog.completed,
      prog.checked,
      prog.na,
      prog.pending,
      `${prog.percent}%`,
      cleanCSV(qaPerson),
      cleanCSV(c.created_at || ""),
      cleanCSV(c.updated_at || ""),
      cleanCSV(c.id)
    ].join(",");
  });

  const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\r\n");
  const filename = customFilename || `QA_Campaigns_Audit_Report_${new Date().toISOString().slice(0, 10)}.csv`;
  downloadBlob(csvContent, filename);
}

/**
 * 2. Export Auditor Performance Breakdown to CSV
 */
export function exportAuditorsToCSV(
  qaPersonMap: Record<string, { count: number; completed: number; total: number }>,
  customFilename?: string
) {
  const headers = [
    "QA Auditor Name",
    "Campaigns Handled",
    "Completed Checkpoints",
    "Total Checkpoints Assigned",
    "Pending Checkpoints",
    "Compliance Rate (%)"
  ];

  const rows = Object.entries(qaPersonMap).map(([auditor, data]) => {
    const pending = Math.max(0, data.total - data.completed);
    const rate = data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0;
    return [
      cleanCSV(auditor),
      data.count,
      data.completed,
      data.total,
      pending,
      `${rate}%`
    ].join(",");
  });

  const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\r\n");
  const filename = customFilename || `QA_Auditor_Performance_Report_${new Date().toISOString().slice(0, 10)}.csv`;
  downloadBlob(csvContent, filename);
}

/**
 * 3. Export Single Campaign Checklist Items to CSV
 */
export function exportSingleCampaignChecklistToCSV(campaign: CampaignRecord, customFilename?: string) {
  const prog = getCampaignCheckpointProgress(campaign);
  const rawQa = campaign.assignedQa || campaign.lastEditedBy || campaign.createdBy || campaign.userEmail;
  const qaPerson = resolveUserFullName(rawQa, "Chaithanya");

  const headers = [
    "Stage / Category",
    "Item ID",
    "Checkpoint Requirement",
    "Evaluation Status",
    "Auditor Notes / Input",
    "Campaign Name",
    "Country",
    "Version",
    "Campaign Status",
    "Auditor Person"
  ];

  const rows = prog.items.map((entry, index) => {
    const stageNum = entry.item.stage ?? Math.floor(index / 4) + 1;
    const stageLabel = `Stage ${stageNum}`;
    return [
      cleanCSV(stageLabel),
      cleanCSV(entry.item.id),
      cleanCSV(entry.item.text),
      cleanCSV(entry.status),
      cleanCSV(entry.notes || ""),
      cleanCSV(campaign.name),
      cleanCSV(campaign.country),
      cleanCSV(campaign.versionName || "Standard"),
      cleanCSV(campaign.status),
      cleanCSV(qaPerson)
    ].join(",");
  });

  const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\r\n");
  const safeName = (campaign.name || "Campaign").replace(/[^a-zA-Z0-9_-]/g, "_");
  const filename = customFilename || `QA_Checklist_Audit_${safeName}_${new Date().toISOString().slice(0, 10)}.csv`;
  downloadBlob(csvContent, filename);
}

/**
 * 4. Export Comprehensive QA Audit Report to PDF (Landscape A4)
 */
export function exportCampaignsToPDF(params: {
  campaigns: CampaignRecord[];
  reportStats: ReportStatsData;
  filterContext?: string;
  customFilename?: string;
}) {
  const { campaigns, reportStats, filterContext, customFilename } = params;

  // Initialize PDF in landscape orientation for clear, spacious data table
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4"
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const currentDate = new Date().toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  });

  // --- BRAND HEADER BAR ---
  doc.setFillColor(30, 58, 138); // Navy 900
  doc.rect(0, 0, pageWidth, 22, "F");

  // Accent line
  doc.setFillColor(0, 150, 214); // HP Blue #0096D6
  doc.rect(0, 22, pageWidth, 2, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("HP QA PLATFORM - APJ QUALITY ASSURANCE AUDIT REPORT", 14, 11);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225);
  doc.text(`Zeta Global & HP Inc. • Generated: ${currentDate} • Active Scope: ${filterContext || "All Active Campaigns"}`, 14, 18);

  // Top right badge
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text("CONFIDENTIAL AUDIT", pageWidth - 14, 14, { align: "right" });

  // --- EXECUTIVE METRICS SUMMARY TILES ---
  const startY = 28;
  const cardWidth = (pageWidth - 28 - 12) / 4; // 4 cards with 4mm spacing
  const cardHeight = 18;

  const cards = [
    {
      title: "TOTAL CAMPAIGNS",
      val: `${reportStats.totalCampaigns}`,
      sub: `${reportStats.fullyVerifiedCount} Verified (100%)`,
      color: [43, 97, 214] as [number, number, number]
    },
    {
      title: "COMPLIANCE RATE",
      val: `${reportStats.overallPercentage}%`,
      sub: `${reportStats.completedCheckpoints} of ${reportStats.totalCheckpoints} Items`,
      color: [16, 185, 129] as [number, number, number]
    },
    {
      title: "VERIFIED CHECKPOINTS",
      val: `${reportStats.checkedCount}`,
      sub: `+ ${reportStats.naCount} Marked N/A`,
      color: [5, 150, 105] as [number, number, number]
    },
    {
      title: "PENDING QA ITEMS",
      val: `${reportStats.pendingCount}`,
      sub: "Awaiting Verification",
      color: [217, 119, 6] as [number, number, number]
    }
  ];

  cards.forEach((card, idx) => {
    const x = 14 + idx * (cardWidth + 4);
    // Background
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, startY, cardWidth, cardHeight, 2, 2, "F");

    // Border
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, startY, cardWidth, cardHeight, 2, 2, "S");

    // Left accent bar
    doc.setFillColor(...card.color);
    doc.roundedRect(x, startY, 2.5, cardHeight, 1, 1, "F");

    // Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(card.title, x + 6, startY + 5);

    // Value
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text(card.val, x + 6, startY + 11.5);

    // Subtitle
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(card.sub, x + 6, startY + 15.5);
  });

  // --- AUDITOR WORKLOAD SUMMARY TABLE ---
  const auditorEntries = Object.entries(reportStats.qaPersonMap);
  let tableStartY = startY + cardHeight + 6;

  if (auditorEntries.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text("Auditor Workload & Quality Compliance Summary", 14, tableStartY + 3);

    const auditorHead = [["QA Auditor Name", "Campaigns Audited", "Completed Checkpoints", "Total Checkpoints", "Pending Items", "Compliance %"]];
    const auditorBody = auditorEntries.map(([auditor, data]) => {
      const pending = Math.max(0, data.total - data.completed);
      const rate = data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0;
      return [
        auditor,
        data.count.toString(),
        data.completed.toString(),
        data.total.toString(),
        pending.toString(),
        `${rate}%`
      ];
    });

    autoTable(doc, {
      startY: tableStartY + 5,
      head: auditorHead,
      body: auditorBody,
      margin: { left: 14, right: 14 },
      theme: "plain",
      headStyles: {
        fillColor: [241, 245, 249],
        textColor: [51, 65, 85],
        fontStyle: "bold",
        fontSize: 7.5,
        cellPadding: 2
      },
      bodyStyles: {
        fontSize: 7.5,
        textColor: [30, 41, 59],
        cellPadding: 2
      },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 60 },
        1: { halign: "center", cellWidth: 35 },
        2: { halign: "center", cellWidth: 40 },
        3: { halign: "center", cellWidth: 40 },
        4: { halign: "center", cellWidth: 35 },
        5: { halign: "center", fontStyle: "bold", cellWidth: 35 }
      }
    });

    tableStartY = (doc as any).lastAutoTable.finalY + 6;
  }

  // --- MAIN CAMPAIGN CHECKPOINT AUDIT BREAKDOWN TABLE ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(`Campaign Checkpoint Audit Breakdown (${campaigns.length} Records)`, 14, tableStartY + 3);

  const mainHead = [
    [
      "Campaign Name",
      "Country",
      "Version",
      "Status",
      "QA Progress",
      "Rate",
      "Checked",
      "N/A",
      "Pending",
      "QA Auditor",
      "Last Activity"
    ]
  ];

  const mainBody = campaigns.map((campaign) => {
    const prog = getCampaignCheckpointProgress(campaign);
    const rawQa = campaign.assignedQa || campaign.lastEditedBy || campaign.createdBy || campaign.userEmail;
    const qaPerson = resolveUserFullName(rawQa, "Chaithanya");

    return [
      campaign.name,
      campaign.country,
      campaign.versionName || "Standard",
      campaign.status,
      `${prog.completed} / ${prog.total}`,
      `${prog.percent}%`,
      prog.checked.toString(),
      prog.na.toString(),
      prog.pending.toString(),
      qaPerson,
      campaign.updated_at ? campaign.updated_at.slice(0, 16) : "-"
    ];
  });

  autoTable(doc, {
    startY: tableStartY + 5,
    head: mainHead,
    body: mainBody,
    margin: { left: 14, right: 14, bottom: 16 },
    theme: "striped",
    headStyles: {
      fillColor: [30, 58, 138], // Navy header
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 7.5,
      cellPadding: 2.5
    },
    bodyStyles: {
      fontSize: 7,
      textColor: [30, 41, 59],
      cellPadding: 2.2
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252]
    },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 55 },
      1: { cellWidth: 20 },
      2: { cellWidth: 22 },
      3: { cellWidth: 24, fontStyle: "bold" },
      4: { halign: "center", cellWidth: 22 },
      5: { halign: "center", fontStyle: "bold", cellWidth: 16 },
      6: { halign: "center", cellWidth: 16 },
      7: { halign: "center", cellWidth: 14 },
      8: { halign: "center", cellWidth: 16 },
      9: { cellWidth: 32 },
      10: { cellWidth: 32, fontSize: 6.5 }
    },
    didDrawCell: (data) => {
      // Highlight Status column with custom badge text colors
      if (data.section === "body" && data.column.index === 3) {
        const text = String(data.cell.raw);
        if (text === "QA Approved" || text === "Live") {
          data.cell.styles.textColor = [16, 185, 129]; // Emerald
        } else if (text === "In QA Review") {
          data.cell.styles.textColor = [43, 97, 214]; // Blue
        } else {
          data.cell.styles.textColor = [100, 116, 139]; // Gray
        }
      }
      // Highlight Compliance Rate
      if (data.section === "body" && data.column.index === 5) {
        const text = String(data.cell.raw);
        if (text === "100%") {
          data.cell.styles.textColor = [16, 185, 129];
        } else if (text.startsWith("0%")) {
          data.cell.styles.textColor = [148, 163, 184];
        } else {
          data.cell.styles.textColor = [30, 58, 138];
        }
      }
    }
  });

  // --- FOOTER PAGINATION ---
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);

    // Left disclaimer
    doc.text(
      "HP Inc. & Zeta Global APJ Quality Assurance Platform • Confidential Enterprise Audit Report",
      14,
      pageHeight - 7
    );

    // Right page number
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - 14, pageHeight - 7, { align: "right" });
  }

  const filename = customFilename || `QA_Audit_Report_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}

/**
 * 5. Export Detailed Single Campaign Inspection Certificate & Checklist to PDF (Portrait A4)
 */
export function exportSingleCampaignChecklistToPDF(campaign: CampaignRecord, customFilename?: string) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const currentDate = new Date().toLocaleString("en-US", {
    dateStyle: "full",
    timeStyle: "short"
  });

  const prog = getCampaignCheckpointProgress(campaign);
  const rawQa = campaign.assignedQa || campaign.lastEditedBy || campaign.createdBy || campaign.userEmail;
  const qaPerson = resolveUserFullName(rawQa, "Chaithanya");

  // Top Header Banner
  doc.setFillColor(30, 58, 138); // Navy 900
  doc.rect(0, 0, pageWidth, 24, "F");

  doc.setFillColor(0, 150, 214); // HP Blue
  doc.rect(0, 24, pageWidth, 2, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("HP QA PLATFORM - CAMPAIGN INSPECTION CERTIFICATE", 14, 12);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225);
  doc.text("Quality Assurance Checkpoint Audit Breakdown & Stage Sign-off", 14, 19);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(`SCORE: ${prog.percent}%`, pageWidth - 14, 15, { align: "right" });

  // Campaign Metadata Card
  const metaY = 30;
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, metaY, pageWidth - 28, 28, 2, 2, "F");
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, metaY, pageWidth - 28, 28, 2, 2, "S");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(campaign.name, 19, metaY + 7);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);

  const col1X = 19;
  const col2X = 75;
  const col3X = 135;

  doc.text(`Country: ${campaign.country}`, col1X, metaY + 14);
  doc.text(`Version: ${campaign.versionName || "Standard"}`, col1X, metaY + 20);

  doc.text(`Status: ${campaign.status}`, col2X, metaY + 14);
  doc.text(`Auditor: ${qaPerson}`, col2X, metaY + 20);

  doc.text(`Audit Date: ${currentDate}`, col3X, metaY + 14);
  doc.text(`Progress: ${prog.completed}/${prog.total} Items (${prog.percent}%)`, col3X, metaY + 20);

  // Status Summary Badges
  const statsY = metaY + 32;
  const badgeW = (pageWidth - 28 - 9) / 4;
  const statsList = [
    { label: "Total Checkpoints", val: `${prog.total}`, color: [43, 97, 214] as [number, number, number] },
    { label: "Passed / Verified", val: `${prog.checked}`, color: [16, 185, 129] as [number, number, number] },
    { label: "Marked N/A", val: `${prog.na}`, color: [100, 116, 139] as [number, number, number] },
    { label: "Pending Left", val: `${prog.pending}`, color: [217, 119, 6] as [number, number, number] }
  ];

  statsList.forEach((stat, idx) => {
    const bx = 14 + idx * (badgeW + 3);
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(bx, statsY, badgeW, 11, 1.5, 1.5, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...stat.color);
    doc.text(stat.val, bx + badgeW / 2, statsY + 5.5, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(71, 85, 105);
    doc.text(stat.label, bx + badgeW / 2, statsY + 9, { align: "center" });
  });

  // Checklist Items Table
  const tableHead = [["Stage", "Checkpoint Requirement", "Status", "Auditor Notes & Parameter Input"]];
  const tableBody = prog.items.map((entry, index) => {
    const stageNum = entry.item.stage ?? Math.floor(index / 4) + 1;
    const stageLabel = `Stage ${stageNum}`;
    return [
      stageLabel,
      entry.item.text,
      entry.status === "Checked" ? "PASSED" : entry.status === "N/A" ? "N/A" : "PENDING",
      entry.notes || "-"
    ];
  });

  autoTable(doc, {
    startY: statsY + 15,
    head: tableHead,
    body: tableBody,
    margin: { left: 14, right: 14, bottom: 20 },
    theme: "striped",
    headStyles: {
      fillColor: [30, 58, 138],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
      cellPadding: 2.5
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: [30, 41, 59],
      cellPadding: 2.2
    },
    columnStyles: {
      0: { cellWidth: 22, fontStyle: "bold" },
      1: { cellWidth: 90 },
      2: { cellWidth: 22, halign: "center", fontStyle: "bold" },
      3: { cellWidth: 48, fontSize: 7, textColor: [71, 85, 105] }
    },
    didDrawCell: (data) => {
      if (data.section === "body" && data.column.index === 2) {
        const val = String(data.cell.raw);
        if (val === "PASSED") {
          data.cell.styles.textColor = [16, 185, 129];
        } else if (val === "N/A") {
          data.cell.styles.textColor = [100, 116, 139];
        } else {
          data.cell.styles.textColor = [217, 119, 6];
        }
      }
    }
  });

  // Footer on all pages
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);

    doc.text(
      "HP Inc. & Zeta Global APJ Quality Assurance Platform • Official Inspection Certificate",
      14,
      pageHeight - 8
    );
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - 14, pageHeight - 8, { align: "right" });
  }

  const safeName = (campaign.name || "Campaign").replace(/[^a-zA-Z0-9_-]/g, "_");
  const filename = customFilename || `QA_Inspection_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}
