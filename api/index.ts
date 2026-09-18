import app from "../server.ts";

export default function handler(req: any, res: any) {
  // If req.url was rewritten to /api/index.ts or is missing, recover the true incoming request URL
  const currentUrl = req.url || "";
  const isGenericPath = !currentUrl || currentUrl === "/api" || currentUrl === "/api/" || currentUrl.startsWith("/api/index");

  if (isGenericPath) {
    const rawCandidate =
      req.headers["x-forwarded-uri"] ||
      req.headers["x-original-url"] ||
      req.headers["x-invoke-path"] ||
      req.headers["x-vercel-sc-path"] ||
      "";

    if (
      rawCandidate &&
      typeof rawCandidate === "string" &&
      rawCandidate.startsWith("/api") &&
      !rawCandidate.includes("index.ts") &&
      !rawCandidate.includes("index.js")
    ) {
      req.url = rawCandidate;
    }
  }

  return app(req, res);
}


