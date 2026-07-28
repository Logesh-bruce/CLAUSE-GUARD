# ClauseGuard

> **A Governance Layer for Autonomous Financial Agents**

Autonomous financial agents are beginning to sign up for cards, negotiate loan terms, and accept service contracts on behalf of users—often faster than any human can review the terms. **ClauseGuard** is the essential checkpoint between "agent decides to act" and "agent commits to a contract."

ClauseGuard reads contracts, flags clauses that carry real risk, and drafts counter-terms needed to fix them, ensuring AI autonomy is bounded by safe, reviewable guardrails.

---

## 🏗️ Architecture

ClauseGuard is built on a **Hybrid Architecture** combining deterministic symbolic checks with LLM reasoning, ensuring zero-width character evasion, semantic rephrasings, and prompt-injection attacks fail.

1. **Ingestion Layer:** Parses PDF, DOCX, and plain text using `pdf-parse` and `mammoth`, splitting documents via a multi-pass heuristic regex.
2. **Sanitization:** Strips zero-width unicode characters and flags suspicious prompt-injection language (e.g., "SYSTEM OVERRIDE").
3. **Deterministic Heuristics:**
   - **Signature Detection:** Rapidly scans for missing signature blocks or unsigned fields via regex.
   - **Key Dates Extraction:** Identifies renewal deadlines, cure periods, and notice requirements instantly.
4. **TF-IDF Pre-filter:** Filters clauses using cosine similarity against a library of 35 known risk patterns (financial, employment, rental, B2B).
5. **LLM Reasoning (Llama 3.1):** Flagged clauses are sent to Groq for deep semantic reasoning, generating risk explanations and suggested counter-terms.
6. **Consistency Checker:** A cross-check module that flags a `SuspiciousDisagreement` if the LLM marks a known risky clause as "safe," catching AI hallucinations and prompt injections.

---

## 📊 Adversarial Robustness Experiment

We ran a benchmark comparing a pure **LLM-Only Pipeline** against our **Hybrid Pipeline** using 15 adversarial contracts (crafted with prompt injection and unicode obfuscation) and 10 benign boilerplate contracts.

**Key Findings:**
- **The "Paranoid Lawyer" Problem:** The LLM-only pipeline hallucinates risk on standard boilerplate, yielding an unacceptable **70% False Positive Rate (FPR)**. The Hybrid pipeline reduces this to 30%.
- **Attack Success Rate (ASR):** 86.7% of adversarial attacks successfully fooled the LLM in isolation. However, in the Hybrid pipeline, the Consistency Checker and Sanitizer intercepted all but **13.3%** of these attacks.
- **Cost & Speed:** The Hybrid pipeline reduced total LLM inference calls by 31%, dropping latency and API costs proportionally while maintaining a 93.3% accuracy/recall rate.

👉 **[Read the full experiment methodology and results in RESULTS.md](scripts/baseline-comparison/RESULTS.md)**

---

## 🚀 Running Locally

### Prerequisites
- Node.js (v18+)
- A Groq API key (for Llama-3.1-8b-instant inference)

### Setup

1. **Clone the repository and install dependencies:**
   ```bash
   git clone https://github.com/your-username/ClauseGuard.git
   cd ClauseGuard
   npm install
   ```

2. **Configure Environment Variables:**
   Rename `.env.example` to `.env` and add your Groq API key:
   ```env
   GROQ_API_KEY=your_groq_api_key_here
   PORT=3000
   ```

3. **Start the Server:**
   ```bash
   npm start
   ```

4. **Access the Application:**
   Open `http://localhost:3000` in your browser. Drag and drop a contract, and review the flagged clauses!

### Running the Benchmark
To reproduce the adversarial robustness experiments:
```bash
node scripts/baseline-comparison/run-experiments.js
```
