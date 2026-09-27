import { describe, expect, it } from 'vitest';
import { calculateHealth } from './index';
import { fixtureMetrics } from './test-fixture';

describe('repo-health-v1', () => {
  it('is deterministic and emits six dimensions and evidence', () => {
    const metrics = fixtureMetrics();
    const first = calculateHealth(metrics);
    expect(first).toEqual(calculateHealth(metrics));
    expect(first.scoreVersion).toBe('repo-health-v1');
    expect(first.dimensions).toHaveLength(6);
    expect(first.dimensions.every((dimension) => dimension.evidence.length > 0)).toBe(true);
  });
  it('excludes unavailable signals instead of treating them as zero', () => {
    const metrics = fixtureMetrics();
    const complete = calculateHealth(metrics);
    metrics.activity.commits30d = { value: null, status: 'unavailable', warning: 'request failed' };
    const partial = calculateHealth(metrics);
    expect(partial.coverage).toBeLessThan(complete.coverage);
    expect(partial.dimensions[0].score).not.toBe(0);
  });
  it('excludes not applicable engineering signals from coverage', () => {
    const metrics = fixtureMetrics();
    const before = calculateHealth(metrics);
    metrics.engineering.container = { value: null, status: 'not_applicable' };
    const after = calculateHealth(metrics);
    expect(after.coverage).toBe(1);
    expect(before.coverage).toBe(1);
  });
  it('marks a dimension unknown when every planned signal is unavailable', () => {
    const metrics = fixtureMetrics();
    metrics.documentation = Object.fromEntries(Object.keys(metrics.documentation).map((key) => [key, { value: null, status: 'unavailable' }])) as typeof metrics.documentation;
    const result = calculateHealth(metrics);
    expect(result.dimensions.find((dimension) => dimension.key === 'documentation')).toMatchObject({ score: null, status: 'unknown' });
    expect(result.coverage).toBeLessThan(1);
  });
  it('penalizes a long-inactive repository relative to an active fixture', () => {
    const active = fixtureMetrics();
    const stale = fixtureMetrics();
    const old = new Date(Date.parse(stale.dataQuality.generatedAt) - 500 * 86_400_000).toISOString();
    stale.activity.lastCommitAt = { value: old, status: 'available' };
    stale.maintenance.repositoryPushedAt = { value: old, status: 'available' };
    stale.maintenance.latestReleaseAt = { value: old, status: 'available' };
    expect(calculateHealth(stale).totalScore).toBeLessThan(calculateHealth(active).totalScore!);
  });
});
