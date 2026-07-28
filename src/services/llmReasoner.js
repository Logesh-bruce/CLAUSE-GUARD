/**
 * LLM Reasoner — Groq API integration with concurrency control
 *
 * For each flagged clause:
 * 1. Sends the clause + matched pattern context to Groq
 * 2. Gets back: plain-language risk explanation + suggested counter-term
 *
 * Concurrency: p-limit(5) — max 5 parallel Groq calls to avoid rate limits
 * Retry: 3 attempts with exponential backoff on 429 / 503 errors
 * Graceful degradation: if ALL LLM calls fail, clauses still show with TF-IDF detection data
 */

const Groq = require('groq-sdk');
const pLimit = require('p-limit').default || require('p-limit');

let _groq = null;
const limit = pLimit(5); // Max 5 concurrent Groq calls

function getGroqClient() {
  if (!_groq) {
    if (!process.env.GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY not set in environment');
    }
    _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return _groq;
}



/**
 * Retry wrapper with exponential backoff.
 * @param {Function} fn - async function to retry
 * @param {number} attempts - max attempts
 * @returns {Promise<any>}
 */
async function withRetry(fn, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      const isRetryable = err.status === 429 || err.status === 503 || err.code === 'ECONNRESET';
      if (isRetryable && i < attempts - 1) {
        const delay = Math.pow(2, i) * 1000 + Math.random() * 500;
        console.warn(`[LLM] Rate limited or transient error, retrying in ${Math.round(delay)}ms...`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
}

/**
 * Process a single flagged clause through Groq.
 * @param {object} item - { clause, matchedPattern, score, riskLevel }
 * @param {string} mode - 'hybrid' or 'llm-only'
 * @returns {Promise<{explanation: string, suggestedReplacement: string, negotiationPoint: string, llmRiskLevel: string}>}
 */
async function reasonSingleClause(item, mode = 'hybrid') {
  const groq = getGroqClient();
  const { clause, matchedPattern, score } = item;

  let contextBlock = '';
  if (mode === 'hybrid' && matchedPattern) {
    contextBlock = `
MATCHED RISK PATTERN:
- Category: ${matchedPattern.category}
- TF-IDF Risk Level: ${matchedPattern.riskLevel.toUpperCase()}
- Pattern Description: ${matchedPattern.description}
- Similarity Score: ${(score * 100).toFixed(1)}%`;
  }

  const prompt = `You are ClauseGuard, an AI legal risk analyst for financial agents. Analyze the following contract clause.

CONTRACT CLAUSE:
"${clause.text}"
${contextBlock}

Respond in valid JSON with exactly these four fields:
{
  "riskLevel": "Classify the risk of this clause to the signing party. MUST be one of: safe, low, medium, high, critical",
  "explanation": "2-3 sentences explaining in plain English why this clause is risky (if it is) and what specific harm it could cause to the party signing it. If safe, explain why.",
  "suggestedReplacement": "A rewritten version of this clause that protects the signing party's interests. If safe, return null.",
  "negotiationPoint": "One sentence summarizing the key change to request. If safe, return null."
}

Return ONLY the JSON object. No markdown, no preamble.`;

  return await withRetry(async () => {
    const response = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 600,
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) throw new Error('Empty response from Groq');

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error(`Could not extract JSON from response: ${content.substring(0, 100)}`);

    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.riskLevel || !parsed.explanation) {
      throw new Error('Groq response missing required fields');
    }

    return parsed;
  }, 3);
}

/**
 * Process all flagged clauses with concurrency limiting.
 * @param {Array<object>} flaggedItems
 * @param {string} mode - 'hybrid' or 'llm-only'
 * @returns {Promise<Array<object>>}
 */
async function reasonAndDraft(flaggedItems, mode = 'hybrid') {
  if (!flaggedItems || flaggedItems.length === 0) return [];

  // 'limit' is the module-level p-limit instance (max 5 concurrent)

  const tasks = flaggedItems.map(item =>
    limit(async () => {
      try {
        const reasoning = await reasonSingleClause(item, mode);
        return {
          ...item,
          explanation: reasoning.explanation,
          suggestedReplacement: reasoning.suggestedReplacement,
          negotiationPoint: reasoning.negotiationPoint,
          llmRiskLevel: reasoning.riskLevel.toLowerCase(),
          llmSuccess: true,
        };
      } catch (err) {
        console.error(`[LLM] Failed for clause ${item.clause.id}:`, err.message);
        return {
          ...item,
          explanation: `Risk detected: AI explanation unavailable due to API error.`,
          suggestedReplacement: null,
          negotiationPoint: null,
          llmRiskLevel: 'unknown',
          llmSuccess: false,
          llmError: err.message,
        };
      }
    })
  );

  const results = await Promise.all(tasks);
  const successCount = results.filter(r => r.llmSuccess).length;
  console.log(`[LLM] Processed ${flaggedItems.length} clauses: ${successCount} succeeded, ${flaggedItems.length - successCount} failed`);

  return results;
}

module.exports = { reasonAndDraft };
