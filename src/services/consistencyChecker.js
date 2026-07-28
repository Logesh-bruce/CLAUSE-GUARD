/**
 * Consistency Checker — Compares symbolic signal (TF-IDF) to LLM judgment.
 * 
 * If a clause is highly similar to a known critical/high risk pattern (TF-IDF > THRESHOLD),
 * but the LLM classifies it as safe/low risk, it suggests the LLM has been manipulated
 * or is hallucinating.
 */

function checkConsistency(tfidfScore, tfidfRiskLevel, llmRiskLevel, threshold = 0.15) {
  if (tfidfScore < threshold) {
    return { isSuspicious: false, reason: null };
  }

  // Define risk hierarchy
  const levels = { safe: 0, low: 1, medium: 2, high: 3, critical: 4 };
  const tLevel = levels[tfidfRiskLevel || 'safe'] || 0;
  const lLevel = levels[llmRiskLevel || 'safe'] || 0;

  // Significant disagreement: TF-IDF sees High/Critical, LLM sees Safe/Low
  if (tLevel >= 3 && lLevel <= 1) {
    return {
      isSuspicious: true,
      reason: `TF-IDF pattern matched ${tfidfRiskLevel.toUpperCase()} risk (score ${(tfidfScore * 100).toFixed(1)}%), but LLM classified as ${llmRiskLevel.toUpperCase()}. Possible prompt manipulation.`,
    };
  }

  return { isSuspicious: false, reason: null };
}

module.exports = { checkConsistency };
