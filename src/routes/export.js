/**
 * POST /api/export
 *
 * Accepts an array of accepted clause revisions and generates a negotiation email.
 *
 * Request body:
 * {
 *   contractName: string,         // Optional: name of contract (e.g. "Chase Sapphire Preferred Agreement")
 *   acceptedRevisions: [
 *     {
 *       clauseId: number,
 *       originalText: string,
 *       category: string,
 *       riskLevel: string,
 *       negotiationPoint: string,
 *       suggestedReplacement: string
 *     }
 *   ]
 * }
 *
 * Returns:
 * {
 *   email: {
 *     subject: string,
 *     body: string
 *   }
 * }
 */

const express = require('express');
const router = express.Router();

router.post('/', (req, res) => {
  const { contractName, acceptedRevisions } = req.body;

  if (!acceptedRevisions || !Array.isArray(acceptedRevisions) || acceptedRevisions.length === 0) {
    return res.status(400).json({
      error: true,
      message: 'No accepted revisions provided. Please accept at least one clause suggestion before exporting.',
    });
  }

  const name = contractName || 'the Agreement';
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // Group by risk level for summary
  const criticalCount = acceptedRevisions.filter(r => r.riskLevel === 'critical').length;
  const highCount = acceptedRevisions.filter(r => r.riskLevel === 'high').length;
  const mediumCount = acceptedRevisions.filter(r => r.riskLevel === 'medium').length;
  const lowCount = acceptedRevisions.filter(r => r.riskLevel === 'low').length;

  const riskSummaryParts = [];
  if (criticalCount > 0) riskSummaryParts.push(`${criticalCount} critical-risk`);
  if (highCount > 0) riskSummaryParts.push(`${highCount} high-risk`);
  if (mediumCount > 0) riskSummaryParts.push(`${mediumCount} medium-risk`);
  if (lowCount > 0) riskSummaryParts.push(`${lowCount} low-risk`);

  // Build revision sections
  const revisionSections = acceptedRevisions.map((r, i) => {
    const replacementSection = r.suggestedReplacement
      ? `\n  Proposed Replacement Language:\n  "${r.suggestedReplacement}"\n`
      : '';

    return `${i + 1}. ${r.category.toUpperCase()} [${r.riskLevel.toUpperCase()} RISK]
  Our Concern: ${r.negotiationPoint || 'This clause presents an unacceptable risk and requires revision.'}
  
  Original Clause:
  "${r.originalText}"
${replacementSection}`;
  }).join('\n---\n\n');

  const subject = `Proposed Contract Revisions — ${name} (${acceptedRevisions.length} Items)`;

  const body = `Dear Counterparty,

We have completed our review of ${name} dated ${date}. Thank you for providing the agreement for our consideration.

Following a detailed analysis of the contract terms, we have identified ${acceptedRevisions.length} clause(s) requiring revision before we can proceed to execution. These include ${riskSummaryParts.join(', ')} provisions that, in their current form, present material risks to our interests.

We are committed to reaching a mutually acceptable agreement and have proposed specific replacement language for each flagged item below. We believe these revisions represent a fair and balanced approach that protects both parties appropriately.

REQUESTED REVISIONS
===================

${revisionSections}

NEXT STEPS
==========
Please review the proposed revisions at your earliest convenience. We are available for a call to discuss any points where further negotiation is needed. Our goal is to execute a final agreement that both parties can sign with confidence.

We look forward to your response and to moving this engagement forward.

Best regards,
[Your Name]
[Your Title]
[Your Organization]
[Your Contact Information]

---
This negotiation letter was prepared with the assistance of ClauseGuard AI contract analysis. All proposed replacement language should be reviewed by qualified legal counsel before use in a final contract.`;

  res.json({
    success: true,
    email: { subject, body },
  });
});

module.exports = router;
