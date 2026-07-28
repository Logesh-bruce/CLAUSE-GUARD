# ClauseGuard 🛡️
### AI-Powered Contract Governance Layer for Financial Agents

ClauseGuard is a checkpoint between "agent decides to act" and "agent commits to a contract." It reads a real, messy contract, flags risky clauses using TF-IDF similarity, explains each risk in plain English via Groq LLM, and drafts a negotiation email you could actually send.

---

## Setup (< 5 minutes)

### 1. Prerequisites
- Node.js 18+ ([download](https://nodejs.org))
- A Groq API key ([get one free](https://console.groq.com/keys))

### 2. Install
```bash
cd ClauseGuard
npm install
```

### 3. Configure
```bash
# Copy the example and add your key
copy .env.example .env
```

Edit `.env`:
```
GROQ_API_KEY=gsk_your_key_here
PORT=3000
```

### 4. Start
```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000).

---

## How to Use

1. **Upload** a PDF, DOCX, or TXT contract — or paste the text directly
2. **Analyze** — ClauseGuard splits the contract into clauses and runs TF-IDF risk detection
3. **Review** — Each flagged clause shows:
   - Risk level (Critical / High / Medium / Low)
   - Plain-language explanation of the risk
   - AI-drafted replacement clause you can edit
4. **Accept** revisions you want to include in the negotiation
5. **Export** — Get a ready-to-send negotiation email

---

## Extending the Clause Library

The pattern library lives in `src/patterns/`. Each JSON file is a contract type.

**To add a new contract type** (e.g., SaaS):

1. Create `src/patterns/saas.json`
2. Follow this schema:

```json
{
  "contractType": "saas",
  "description": "Patterns for SaaS subscription agreements",
  "patterns": [
    {
      "id": "saas_001",
      "category": "Price Increase",
      "riskLevel": "medium",
      "keywords": ["price increase", "fee adjustment", "rate change", "annual increase"],
      "description": "Vendor can increase price annually without consent.",
      "exampleClause": "Vendor may increase subscription fees annually by up to 15% with 30 days notice."
    }
  ]
}
```

**Risk levels**: `low` | `medium` | `high` | `critical`

No code changes needed — the pattern loader auto-discovers all JSON files in `src/patterns/`.

---

## Architecture

```
ClauseGuard/
├── src/
│   ├── server.js              # Express app (port 3000)
│   ├── routes/
│   │   ├── analyze.js         # POST /api/analyze
│   │   └── export.js          # POST /api/export
│   ├── services/
│   │   ├── ingestion.js       # PDF/DOCX/TXT parsing + clause splitting
│   │   ├── riskDetector.js    # TF-IDF cosine similarity engine
│   │   └── llmReasoner.js     # Groq API with p-limit concurrency
│   ├── patterns/
│   │   ├── index.js           # Auto-discovering pattern loader
│   │   ├── financial.json     # 10 patterns: credit/loan/payment
│   │   ├── employment.json    # 8 patterns: non-compete/IP/termination
│   │   ├── rental.json        # 7 patterns: deposits/liability/entry
│   │   └── b2b.json           # 10 patterns: indemnification/IP/SLA
│   └── utils/errors.js        # Typed errors for graceful degradation
└── public/
    ├── index.html             # Single-page app
    ├── styles.css             # Dark glassmorphism design
    └── app.js                 # Frontend logic
```

### Pipeline
```
Upload/Paste → Parse (pdf-parse / mammoth) → Split Clauses →
TF-IDF Risk Detection (natural) → [Flagged only] Groq LLM Reasoning →
Review UI → Accept/Edit → Export Negotiation Email
```

### Concurrency
Groq calls are limited to **5 concurrent requests** via `p-limit` to avoid rate limiting on large contracts. Each failed LLM call degrades gracefully — the clause still shows with the TF-IDF detection result.

### Processing Cap
Handles up to **60 clauses per document**. Additional clauses are truncated with a warning.

---

## Supported File Types
| Format | Library |
|--------|---------|
| PDF | `pdf-parse` |
| DOCX | `mammoth` |
| TXT | Native Node.js |
| Pasted text | Direct input |

---

## Error States
| Scenario | Behavior |
|----------|----------|
| Empty file | Clear error: "document appears empty" |
| Unsupported format | Clear error: "upload PDF, DOCX, or TXT" |
| Groq API failure | Risk flags shown; AI explanations marked unavailable per-clause |
| Rate limit (429) | 3-attempt exponential backoff before graceful failure |
| Malformed JSON from LLM | Extraction fallback + graceful per-clause failure |

---

## Development

```bash
# Dev mode with auto-restart (Node 18+)
npm run dev
```

---

*Built with: Express · natural (TF-IDF) · groq-sdk · pdf-parse · mammoth · p-limit*
