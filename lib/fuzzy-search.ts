import { getAllCampaigns, CampaignRecord } from "@/lib/campaign-storage";
import { loadAppUsersMetadata, getCachedAppUsers, resolveUserFullName, AppUserMeta } from "@/lib/userNames";

export interface SearchResultItem {
  id: string;
  type: "campaign" | "user" | "setting";
  title: string;
  subtitle: string;
  badge?: string;
  badgeColor?: "emerald" | "blue" | "rose" | "amber" | "purple" | "slate" | "indigo";
  icon: string;
  url: string;
  score: number;
  tags?: string[];
  meta?: Record<string, any>;
}

export interface SettingsPageDefinition {
  id: string;
  title: string;
  subtitle: string;
  url: string;
  icon: string;
  badge?: string;
  badgeColor?: "emerald" | "blue" | "rose" | "amber" | "purple" | "slate" | "indigo";
  keywords: string[];
}

export const SETTINGS_PAGES: SettingsPageDefinition[] = [
  {
    id: "settings-credentials",
    title: "API & Database Credentials",
    subtitle: "Gemini AI API Key, Supabase URLs, Service Role Keys, and secure secrets",
    url: "/settings?tab=credentials",
    icon: "Key",
    badge: "Settings",
    badgeColor: "purple",
    keywords: ["api", "credentials", "gemini", "ai", "database", "supabase", "service role", "secrets", "keys", "token", "env"]
  },
  {
    id: "settings-smtp",
    title: "Gmail SMTP & Email Service",
    subtitle: "Nodemailer Gmail configuration, QA approval dispatcher & SMTP test diagnostics",
    url: "/settings?tab=credentials",
    icon: "Mail",
    badge: "Settings",
    badgeColor: "blue",
    keywords: ["email", "smtp", "gmail", "nodemailer", "dispatch", "test email", "diagnostics", "approval email", "credentials"]
  },
  {
    id: "settings-general",
    title: "Branding & General Settings",
    subtitle: "Enterprise logos, Quick Login toggle, organization preferences",
    url: "/settings?tab=general",
    icon: "Sliders",
    badge: "Settings",
    badgeColor: "slate",
    keywords: ["general", "branding", "logo", "quick login", "theme", "header", "settings", "zeta", "hp"]
  },
  {
    id: "settings-data-management",
    title: "Data Management & Database Backup",
    subtitle: "Trigger manual database JSON backups, snapshots, and restore feature",
    url: "/settings?tab=data-management",
    icon: "Database",
    badge: "Admin",
    badgeColor: "amber",
    keywords: ["data management", "backup", "database backup", "restore", "export", "import", "json", "manual backup", "disaster recovery", "portability", "snapshot", "migration"]
  },
  {
    id: "page-users",
    title: "User Management",
    subtitle: "Manage team members, assign admin permissions, send user invitations",
    url: "/users",
    icon: "Users",
    badge: "Admin",
    badgeColor: "purple",
    keywords: ["users", "team", "members", "roles", "admin", "invite", "permissions", "user management", "accounts"]
  },
  {
    id: "page-checklists",
    title: "QA Checkpoints & Standards",
    subtitle: "22 automated & semi-automated audit criteria, category definitions & rules",
    url: "/checklists",
    icon: "CheckSquare",
    badge: "Standards",
    badgeColor: "indigo",
    keywords: ["checklists", "standards", "checkpoints", "22 checkpoints", "qa rules", "criteria", "audit standards", "inspection"]
  },
  {
    id: "page-reports",
    title: "Executive Reports & Audit Analytics",
    subtitle: "Download Executive PDF reports, CSV audit exports, and auditor workload metrics",
    url: "/reports",
    icon: "BarChart2",
    badge: "Reports",
    badgeColor: "emerald",
    keywords: ["reports", "analytics", "export pdf", "export csv", "audit certificate", "metrics", "kpi", "performance", "auditor"]
  },
  {
    id: "page-agents",
    title: "AI Agent Studio",
    subtitle: "AI QA audit assistants, persona prompts, automated review engines",
    url: "/agents",
    icon: "Sparkles",
    badge: "AI Studio",
    badgeColor: "indigo",
    keywords: ["agents", "ai", "ai agent studio", "prompts", "assistant", "gemini", "automated qa", "chat"]
  },
  {
    id: "page-recycle-bin",
    title: "Recycle Bin & Trash",
    subtitle: "Inspect soft-deleted campaigns, restore archived audits or permanently remove",
    url: "/recycle-bin",
    icon: "Trash2",
    badge: "Archive",
    badgeColor: "rose",
    keywords: ["trash", "recycle bin", "deleted", "restore", "permanent delete", "soft delete", "archive"]
  },
  {
    id: "page-profile",
    title: "My Profile & Account",
    subtitle: "Personal display name, email, team assignment, and session security",
    url: "/profile",
    icon: "User",
    badge: "Account",
    badgeColor: "slate",
    keywords: ["profile", "account", "name", "email", "password", "my account", "avatar", "team"]
  },
  {
    id: "page-dashboard",
    title: "Dashboard Overview",
    subtitle: "Executive KPI metrics, recent campaign audit throughput, and activity stream",
    url: "/",
    icon: "LayoutDashboard",
    badge: "Navigation",
    badgeColor: "slate",
    keywords: ["dashboard", "home", "overview", "kpi", "stats", "recent audits", "throughput"]
  },
  {
    id: "page-campaigns",
    title: "All Campaigns & Folders",
    subtitle: "Explore campaign folders, audit statuses, approved & in-progress campaigns",
    url: "/campaigns",
    icon: "FileText",
    badge: "Navigation",
    badgeColor: "blue",
    keywords: ["campaigns", "folders", "audits", "all campaigns", "status", "approved", "in progress", "failed"]
  },
  {
    id: "page-new-campaign",
    title: "New Campaign Setup",
    subtitle: "Create a new QA inspection campaign, upload HTML templates and Outlook MSG",
    url: "/campaigns/new",
    icon: "PlusCircle",
    badge: "Action",
    badgeColor: "emerald",
    keywords: ["new campaign", "create campaign", "upload html", "upload msg", "start audit", "setup"]
  }
];

/**
 * Calculates Levenshtein distance between two strings for typo tolerance
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const row = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      const val = a[i - 1] === b[j - 1] ? row[j - 1] : Math.min(row[j - 1], prev, row[j]) + 1;
      row[j - 1] = prev;
      prev = val;
    }
    row[b.length] = prev;
  }

  return row[b.length];
}

/**
 * Fuzzy matching scoring algorithm
 * Computes a relevance score from 0 (no match) to 1000+ (exact match)
 */
export function fuzzyMatchScore(query: string, target: string, extraKeywords?: string[]): number {
  if (!query || !target) return 0;
  const q = query.trim().toLowerCase();
  const t = target.trim().toLowerCase();

  // 1. Exact full match
  if (q === t) return 1000;

  // 2. Prefix match
  if (t.startsWith(q)) {
    return 600 + Math.round((q.length / t.length) * 100);
  }

  // 3. Substring match
  const substrIdx = t.indexOf(q);
  if (substrIdx !== -1) {
    const isWordStart = substrIdx === 0 || /[\s\-_/.,:;()[\\]]/.test(t[substrIdx - 1]);
    const wordBonus = isWordStart ? 150 : 0;
    const positionPenalty = Math.min(100, substrIdx * 4);
    return 400 + wordBonus - positionPenalty;
  }

  // 4. Word boundary match / Acronym match
  const words = t.split(/[\s\-_/.,:;()[\\]]+/).filter(Boolean);
  const initials = words.map(w => w[0]).join("");
  if (initials.startsWith(q) || initials.includes(q)) {
    return 300 + Math.round((q.length / initials.length) * 100);
  }

  // 5. Check if any word starts with query
  for (const word of words) {
    if (word.startsWith(q)) {
      return 350 + Math.round((q.length / word.length) * 50);
    }
  }

  // 6. Character sequence matching (fuzzy subsequence)
  let qIdx = 0;
  let tIdx = 0;
  let consecutive = 0;
  let maxConsecutive = 0;
  let gapSum = 0;
  let lastMatchIdx = -1;

  while (qIdx < q.length && tIdx < t.length) {
    if (q[qIdx] === t[tIdx]) {
      consecutive++;
      if (consecutive > maxConsecutive) maxConsecutive = consecutive;
      if (lastMatchIdx !== -1) {
        gapSum += (tIdx - lastMatchIdx - 1);
      }
      lastMatchIdx = tIdx;
      qIdx++;
    } else {
      consecutive = 0;
    }
    tIdx++;
  }

  if (qIdx === q.length) {
    const densityScore = Math.max(0, 150 - gapSum * 3);
    const consecutiveBonus = maxConsecutive * 20;
    const completeness = Math.round((q.length / t.length) * 50);
    return Math.max(80, densityScore + consecutiveBonus + completeness);
  }

  // 7. Check extra keywords if provided
  if (extraKeywords && extraKeywords.length > 0) {
    for (const kw of extraKeywords) {
      const kwLower = kw.toLowerCase();
      if (kwLower === q) return 500;
      if (kwLower.startsWith(q)) return 380;
      if (kwLower.includes(q)) return 280;
    }
  }

  // 8. Typo tolerance (Levenshtein distance for words >= 3 chars)
  if (q.length >= 3) {
    for (const word of words) {
      if (Math.abs(word.length - q.length) <= 2) {
        const dist = levenshteinDistance(q, word);
        if (dist === 1) return 140;
        if (dist === 2 && q.length >= 5) return 90;
      }
    }
  }

  return 0;
}

/**
 * Searches across campaigns, users, and settings pages using fuzzy matching
 */
export async function performGlobalSearch(
  query: string,
  filterType: "all" | "campaigns" | "users" | "settings" = "all"
): Promise<SearchResultItem[]> {
  const cleanQuery = query.trim().toLowerCase();
  const results: SearchResultItem[] = [];

  // Parallel data loading
  const [campaigns, users] = await Promise.all([
    getAllCampaigns().catch(() => [] as CampaignRecord[]),
    loadAppUsersMetadata().catch(() => getCachedAppUsers())
  ]);

  // 1. Search Settings & Navigation Pages
  if (filterType === "all" || filterType === "settings") {
    for (const page of SETTINGS_PAGES) {
      if (!cleanQuery) {
        // If query is empty, return default high-value suggestions
        results.push({
          id: page.id,
          type: "setting",
          title: page.title,
          subtitle: page.subtitle,
          badge: page.badge,
          badgeColor: page.badgeColor,
          icon: page.icon,
          url: page.url,
          score: 50,
          tags: page.keywords
        });
        continue;
      }

      const titleScore = fuzzyMatchScore(cleanQuery, page.title);
      const subScore = fuzzyMatchScore(cleanQuery, page.subtitle);
      const kwScore = page.keywords.reduce((max, kw) => Math.max(max, fuzzyMatchScore(cleanQuery, kw)), 0);

      const maxScore = Math.max(titleScore * 1.2, subScore * 0.8, kwScore);
      if (maxScore > 60) {
        results.push({
          id: page.id,
          type: "setting",
          title: page.title,
          subtitle: page.subtitle,
          badge: page.badge,
          badgeColor: page.badgeColor,
          icon: page.icon,
          url: page.url,
          score: maxScore,
          tags: page.keywords
        });
      }
    }
  }

  // 2. Search Campaigns
  if (filterType === "all" || filterType === "campaigns") {
    for (const c of campaigns) {
      if (c.is_deleted) continue;

      const cName = c.name || "Untitled Campaign";
      const cCountry = c.country || "";
      const cVersion = c.versionName || c.version_name || "";
      const cTeam = c.team || "";
      const cStatus = c.status || "In Progress";
      const cAuditor = resolveUserFullName(c.assignedQa || c.createdBy || c.userEmail, "");
      const cSubject = c.outlookSubject || "";

      if (!cleanQuery) {
        continue; // Only show campaigns when search query is typed
      }

      const nameScore = fuzzyMatchScore(cleanQuery, cName);
      const countryScore = cCountry ? fuzzyMatchScore(cleanQuery, cCountry) : 0;
      const versionScore = cVersion ? fuzzyMatchScore(cleanQuery, cVersion) : 0;
      const auditorScore = cAuditor ? fuzzyMatchScore(cleanQuery, cAuditor) : 0;
      const subjectScore = cSubject ? fuzzyMatchScore(cleanQuery, cSubject) : 0;
      const idScore = String(c.id).toLowerCase().includes(cleanQuery) ? 400 : 0;

      const maxScore = Math.max(
        nameScore * 1.2,
        countryScore * 1.1,
        versionScore,
        auditorScore * 0.9,
        subjectScore * 0.8,
        idScore
      );

      if (maxScore > 60) {
        const statusNorm = cStatus.toLowerCase();
        let badgeColor: "emerald" | "blue" | "rose" | "slate" = "blue";
        if (["approved", "completed", "complete"].includes(statusNorm)) badgeColor = "emerald";
        else if (["failed", "rejected"].includes(statusNorm)) badgeColor = "rose";

        const subtitleParts: string[] = [];
        if (cCountry) subtitleParts.push(cCountry.toUpperCase());
        if (cVersion) subtitleParts.push(cVersion);
        if (cAuditor) subtitleParts.push(`Auditor: ${cAuditor}`);
        if (!subtitleParts.length && cTeam) subtitleParts.push(cTeam);

        results.push({
          id: `campaign-${c.id}`,
          type: "campaign",
          title: cName,
          subtitle: subtitleParts.join(" • ") || `Campaign #${String(c.id).slice(0, 8)}`,
          badge: cStatus,
          badgeColor,
          icon: "FileText",
          url: `/campaigns?search=${encodeURIComponent(cName)}`,
          score: maxScore,
          meta: {
            campaignId: c.id,
            country: c.country,
            status: c.status
          }
        });
      }
    }
  }

  // 3. Search Users
  if (filterType === "all" || filterType === "users") {
    for (const u of users) {
      const uName = resolveUserFullName(u.name || u.email, "");
      const uEmail = u.email || "";
      const uRole = u.role || "user";
      const uTeam = u.team || "Zeta QA";

      if (!cleanQuery) {
        continue;
      }

      const nameScore = fuzzyMatchScore(cleanQuery, uName);
      const emailScore = fuzzyMatchScore(cleanQuery, uEmail);
      const teamScore = fuzzyMatchScore(cleanQuery, uTeam);
      const roleScore = fuzzyMatchScore(cleanQuery, uRole);

      const maxScore = Math.max(nameScore * 1.3, emailScore * 1.1, teamScore * 0.8, roleScore * 0.7);

      if (maxScore > 60) {
        results.push({
          id: `user-${u.id || u.email}`,
          type: "user",
          title: uName,
          subtitle: `${uEmail} • ${uTeam}`,
          badge: uRole === "admin" ? "Admin" : "QA Reviewer",
          badgeColor: uRole === "admin" ? "purple" : "slate",
          icon: "User",
          url: `/users?q=${encodeURIComponent(uEmail || uName)}`,
          score: maxScore,
          meta: {
            email: uEmail,
            role: uRole,
            team: uTeam
          }
        });
      }
    }
  }

  // Sort descending by score
  results.sort((a, b) => b.score - a.score);

  // Return top 25 results
  return results.slice(0, 25);
}
