/**
 * Risk Detector — TF-IDF Cosine Similarity Engine
 *
 * How it works:
 * 1. Build a TF-IDF corpus from all pattern example clauses + their keyword strings
 * 2. For each incoming contract clause, compute cosine similarity against every pattern
 * 3. Take the highest-scoring match per clause; flag if score > RISK_THRESHOLD
 * 4. Return scored, sorted results
 *
 * Modularity: adding new contract types requires only adding a new JSON file in src/patterns/
 * No code changes here.
 */

const natural = require('natural');
const { loadRiskPatterns } = require('../patterns');

const RISK_THRESHOLD = 0.12; // Minimum cosine similarity to flag a clause
const RISK_LEVEL_ORDER = { low: 1, medium: 2, high: 3, critical: 4 };

let _tfidf = null;
let _patternDocs = null; // Parallel array: index maps to pattern

/**
 * Build the TF-IDF corpus once on first use (lazy singleton).
 * Each pattern contributes two "documents" to maximize signal:
 *   - the example clause text
 *   - the keywords joined as a sentence
 */
function buildCorpus() {
  if (_tfidf && _patternDocs) return { tfidf: _tfidf, patternDocs: _patternDocs };

  const patterns = loadRiskPatterns();
  const TfIdf = natural.TfIdf;
  const tfidf = new TfIdf();
  const patternDocs = []; // [{pattern, docType}]

  for (const pattern of patterns) {
    // Add example clause as document
    tfidf.addDocument(pattern.exampleClause);
    patternDocs.push({ pattern, docType: 'example' });

    // Add keywords as a supplemental document
    tfidf.addDocument(pattern.keywords.join(' '));
    patternDocs.push({ pattern, docType: 'keywords' });
  }

  _tfidf = tfidf;
  _patternDocs = patternDocs;

  console.log(`[RiskDetector] TF-IDF corpus built: ${patternDocs.length} documents from ${patterns.length} patterns`);
  return { tfidf, patternDocs };
}

/**
 * Compute cosine similarity between a query and a TF-IDF document.
 * @param {natural.TfIdf} tfidf
 * @param {string} query
 * @param {number} docIndex
 * @returns {number} similarity in [0, 1]
 */
function cosineSimilarity(tfidf, query, docIndex) {
  // Manual cosine: get tfidf vectors
  const tokenizer = new natural.WordTokenizer();
  const queryTokens = tokenizer.tokenize(query.toLowerCase());

  let dotProduct = 0;
  let queryMag = 0;
  let docMag = 0;

  // Build term → tfidf weight map for the document
  const docVector = {};
  tfidf.listTerms(docIndex).forEach(item => {
    docVector[item.term] = item.tfidf;
    docMag += item.tfidf * item.tfidf;
  });

  // Build query vector using IDF weights from the corpus
  for (const token of queryTokens) {
    const idf = tfidf.idf(token);
    const tf = queryTokens.filter(t => t === token).length / queryTokens.length;
    const weight = tf * idf;
    queryMag += weight * weight;
    if (docVector[token]) {
      dotProduct += weight * docVector[token];
    }
  }

  if (queryMag === 0 || docMag === 0) return 0;
  return dotProduct / (Math.sqrt(queryMag) * Math.sqrt(docMag));
}

/**
 * Detect risks in a list of clauses.
 * @param {Array<{id: number, text: string, rawIndex: number}>} clauses
 * @returns {Array<{clause, matchedPattern, score, riskLevel, isFlagged}>}
 */
function detectRisks(clauses) {
  const { tfidf, patternDocs } = buildCorpus();

  const results = [];

  for (const clause of clauses) {
    let bestScore = 0;
    let bestPattern = null;

    // Compare clause against every pattern document
    for (let i = 0; i < patternDocs.length; i++) {
      const score = cosineSimilarity(tfidf, clause.text, i);
      if (score > bestScore) {
        bestScore = score;
        bestPattern = patternDocs[i].pattern;
      }
    }

    const isFlagged = bestScore >= RISK_THRESHOLD;

    results.push({
      clause,
      matchedPattern: isFlagged ? bestPattern : null,
      score: Math.round(bestScore * 1000) / 1000, // Round to 3 decimal places
      riskLevel: isFlagged ? bestPattern.riskLevel : null,
      isFlagged,
    });
  }

  // Sort: flagged first, then by risk level descending, then by score descending
  results.sort((a, b) => {
    if (a.isFlagged !== b.isFlagged) return b.isFlagged - a.isFlagged;
    const aLevel = a.riskLevel ? RISK_LEVEL_ORDER[a.riskLevel] : 0;
    const bLevel = b.riskLevel ? RISK_LEVEL_ORDER[b.riskLevel] : 0;
    if (aLevel !== bLevel) return bLevel - aLevel;
    return b.score - a.score;
  });

  const flaggedCount = results.filter(r => r.isFlagged).length;
  console.log(`[RiskDetector] Analyzed ${clauses.length} clauses → ${flaggedCount} flagged`);

  return results;
}

module.exports = { detectRisks };
