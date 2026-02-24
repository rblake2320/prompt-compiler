# 6-Layer Prompt Compiler

Decompose any task into the 6 AI engineering disciplines (Prompt · Context · Intent · Flow · Eval · Tool), then synthesize a single production-grade system prompt.

![License](https://img.shields.io/badge/license-MIT-blue)

## Quick Start

```bash
git clone https://github.com/rblake2320/prompt-compiler.git
cd prompt-compiler
npm install
cp .env.example .env   # Add your ANTHROPIC_API_KEY
npm run dev
```

Open `http://localhost:5173`

## Features

- **Two-phase compilation** — structured JSON decomposition → plain-text synthesis (no JSON corruption)
- **6-layer breakdown** — expandable cards for each AI engineering discipline
- **History panel** — auto-saves every compilation with browse, reload, export (.md), and delete
- **Copy to clipboard** — one-click copy of the compiled prompt
- **Dark mode** — full dark UI optimized for readability

## The 6-Layer Model

| # | Layer | Core Question |
|---|-------|---------------|
| 1 | **Prompt Engineering** | How should the instruction be phrased? |
| 2 | **Context Engineering** | What must the model know right now? |
| 3 | **Intent Engineering** | What outcome is desired and why? |
| 4 | **Flow Engineering** | How should this break into reliable steps? |
| 5 | **Evaluation Engineering** | How do we know it's working correctly? |
| 6 | **Tool/Integration Engineering** | What external actions or data are needed? |

## Architecture

```
┌─────────────────────────────────────┐
│  React Frontend (Vite + Tailwind)   │
│  - Input capture                    │
│  - 6-layer card grid                │
│  - History panel (localStorage)     │
│  - Compiled prompt viewer + copy    │
└──────────────┬──────────────────────┘
               │ Two-phase API calls
┌──────────────▼──────────────────────┐
│  Anthropic API (claude-sonnet-4)    │
│  Phase 1: Decompose → JSON          │
│  Phase 2: Synthesize → plain text   │
└─────────────────────────────────────┘
```

## API Key Setup

| Environment | How |
|---|---|
| **Claude.ai Artifact** | No key needed — built-in proxy |
| **Local dev** | `.env` file → Vite proxy injects server-side |
| **Cloudflare Pages** | `wrangler secret put ANTHROPIC_API_KEY` |
| **Vercel** | `vercel env add ANTHROPIC_API_KEY` |

> ⚠️ Never ship API keys in frontend code. All deployments route through a server-side proxy.

## Deploy

**Vercel:**
```bash
vercel env add ANTHROPIC_API_KEY
vercel --prod
```

**Cloudflare Pages:**
```bash
wrangler secret put ANTHROPIC_API_KEY
npm run build
wrangler pages deploy dist
```

## Project Structure

```
prompt-compiler/
├── src/
│   ├── App.jsx
│   ├── main.jsx
│   ├── index.css
│   ├── components/
│   │   └── PromptCompiler.jsx   # Main UI + history
│   └── lib/
│       ├── claude.js             # API client + JSON repair
│       └── prompts.js            # System prompts + layer metadata
├── api/
│   └── compile.js                # Serverless proxy (Vercel/CF)
├── index.html
├── vite.config.js
├── tailwind.config.js
├── package.json
└── .env.example
```

## License

MIT
