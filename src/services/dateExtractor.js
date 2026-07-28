/**
 * Date Extractor — Key Dates extraction from contract clauses
 *
 * Pipeline:
 * 1. Load date-specific patterns (those with isDatePattern: true)
 * 2. For each clause, run keyword matching against date pattern keywords (fast, no TF-IDF overhead)
 * 3. On match, run regex extraction to pull out the specific date or duration mentioned
 * 4. Return a keyDates array: [{ clauseId, clauseText, type, category, detail, extracted }]
 *
 * Design decisions:
 * - Keyword matching (not TF-IDF) used for date patterns — date language is distinctive enough
 *   that keyword hits are reliable, and this keeps the date pass instant (<1ms for 60 clauses).
 * - When regex can't confidently parse a date, we surface "see clause for details" rather than
 *   guessing at a wrong value.
 * - One match per clause (first matching date pattern wins) to avoid duplicate keyDates entries.
 */

const { loadDatePatterns } = require('../patterns');

// ============================================================
// Extraction Regex Patterns
// ============================================================

// Calendar dates: "January 15, 2026" / "Jan 15 2026" / "15/01/2026" / "2026-01-15"
const CALENDAR_DATE_RE = /(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s*\d{4}|\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b/gi;

// Durations: "30 days", "6 months", "2 years", "90 calendar days", "45 business days"
const DURATION_RE = /(\d+)\s*(?:calendar\s+)?(?:business\s+)?(day|week|month|year)s?/gi;

// Notice-specific: "60 days prior written notice", "30-day notice"
const NOTICE_RE = /(\d+)[- ]?(?:calendar\s+)?(?:business\s+)?days?\s*(?:'s\s*)?(?:prior\s+)?(?:written\s+)?notice/gi;

// Renewal term: "successive one-year terms", "additional 12-month periods"
const RENEWAL_TERM_RE = /(?:successive|additional|renewal|consecutive)\s+(?:one|two|three|six|twelve|24|12|6|3|\d+)[- ]?(?:year|month|week|day)(?:ly)?(?:\s+term)?/gi;

// ============================================================
// Extraction Helpers
// ============================================================

/** Find all regex matches and return unique values */
function matchAll(text, regex) {
  const results = [];
  let m;
  const re = new RegExp(regex.source, regex.flags);
  while ((m = re.exec(text)) !== null) {
    results.push(m[0].trim());
  }
  return [...new Set(results)];
}

/**
 * Extract a human-readable detail string for a date pattern match.
 * Falls back to "see clause for details" when extraction is inconclusive.
 */
function extractDetail(clauseText, pattern) {
  const dates = matchAll(clauseText, CALENDAR_DATE_RE);
  const durations = matchAll(clauseText, DURATION_RE);
  const notices = matchAll(clauseText, NOTICE_RE);
  const renewalTerms = matchAll(clauseText, RENEWAL_TERM_RE);

  const { dateType } = pattern;

  if (dateType === 'auto-renewal') {
    if (notices.length > 0) {
      const noticeStr = notices[0].replace(/\s+/g, ' ');
      const termStr = renewalTerms[0] ? ` for ${renewalTerms[0]}` : '';
      return `Auto-renews${termStr} — ${noticeStr} required to cancel`;
    }
    if (durations.length > 0) {
      const termStr = renewalTerms[0] ? ` for ${renewalTerms[0]}` : '';
      return `Auto-renews${termStr} — ${durations[0]} notice required`;
    }
    if (renewalTerms.length > 0) {
      return `Auto-renews for ${renewalTerms[0]} — check clause for notice requirement`;
    }
    return 'Auto-renews automatically — check clause for notice deadline';
  }

  if (dateType === 'notice-period') {
    if (notices.length > 0) return `${notices[0].charAt(0).toUpperCase() + notices[0].slice(1)} required`;
    if (durations.length > 0) return `${durations[0]} notice required`;
    return 'Notice period required — see clause for duration';
  }

  if (dateType === 'expiration') {
    if (dates.length > 0) return `Agreement expires / terminates on ${dates[0]}`;
    if (durations.length > 0) return `Contract term: ${durations[0]}`;
    return 'Expiration date referenced — see clause for details';
  }

  if (dateType === 'deadline') {
    if (durations.length > 0 && dates.length > 0) return `Due within ${durations[0]} (no later than ${dates[0]})`;
    if (durations.length > 0) return `Due within ${durations[0]}`;
    if (dates.length > 0) return `Deadline: ${dates[0]}`;
    return 'Deadline referenced — see clause for details';
  }

  if (dateType === 'cure-period') {
    if (durations.length > 0) return `${durations[0]} to cure breach after notice`;
    return 'Cure period referenced — see clause for duration';
  }

  if (dateType === 'review-window') {
    if (durations.length > 0) return `${durations[0]} review / renegotiation window`;
    return 'Annual review / renegotiation window — see clause';
  }

  // Generic fallback
  const all = [...dates, ...durations].slice(0, 2);
  return all.length > 0 ? all.join('; ') : 'Date or deadline referenced — see clause for details';
}

// ============================================================
// Main export
// ============================================================

/**
 * Scan all clauses for date/deadline language and extract key dates.
 * @param {Array<{id: number, text: string}>} clauses
 * @returns {Array<{ clauseId, clauseText, type, category, detail }>}
 */
function extractKeyDates(clauses) {
  const datePatterns = loadDatePatterns();

  if (!datePatterns || datePatterns.length === 0) return [];

  const keyDates = [];

  for (const clause of clauses) {
    const lowerText = clause.text.toLowerCase();

    for (const pattern of datePatterns) {
      // Keyword match — check if any keyword appears in the clause text
      const hit = pattern.keywords.some(kw => lowerText.includes(kw.toLowerCase()));

      if (hit) {
        const detail = extractDetail(clause.text, pattern);
        keyDates.push({
          clauseId: clause.id,
          clauseText: clause.text,
          type: pattern.dateType,
          category: pattern.category,
          detail,
        });
        break; // One date type per clause — first match wins
      }
    }
  }

  console.log(`[DateExtractor] Scanned ${clauses.length} clauses → ${keyDates.length} key date(s) found`);
  return keyDates;
}

module.exports = { extractKeyDates };
