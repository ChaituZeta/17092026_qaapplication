import app from "../server.ts";

export default function handler(req: any, res: any) {
  // If Vercel rewrote the request URL to /api/index.ts or /api, restore the actual original path
  const matchedPath = req.headers["x-matched-path"] || 
                      req.headers["x-forwarded-uri"] || 
                      req.headers["x-vercel-matched-path"] ||
                      req.headers["x-original-url"];

  if (matchedPath && typeof matchedPath === "string" && matchedPath.startsWith("/api")) {
    req.url = matchedPath;
  }

  return app(req, res);
}

