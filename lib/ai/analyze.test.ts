import { describe, expect, it, vi } from 'vitest';
import { generateRepositoryInsight, validateAIAnalysis } from './analyze';
import { fixtureMetrics } from '../scoring/test-fixture';
import { calculateHealth } from '../scoring';

describe('AI evidence validation', () => {
  it('rejects unsupported evidence references so a repair can be requested', () => {
    expect(() => validateAIAnalysis({ summary: 'A summary.', summaryEvidenceKeys: ['activity.commits30d'], strengths: [{ text: 'good', evidenceKeys: ['made.up'] }], risks: [], recommendations: [] }, new Set(['activity.commits30d']))).toThrow();
  });
  it('requires summary and recommendations to cite valid evidence', () => {
    expect(() => validateAIAnalysis({ summary: 'A summary.', summaryEvidenceKeys: [], strengths: [], risks: [], recommendations: [{ text: 'do something', evidenceKeys: [] }] }, new Set(['activity.commits30d']))).toThrow();
    const value = validateAIAnalysis({ summary: 'A summary.', summaryEvidenceKeys: ['activity.commits30d'], strengths: [], risks: [], recommendations: [{ text: 'do something', evidenceKeys: ['activity.commits30d'] }] }, new Set(['activity.commits30d']));
    expect(value.recommendations[0].evidenceKeys).toEqual(['activity.commits30d']);
  });
  it('requests a structured DeepSeek explanation using only the supplied metrics and evidence', async () => {
    const previous = process.env.DEEPSEEK_API_KEY;
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key';
    try {
      const metrics = fixtureMetrics();
      metrics.repository.fullName = 'fixture/deepseek';
      const health = calculateHealth(metrics);
      const content = JSON.stringify({ summary: 'risk，activity。', summaryEvidenceKeys: ['activity.commits30d'], strengths: [{ text: '近期有提交。', evidenceKeys: ['activity.commits30d'] }], risks: [], recommendations: [] });
      const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output: [{ content: [{ type: 'output_text', text: content }] }] }), { status: 200 }));
      const result = await generateRepositoryInsight(metrics, health, fetcher as typeof fetch);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(fetcher.mock.calls[0][0]).toBe('https://api.deepseek.com/responses');
      const request = JSON.parse(fetcher.mock.calls[0][1].body);
      expect(request.model).toBe('deepseek-flash');
      expect(request.reasoning.effort).toBe('none');
      expect(request.instructions).toContain('项目阶段');
      expect(request.instructions).toContain('不得猜测原因');
      expect(request.text.format.type).toBe('json_schema');
      expect(request.text.format.schema.properties.strengths.maxItems).toBe(4);
      expect(request.text.format.schema.properties.summaryEvidenceKeys.items.enum).toContain('activity.commits30d');
      expect(request.text.format.schema.properties.strengths.items.properties.evidenceKeys.items.enum).toContain('activity.commits30d');
      expect(request.input).toContain('fixture/deepseek');
      expect(result.analysis?.summary).toBe('风险较高，活跃度。');
      expect(result.warning).toBeUndefined();
    } finally {
      if (previous === undefined) delete process.env.DEEPSEEK_API_KEY;
      else process.env.DEEPSEEK_API_KEY = previous;
    }
  });
});
