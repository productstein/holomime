# Cline MCP Marketplace Submission

Submit this as a GitHub Issue at: https://github.com/cline/mcp-marketplace/issues/new?template=mcp-server-submission.yml

## Fields

**GitHub Repository URL:**
https://github.com/productstein/holomime

**Logo Image:**
Need a 400x400 PNG. Current logo is 256x256 at `site/public/logo-icon.png` — resize to 400x400 before uploading.

**Installation Testing:**
- [x] Tested that Cline can set up using README.md
- [x] Server is stable and ready for public use

**Additional Information:**

holomime is a behavioral therapy tool for AI agents. The MCP server exposes 6 tools for real-time behavioral monitoring:

| Tool | Description |
|------|-------------|
| `holomime_diagnose` | Detect 8 behavioral patterns (sycophancy, over-apologizing, hedging, boundary violations, error spirals, sentiment skew, formality issues, retrieval quality) |
| `holomime_assess` | Full Big Five personality alignment assessment |
| `holomime_profile` | Human-readable personality summary |
| `holomime_autopilot` | Auto-triggered alignment (diagnose → therapy) |
| `holomime_self_audit` | Mid-conversation behavioral self-check |
| `holomime_observe` | Record behavioral self-observation to persistent memory |

**Installation:** `npx holomime-mcp` (stdio transport, zero config)

**Website:** https://holomime.com
**npm:** https://www.npmjs.com/package/holomime
