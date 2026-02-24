# 6-Layer Prompt Compiler

Decompose any task into the 6 AI engineering disciplines (Prompt · Context · Intent · Flow · Eval · Tool), then synthesize a single production-grade system prompt.

## Quick Start
```bash
npm install
cp .env.example .env   # Add your ANTHROPIC_API_KEY
npm run dev
```

## The 6-Layer Model

| # | Layer | Core Question |
|---|-------|--------------|
| 1 | Prompt Engineering | How should the instruction be phrased? |
| 2 | Context Engineering | What must the model know right now? |
| 3 | Intent Engineering | What outcome is desired and why? |
| 4 | Flow Engineering | How should this break into reliable steps? |
| 5 | Evaluation Engineering | How do we know it's working correctly? |
| 6 | Tool/Integration Engineering | What external actions or data are needed? |

## Architecture

Two-phase API pipeline:
1. **Decompose** — Claude returns structured JSON for all 6 layers
2. **Synthesize** — Claude returns plain-text production prompt (no JSON corruption risk)

## Deploy

**Vercel:** `vercel env add ANTHROPIC_API_KEY && vercel --prod`
**Cloudflare:** `wrangler secret put ANTHROPIC_API_KEY && npm run build && wrangler pages deploy dist`

## License
MIT
