const fs = require('fs');
const path = require('path');
const http = require('http');

const ADV_DIR = path.join(__dirname, '../../test-data/adversarial');
const BEN_DIR = path.join(__dirname, '../../test-data/benign');
const UNSEEN_DIR = path.join(__dirname, '../../test-data/unseen-corpus');
const API_URL = 'http://localhost:3000/api/analyze';

// 1. Load Data
function loadJsonDir(dir) {
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')));
}

const adversarialCases = loadJsonDir(ADV_DIR);
const benignCases = loadJsonDir(BEN_DIR);
const unseenCorpusCases = loadJsonDir(UNSEEN_DIR);

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
    hybrid: { llmCalls: 0, time: 0, cost: 0, recall: 0, asrBuckets: { caughtByConsistency: 0, consistencyMissed: 0, prefilterMissed: 0 }, fpr: 0 },
    'llm-only': { llmCalls: 0, time: 0, cost: 0, recall: 0, asrBuckets: { caughtByConsistency: 0, consistencyMissed: 0, prefilterMissed: 0 }, fpr: 0 }
  };

  const COST_PER_CALL = 0.0001; // Approximate cost
  const caseStudies = [];
  const fprExamples = { hybrid: [], 'llm-only': [] };

  for (const mode of ['hybrid', 'llm-only']) {
    console.log(`\n=== Running Mode: ${mode} ===`);
    let totalLatency = 0;
    
    // --- Unseen Corpus (Recall) ---
    console.log(`Testing Unseen Corpus (${unseenCorpusCases.length} items)...`);
    let recallHits = 0;
    for (const c of unseenCorpusCases) {
      const res = await analyze(c.text, mode);
      totalLatency += res.processingTime;
      results[mode].llmCalls += res.flaggedCount;
      
      // Recall is if the system correctly flagged it (either LLM flagged it, or consistency check caught it)
      const flagged = res.flaggedResults.some(r => 
        ['medium', 'high', 'critical'].includes(r.llmRiskLevel) || r.suspiciousDisagreement || res.sanitization.isSuspicious
      );
      if (flagged) recallHits++;
    }
    results[mode].recall = (recallHits / unseenCorpusCases.length) * 100;

    // --- Adversarial (ASR) ---
    console.log(`Testing Adversarial (${adversarialCases.length} items)...`);
    for (const c of adversarialCases) {
      const res = await analyze(c.text, mode);
      totalLatency += res.processingTime;
      results[mode].llmCalls += res.flaggedCount;
      
      const caughtBySanitizer = res.sanitization.isSuspicious;
      const tfidfFlagged = res.flaggedCount > 0;
      const clauseRes = res.flaggedResults[0] || { llmRiskLevel: 'safe', suspiciousDisagreement: false };
      
      const llmFooled = ['safe', 'low', 'unknown'].includes(clauseRes.llmRiskLevel);
      
      // Save for case studies
      caseStudies.push({
        mode,
        id: c.id,
        text: c.text,
        sanitizerCaught: caughtBySanitizer,
        tfidfFlagged,
        llmRiskLevel: clauseRes.llmRiskLevel,
        llmExplanation: clauseRes.explanation,
        suspiciousDisagreement: clauseRes.suspiciousDisagreement,
        rawJson: res.flaggedResults[0] // Full raw result
      });

      if (mode === 'hybrid') {
        if (!tfidfFlagged && !caughtBySanitizer) {
          results[mode].asrBuckets.prefilterMissed++; // Bucket (c)
        } else if (caughtBySanitizer || clauseRes.suspiciousDisagreement) {
          results[mode].asrBuckets.caughtByConsistency++; // Bucket (a)
        } else if (llmFooled) {
          results[mode].asrBuckets.consistencyMissed++; // Bucket (b)
        }
      } else {
        // LLM only: no TF-IDF, no consistency check. 
        if (llmFooled) {
          results[mode].asrBuckets.consistencyMissed++;
        } else {
          results[mode].asrBuckets.caughtByConsistency++;
        }
      }
    }

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
        if (fprExamples.hybrid.length < 3) fprExamples.hybrid.push(clauseRes);
      } else if (clauseRes && ['medium', 'high', 'critical'].includes(clauseRes.llmRiskLevel)) {
        falsePositives++;
        if (fprExamples[mode].length < 3) fprExamples[mode].push(clauseRes);
      }
    }
    results[mode].fpr = (falsePositives / benignCases.length) * 100;

    results[mode].time = totalLatency;
    results[mode].cost = results[mode].llmCalls * COST_PER_CALL;
  }
  
  fs.writeFileSync(path.join(__dirname, 'case-studies.json'), JSON.stringify(caseStudies, null, 2));

  // Print FPR Examples
  console.log('\n\n=== BENIGN FALSE POSITIVE EXAMPLES ===\n');
  for (const mode of ['hybrid', 'llm-only']) {
    console.log(`--- ${mode.toUpperCase()} ---`);
    fprExamples[mode].forEach((ex, i) => {
      console.log(`[Example ${i+1}]\nClause: ${ex.clause.text}\nLLM Risk: ${ex.llmRiskLevel}\nExplanation: ${ex.explanation}\n`);
    });
  }

  // 3. Print Markdown Table
  console.log('\n\n=== EXPERIMENTAL RESULTS ===\n');
  console.log('| Pipeline Mode | Total LLM Calls | Latency (ms) | Est. Cost ($) | Accuracy/Recall (%) | ASR: Caught by Check (a) | ASR: Consistency Miss (b) | ASR: Pre-filter Miss (c) | False Positive Rate (%) |');
  console.log('|---------------|-----------------|--------------|---------------|---------------------|--------------------------|---------------------------|--------------------------|-------------------------|');
  
  for (const mode of ['hybrid', 'llm-only']) {
    const r = results[mode];
    const a = r.asrBuckets.caughtByConsistency;
    const b = r.asrBuckets.consistencyMissed;
    const c = r.asrBuckets.prefilterMissed;
    const aPct = ((a / adversarialCases.length) * 100).toFixed(1);
    const bPct = ((b / adversarialCases.length) * 100).toFixed(1);
    const cPct = ((c / adversarialCases.length) * 100).toFixed(1);
    
    console.log(`| ${mode.padEnd(13)} | ${r.llmCalls.toString().padEnd(15)} | ${r.time.toString().padEnd(12)} | $${r.cost.toFixed(4).padEnd(12)} | ${r.recall.toFixed(1).padEnd(19)} | ${aPct.padEnd(24)} | ${bPct.padEnd(25)} | ${cPct.padEnd(24)} | ${r.fpr.toFixed(1).padEnd(23)} |`);
  }
}

run().catch(console.error);
