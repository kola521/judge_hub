import { describe, expect, it } from 'vitest';
import { validateAIAnalysis } from './analyze';

describe('AI evidence validation', () => {
  it('rejects unsupported evidence references so a repair can be requested', () => {
    expect(() => validateAIAnalysis({ summary: 'A summary.', summaryEvidenceKeys: ['activity.commits30d'], strengths: [{ text: 'good', evidenceKeys: ['made.up'] }], risks: [], recommendations: [] }, new Set(['activity.commits30d']))).toThrow();
  });
  it('requires summary and recommendations to cite valid evidence', () => {
    expect(() => validateAIAnalysis({ summary: 'A summary.', summaryEvidenceKeys: [], strengths: [], risks: [], recommendations: [{ text: 'do something', evidenceKeys: [] }] }, new Set(['activity.commits30d']))).toThrow();
    const value = validateAIAnalysis({ summary: 'A summary.', summaryEvidenceKeys: ['activity.commits30d'], strengths: [], risks: [], recommendations: [{ text: 'do something', evidenceKeys: ['activity.commits30d'] }] }, new Set(['activity.commits30d']));
    expect(value.recommendations[0].evidenceKeys).toEqual(['activity.commits30d']);
  });
});
