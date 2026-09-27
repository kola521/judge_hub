import { GitHubClient, GitHubError } from './github/client';
import { fetchRepositoryMetrics } from './github/repository';
import { calculateHealth } from './scoring';
import { generateRepositoryInsight } from './ai/analyze';
import { analysisResponseSchema, type RepositoryAnalysisResponse } from './types/repository';
import type { RepositoryRef } from './parser/github-url';

type Cached = { report: RepositoryAnalysisResponse; expiresAt: number };
const reports = new Map<string, Cached>();
const pending = new Map<string, Promise<RepositoryAnalysisResponse>>();

export function presentReport(report: RepositoryAnalysisResponse, options: { includeAI?: boolean; debug?: boolean }, cacheHit = false): RepositoryAnalysisResponse {
  const { debug, ...base } = report;
  return {
    ...base,
    aiAnalysis: options.includeAI ? base.aiAnalysis : null,
    warnings: options.includeAI ? base.warnings : base.warnings.filter((warning) => !warning.code.startsWith('AI_')),
    ...(options.debug ? { debug: cacheHit ? { requestCount: 0, durationMs: 0, cache: 'HIT', remaining: null, limit: null } : debug ?? { requestCount: 0, durationMs: 0, cache: 'HIT', remaining: null, limit: null } } : {}),
  };
}

export async function analyzeRepository(ref: RepositoryRef, options: { includeAI?: boolean; refresh?: boolean; debug?: boolean; fastOnly?: boolean } = {}): Promise<RepositoryAnalysisResponse> {
  const key = ref.owner.toLowerCase() + '/' + ref.repo.toLowerCase() + ':repo-health-v1' + (options.fastOnly ? ':fast' : ':full');
  const pendingKey = key + (options.includeAI ? ':ai' : ':metrics');
  const cached = reports.get(key);
  const now = Date.now();
  if (!options.refresh && cached?.expiresAt && cached.expiresAt > now && (!options.includeAI || cached.report.aiAnalysis !== null || cached.report.warnings.some((warning) => warning.code.startsWith('AI_')))) {
    return presentReport(cached.report, options, true);
  }
  const running = pending.get(pendingKey);
  if (running && !options.refresh) return presentReport(await running, options);
  const task = (async () => {
    if (options.includeAI && cached && cached.expiresAt > Date.now() && !options.refresh) {
      const ai = await generateRepositoryInsight(cached.report.metrics, cached.report.health);
      const report = analysisResponseSchema.parse({ ...cached.report, aiAnalysis: ai.analysis, warnings: ai.warning ? [...cached.report.warnings, ai.warning] : cached.report.warnings }) as RepositoryAnalysisResponse;
      reports.set(key, { report, expiresAt: cached.expiresAt });
      return report;
    }
    const client = new GitHubClient();
    let metrics;
    try { metrics = await fetchRepositoryMetrics(client, ref, options.refresh, options.fastOnly); }
    catch (error) {
      if (error instanceof GitHubError && error.code === 'GITHUB_RATE_LIMITED' && cached) {
      return { ...cached.report, partial: true, warnings: [...cached.report.warnings, { code: 'GITHUB_RATE_LIMITED', message: 'GitHub 当前限流，显示上次缓存的报告。' }] };
      }
      throw error;
    }
    const health = calculateHealth(metrics);
    metrics = { ...metrics, dataQuality: { ...metrics.dataQuality, coverage: health.coverage } };
    const warnings = [...metrics.dataQuality.warnings];
    let aiAnalysis = null;
    if (options.includeAI) {
      const ai = await generateRepositoryInsight(metrics, health);
      aiAnalysis = ai.analysis;
      if (ai.warning) warnings.push(ai.warning);
    }
    const report: RepositoryAnalysisResponse = {
      repository: metrics.repository, metrics, health, aiAnalysis,
      generatedAt: metrics.dataQuality.generatedAt, source: 'GitHub REST API', scoreVersion: 'repo-health-v1',
      coverage: health.coverage, partial: metrics.dataQuality.partial, warnings,
      debug: { requestCount: client.stats.requestCount, durationMs: client.stats.durationMs, cache: client.stats.cacheHits ? 'PARTIAL HIT' : 'MISS', remaining: client.stats.remaining, limit: client.stats.limit },
    };
    const valid = analysisResponseSchema.parse(report) as RepositoryAnalysisResponse;
    reports.set(key, { report: { ...valid, debug: undefined }, expiresAt: Date.now() + 7 * 60_000 });
    return valid;
  })();
  pending.set(pendingKey, task);
  try { return presentReport(await task, options, Boolean(options.includeAI && cached && cached.expiresAt > now && !options.refresh)); } finally { pending.delete(pendingKey); }
}
