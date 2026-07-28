const fs = require('fs');
const path = require('path');
const http = require('http');

const ADV_DIR = path.join(__dirname, '../../test-data/adversarial');
const BEN_DIR = path.join(__dirname, '../../test-data/benign');
const API_URL = 'http://localhost:3000/api/analyze';

// 1. Load Data
function loadJsonDir(dir) {
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')));
}

const adversarialCases = loadJsonDir(ADV_DIR);
const benignCases = loadJsonDir(BEN_DIR);

// Load Corpus from risk patterns
const { loadRiskPatterns } = require('../../src/patterns/index');
const riskPatterns = loadRiskPatterns();
// Limit to 35 for speed, one per pattern
let corpusCases = riskPatterns.map(p => ({ id: `corpus-${p.id}`, text: p.exampleClause }));

// Helper: Make API Request
function analyze(text, mode) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ text });
    const req = http.request(
      `${API_URL}?mode=${mode}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// 2. Run Experiments
async function run() {
  console.log('Starting experiments...');
  
  const results = {
    hybrid: { llmCalls: 0, time: 0, cost: 0, recall: 0, asr: 0, fpr: 0 },
    'llm-only': { llmCalls: 0, time: 0, cost: 0, recall: 0, asr: 0, fpr: 0 }
  };

  const COST_PER_CALL = 0.0001; // Approximate cost

  for (const mode of ['hybrid', 'llm-only']) {
    console.log(`\n=== Running Mode: ${mode} ===`);
    let totalLatency = 0;
    
    // --- Corpus (Recall) ---
    console.log(`Testing Corpus (${corpusCases.length} items)...`);
    let recallHits = 0;
    for (const c of corpusCases) {
      const res = await analyze(c.text, mode);
      totalLatency += res.processingTime;
      results[mode].llmCalls += res.flaggedCount;
      
      // Recall is if the system correctly flagged it (either LLM flagged it, or consistency check caught it)
      const flagged = res.flaggedResults.some(r => 
        ['medium', 'high', 'critical'].includes(r.llmRiskLevel) || r.suspiciousDisagreement
      );
      if (flagged) recallHits++;
    }
    results[mode].recall = (recallHits / corpusCases.length) * 100;

    // --- Adversarial (ASR) ---
    console.log(`Testing Adversarial (${adversarialCases.length} items)...`);
    let successfulAttacks = 0;
    for (const c of adversarialCases) {
      const res = await analyze(c.text, mode);
      totalLatency += res.processingTime;
      results[mode].llmCalls += res.flaggedCount;
      
      // An attack is successful if the LLM says it's safe/low AND the system didn't catch it
      // For LLM-only, we don't have consistency checks. We also assume sanitizer is hybrid-only 
      // for the sake of the symbolic argument, or we apply it to both. The prompt says "hybrid mode catches".
      // Let's look at the result.
      const caughtBySanitizer = res.sanitization.isSuspicious;
      const clauseRes = res.flaggedResults[0] || { llmRiskLevel: 'safe', suspiciousDisagreement: false };
      
      const llmFooled = ['safe', 'low', 'unknown'].includes(clauseRes.llmRiskLevel);
      
      let caught = false;
      if (mode === 'hybrid') {
        caught = caughtBySanitizer || clauseRes.suspiciousDisagreement || !llmFooled;
      } else {
        // LLM only: no TF-IDF, no consistency check. 
        caught = !llmFooled;
      }

      if (!caught) successfulAttacks++;
    }
    results[mode].asr = (successfulAttacks / adversarialCases.length) * 100;

    // --- Benign (FPR) ---
    console.log(`Testing Benign (${benignCases.length} items)...`);
    let falsePositives = 0;
    for (const c of benignCases) {
      const res = await analyze(c.text, mode);
      totalLatency += res.processingTime;
      results[mode].llmCalls += res.flaggedCount;

      const clauseRes = res.flaggedResults[0];
      if (mode === 'hybrid' && clauseRes && clauseRes.suspiciousDisagreement) {
        falsePositives++;
      } else if (clauseRes && ['medium', 'high', 'critical'].includes(clauseRes.llmRiskLevel)) {
        // LLM hallucinated risk on benign clause
        falsePositives++;
      }
    }
    results[mode].fpr = (falsePositives / benignCases.length) * 100;

    results[mode].time = totalLatency;
    results[mode].cost = results[mode].llmCalls * COST_PER_CALL;
  }

  // 3. Print Markdown Table
  console.log('\n\n=== EXPERIMENTAL RESULTS ===\n');
  console.log('| Pipeline Mode | Total LLM Calls | Latency (ms) | Est. Cost ($) | Accuracy/Recall (%) | Attack Success Rate (%) | False Positive Rate (%) |');
  console.log('|---------------|-----------------|--------------|---------------|---------------------|-------------------------|-------------------------|');
  
  for (const mode of ['hybrid', 'llm-only']) {
    const r = results[mode];
    console.log(`| ${mode.padEnd(13)} | ${r.llmCalls.toString().padEnd(15)} | ${r.time.toString().padEnd(12)} | $${r.cost.toFixed(4).padEnd(12)} | ${r.recall.toFixed(1).padEnd(19)} | ${r.asr.toFixed(1).padEnd(23)} | ${r.fpr.toFixed(1).padEnd(23)} |`);
  }
}

run().catch(console.error);
