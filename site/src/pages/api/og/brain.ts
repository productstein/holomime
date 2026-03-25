import type { APIRoute } from "astro";

/**
 * GET /api/og/brain — Dynamic OG image for brain snapshots.
 * Generates an SVG that renders as a rich card showing health, grade, agent, and patterns.
 * Returns image/svg+xml — works on Twitter, Slack, LinkedIn, Discord.
 *
 * Query params: h (health), g (grade), a (agent), p (comma-separated patterns)
 */
export const GET: APIRoute = async ({ url }) => {
  const health = Math.max(0, Math.min(100, parseInt(url.searchParams.get("h") || "0", 10)));
  const grade = (url.searchParams.get("g") || "?").slice(0, 2);
  const agentRaw = (url.searchParams.get("a") || "unknown").slice(0, 50);
  const patternsRaw = (url.searchParams.get("p") || "").slice(0, 500);

  const AGENT_NAMES: Record<string, string> = {
    "claude-code": "Claude Code",
    cline: "Cline",
    openclaw: "OpenClaw",
    cursor: "Cursor",
    codex: "Codex CLI",
    manual: "Custom Agent",
  };
  const agentName = AGENT_NAMES[agentRaw] || agentRaw;

  const patterns = patternsRaw ? patternsRaw.split(",").map((p) => p.trim().slice(0, 50)).filter(Boolean).slice(0, 10) : [];

  // Health color
  const healthColor = health >= 85 ? "#22c55e" : health >= 70 ? "#f59e0b" : health >= 50 ? "#f97316" : "#f97066";
  const healthGlow = health >= 85 ? "rgba(34,197,94,0.3)" : health >= 70 ? "rgba(245,158,11,0.3)" : health >= 50 ? "rgba(249,115,22,0.3)" : "rgba(249,112,102,0.3)";

  // Pattern tags SVG
  let patternsSvg = "";
  let px = 40;
  for (const pattern of patterns.slice(0, 4)) {
    const textWidth = pattern.length * 7.5 + 20;
    patternsSvg += `
      <rect x="${px}" y="370" width="${textWidth}" height="26" rx="13" fill="rgba(139,92,246,0.15)" />
      <text x="${px + textWidth / 2}" y="387" text-anchor="middle" fill="#a78bfa" font-size="11" font-weight="600" font-family="Inter, system-ui, sans-serif">${escapeXml(pattern)}</text>
    `;
    px += textWidth + 8;
  }
  if (patterns.length > 4) {
    patternsSvg += `<text x="${px + 4}" y="387" fill="rgba(255,255,255,0.3)" font-size="11" font-family="Inter, system-ui, sans-serif">+${patterns.length - 4} more</text>`;
  }

  // Brain orbs (decorative)
  const orbs = [
    { cx: 880, cy: 180, r: 4, color: "#06b6d4", delay: 0 },
    { cx: 920, cy: 220, r: 3, color: "#8b5cf6", delay: 0.5 },
    { cx: 860, cy: 250, r: 5, color: "#fb7185", delay: 1 },
    { cx: 940, cy: 160, r: 3, color: "#14b8a6", delay: 1.5 },
    { cx: 900, cy: 280, r: 4, color: "#fbbf24", delay: 0.3 },
    { cx: 850, cy: 200, r: 3, color: "#ec4899", delay: 0.8 },
    { cx: 960, cy: 240, r: 4, color: "#3b82f6", delay: 1.2 },
    { cx: 870, cy: 160, r: 3, color: "#22c55e", delay: 0.6 },
  ];

  const orbsSvg = orbs.map((o) => `
    <circle cx="${o.cx}" cy="${o.cy}" r="${o.r}" fill="${o.color}" opacity="0.7">
      <animate attributeName="opacity" values="0;0.9;0" dur="3s" begin="${o.delay}s" repeatCount="indefinite" />
    </circle>
    <circle cx="${o.cx}" cy="${o.cy}" r="${o.r * 3}" fill="${o.color}" opacity="0.15">
      <animate attributeName="opacity" values="0;0.2;0" dur="3s" begin="${o.delay}s" repeatCount="indefinite" />
    </circle>
  `).join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="glow" cx="75%" cy="40%" r="50%">
      <stop offset="0%" stop-color="${healthGlow}" />
      <stop offset="100%" stop-color="transparent" />
    </radialGradient>
    <radialGradient id="bgGlow" cx="50%" cy="50%" r="60%">
      <stop offset="0%" stop-color="rgba(139,92,246,0.08)" />
      <stop offset="100%" stop-color="transparent" />
    </radialGradient>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="#110d1f" />
  <rect width="1200" height="630" fill="url(#bgGlow)" />
  <rect width="1200" height="630" fill="url(#glow)" />

  <!-- Brain area glow -->
  <circle cx="900" cy="220" r="120" fill="${healthColor}" opacity="0.06" />
  <circle cx="900" cy="220" r="80" fill="${healthColor}" opacity="0.1" />

  <!-- Decorative orbs -->
  ${orbsSvg}

  <!-- Brain circle (stylized) -->
  <circle cx="900" cy="220" r="100" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1" />
  <circle cx="900" cy="220" r="60" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="1" />

  <!-- holomime brand -->
  <text x="40" y="52" fill="rgba(255,255,255,0.4)" font-size="14" font-weight="600" font-family="Inter, system-ui, sans-serif" letter-spacing="0.05em">HOLOMIME BRAIN</text>

  <!-- Agent name -->
  <text x="40" y="140" fill="#e8e4f0" font-size="32" font-weight="800" font-family="Inter, system-ui, sans-serif">${escapeXml(agentName)}'s Brain</text>

  <!-- Health score -->
  <text x="40" y="220" fill="${healthColor}" font-size="72" font-weight="800" font-family="Inter, system-ui, sans-serif">${health}</text>
  <text x="${health >= 100 ? 200 : health >= 10 ? 175 : 130}" y="220" fill="rgba(255,255,255,0.4)" font-size="28" font-weight="600" font-family="Inter, system-ui, sans-serif">/ 100</text>

  <!-- Grade -->
  <text x="40" y="270" fill="rgba(255,255,255,0.5)" font-size="20" font-weight="600" font-family="Inter, system-ui, sans-serif">Grade ${escapeXml(grade)}</text>

  <!-- Health bar -->
  <rect x="40" y="300" width="400" height="6" rx="3" fill="rgba(255,255,255,0.06)" />
  <rect x="40" y="300" width="${Math.max(4, health * 4)}" height="6" rx="3" fill="${healthColor}" />

  <!-- Patterns label -->
  ${patterns.length > 0
    ? `<text x="40" y="355" fill="rgba(255,255,255,0.35)" font-size="11" font-weight="600" font-family="Inter, system-ui, sans-serif" letter-spacing="0.05em">DETECTED PATTERNS</text>`
    : `<text x="40" y="355" fill="rgba(34,197,94,0.6)" font-size="13" font-weight="600" font-family="Inter, system-ui, sans-serif">No behavioral patterns detected</text>`
  }

  <!-- Pattern tags -->
  ${patternsSvg}

  <!-- CTA -->
  <text x="40" y="560" fill="rgba(255,255,255,0.25)" font-size="14" font-family="'SF Mono', monospace">npx holomime brain</text>
  <text x="40" y="590" fill="rgba(255,255,255,0.15)" font-size="12" font-family="Inter, system-ui, sans-serif">holomime.com/brain</text>

  <!-- Border -->
  <rect x="0" y="0" width="1200" height="630" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1" />
</svg>`;

  return new Response(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
};

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
