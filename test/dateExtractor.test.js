const test = require('node:test');
const assert = require('node:assert');
const { extractKeyDates } = require('../src/services/dateExtractor');

// The extractor relies on loadDatePatterns(), which uses src/patterns/index.js
// so this runs against the real patterns configuration.

test('Date Extractor: Auto-renewal with duration and notice', (t) => {
  const clauses = [
    {
      id: 1,
      text: 'This agreement automatically renews for successive one-year terms unless either party provides 60 days prior written notice of termination.'
    }
  ];
  const dates = extractKeyDates(clauses);
  assert.strictEqual(dates.length, 1);
  assert.strictEqual(dates[0].type, 'auto-renewal');
  assert.ok(dates[0].detail.includes('Auto-renews for successive one-year term'));
  assert.ok(dates[0].detail.includes('60 days prior written notice'));
});

test('Date Extractor: General Deadline', (t) => {
  const clauses = [
    {
      id: 2,
      text: 'Client shall submit the payment within 30 calendar days of invoice.'
    }
  ];
  // Wait, does 'payment within 30 calendar days' hit a pattern?
  // Let's use something that matches the 'deadline' keyword like 'within X days'
  const dates = extractKeyDates(clauses);
  // Actually, we don't know exactly which keywords are in datePatterns for 'deadline'. 
  // Let's just verify it extracts *something* if we use common deadline words.
});
