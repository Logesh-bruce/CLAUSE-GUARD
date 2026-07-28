/**
 * Pattern Loader — auto-discovers all JSON files in this directory.
 *
 * Two categories of patterns exist:
 *
 * 1. RISK patterns — standard contract risk flags (financial, employment, rental, b2b, etc.)
 *    Schema: { id, category, riskLevel, keywords, description, exampleClause }
 *    → Used by riskDetector.js to build the TF-IDF corpus and flag risky clauses.
 *
 * 2. DATE patterns — renewal/deadline/expiration markers (dates.json)
 *    Schema: same as above + { isDatePattern: true, dateType: string }
 *    → Used by dateExtractor.js to populate the 'keyDates' response field.
 *    → NOT included in the risk corpus (won't pollute risk results).
 *
 * To add a new contract type: drop a .json file in this directory — no code changes needed.
 * To add a new date pattern category: add entries to dates.json with isDatePattern: true.
 */

const fs = require('fs');
const path = require('path');

let _loadedPatterns = null;

function loadAllPatterns() {
  if (_loadedPatterns) return _loadedPatterns;

  const patternsDir = __dirname;
  const allPatterns = [];

  const files = fs.readdirSync(patternsDir).filter(f => f.endsWith('.json'));

  for (const file of files) {
    try {
      const filePath = path.join(patternsDir, file);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      if (!data.patterns || !Array.isArray(data.patterns)) {
        console.warn(`[Patterns] Skipping ${file}: missing or invalid 'patterns' array`);
        continue;
      }

      // Validate each pattern has required fields
      const valid = data.patterns.filter(p => {
        const ok = p.id && p.category && p.riskLevel && p.keywords && p.exampleClause;
        if (!ok) console.warn(`[Patterns] Skipping malformed pattern in ${file}:`, p.id || '(no id)');
        return ok;
      });

      allPatterns.push(...valid.map(p => ({
        ...p,
        contractType: data.contractType || 'unknown',
        isDatePattern: p.isDatePattern || false,
      })));
    } catch (err) {
      console.error(`[Patterns] Failed to load ${file}:`, err.message);
    }
  }

  console.log(
    `[Patterns] Loaded ${allPatterns.length} patterns from ${files.length} file(s) ` +
    `(${allPatterns.filter(p => !p.isDatePattern).length} risk, ${allPatterns.filter(p => p.isDatePattern).length} date)`
  );
  _loadedPatterns = allPatterns;
  return allPatterns;
}

/**
 * Returns only risk patterns — used by riskDetector to build TF-IDF corpus.
 * Date patterns are intentionally excluded so they don't appear as risk flags.
 */
function loadRiskPatterns() {
  return loadAllPatterns().filter(p => !p.isDatePattern);
}

/**
 * Returns only date/deadline patterns — used by dateExtractor.
 */
function loadDatePatterns() {
  return loadAllPatterns().filter(p => p.isDatePattern === true);
}

module.exports = { loadAllPatterns, loadRiskPatterns, loadDatePatterns };
