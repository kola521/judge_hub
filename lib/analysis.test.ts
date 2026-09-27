import { describe, expect, it } from 'vitest';
import { presentReport } from './analysis';
import { fixtureMetrics } from './scoring/test-fixture';
import { calculateHealth } from './scoring';
import type { RepositoryAnalysisResponse } from './types/repository';

describe('report presentation', () => {
  it('does not leak cached AI or debug details into a metrics-only response', () => {
    const metrics = fixtureMetrics();
    const health = calculateHealth(metrics);
    const report: RepositoryAnalysisResponse = { repository: metrics.repository, metrics, health, aiAnalysis: { summary: 'based on evidence', strengths: [], risks: [], recommendations: [] }, generatedAt: metrics.dataQuality.generatedAt, source: 'GitHub REST API', scoreVersion: 'repo-health-v1', coverage: health.coverage, partial: false, warnings: [{ code: 'AI_UNAVAILABLE', message: 'AI failed' }], debug: { requestCount: 5, durationMs: 300, cache: 'MISS', remaining: 4, limit: 60 } };
    const plain = presentReport(report, { includeAI: false, debug: false });
    expect(plain.aiAnalysis).toBeNull();
    expect(plain.warnings).toEqual([]);
    expect(plain.debug).toBeUndefined();
  });
});
