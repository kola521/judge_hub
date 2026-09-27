import { z } from 'zod';

const iso = z.iso.datetime({ offset: true });
export const metric = <T extends z.ZodType>(value: T) => z.object({
  value: value.nullable(), status: z.enum(['available', 'unavailable', 'not_applicable']),
  source: z.string().optional(), observedAt: iso.optional(), warning: z.string().optional(),
}).refine((item: unknown) => { const metric = item as { status: string; value: unknown }; return (metric.status === 'available') === (metric.value !== null); });
const count = metric(z.number().int().nonnegative());
const ratio = metric(z.number().min(0).max(1));
const date = metric(iso);
const signal = metric(z.boolean());
export const warningSchema = z.object({ code: z.string(), message: z.string() });
export const repositoryMetricsSchema = z.object({
  repository: z.object({ owner: z.string(), name: z.string(), fullName: z.string(), description: z.string().nullable(), htmlUrl: z.url(), defaultBranch: z.string(), createdAt: iso, updatedAt: iso, pushedAt: iso.nullable(), license: z.string().nullable(), topics: z.array(z.string()) }),
  popularity: z.object({ stars: count, forks: count, watchers: count }),
  activity: z.object({ commits30d: count, commits90d: count, lastCommitAt: date, contributors: count, activeContributors: count, commitDays: z.array(z.object({ date: z.string(), count: z.number().int().nonnegative() })) }),
  maintenance: z.object({ issuesOpen: count, issuesClosed90d: count, prsOpen: count, prsMerged90d: count, latestReleaseAt: date, releases90d: count, repositoryPushedAt: date }),
  collaboration: z.object({ topContributorShare: ratio, top3ContributorShare: ratio, prContributorBreadth: count }),
  documentation: z.object({ readme: signal, license: signal, contributing: signal, security: signal, conduct: signal, docs: signal }),
  engineering: z.object({ ci: signal, tests: signal, dependencies: signal, build: signal, container: signal }),
  languages: z.array(z.object({ name: z.string(), bytes: z.number().int().nonnegative(), percentage: z.number().min(0).max(100) })),
  dataQuality: z.object({ coverage: z.number().min(0).max(1), partial: z.boolean(), warnings: z.array(warningSchema), generatedAt: iso, source: z.literal('GitHub REST API'), requestCount: z.number().int().nonnegative(), sampled: z.boolean() }),
});
export type RepositoryMetrics = z.infer<typeof repositoryMetricsSchema>;
export type MetricValue<T> = { value: T | null; status: 'available' | 'unavailable' | 'not_applicable'; source?: string; observedAt?: string; warning?: string };
export type AnalysisWarning = z.infer<typeof warningSchema>;
export type Evidence = { key: string; metric: string; value: string | number | boolean; description: string; polarity: 'positive' | 'negative' | 'neutral'; observedAt?: string };
export type ScoreDimension = { key: string; name: string; score: number | null; weight: number; status: 'excellent' | 'good' | 'warning' | 'risk' | 'unknown'; evidence: Evidence[] };
export type HealthScore = { totalScore: number | null; status: ScoreDimension['status']; scoreVersion: 'repo-health-v1'; coverage: number; provisional: boolean; dimensions: ScoreDimension[] };
export type InsightItem = { text: string; evidenceKeys: string[] };
export type AIAnalysis = { summary: string; strengths: InsightItem[]; risks: InsightItem[]; recommendations: InsightItem[] };
export type RepositoryAnalysisResponse = { repository: RepositoryMetrics['repository']; metrics: RepositoryMetrics; health: HealthScore; aiAnalysis: AIAnalysis | null; generatedAt: string; source: 'GitHub REST API'; scoreVersion: 'repo-health-v1'; coverage: number; partial: boolean; warnings: AnalysisWarning[]; debug?: { requestCount: number; durationMs: number; cache: string; remaining: number | null; limit: number | null } };

export const analysisResponseSchema = z.object({
  repository: repositoryMetricsSchema.shape.repository,
  metrics: repositoryMetricsSchema,
  health: z.object({ totalScore: z.number().min(0).max(100).nullable(), status: z.enum(['excellent', 'good', 'warning', 'risk', 'unknown']), scoreVersion: z.literal('repo-health-v1'), coverage: z.number().min(0).max(1), provisional: z.boolean(), dimensions: z.array(z.object({ key: z.string(), name: z.string(), score: z.number().min(0).max(100).nullable(), weight: z.number(), status: z.enum(['excellent', 'good', 'warning', 'risk', 'unknown']), evidence: z.array(z.object({ key: z.string(), metric: z.string(), value: z.union([z.string(), z.number(), z.boolean()]), description: z.string(), polarity: z.enum(['positive', 'negative', 'neutral']), observedAt: iso.optional() })) })) }),
  aiAnalysis: z.object({ summary: z.string(), strengths: z.array(z.object({ text: z.string(), evidenceKeys: z.array(z.string()) })), risks: z.array(z.object({ text: z.string(), evidenceKeys: z.array(z.string()) })), recommendations: z.array(z.object({ text: z.string(), evidenceKeys: z.array(z.string()) })) }).nullable(),
  generatedAt: iso, source: z.literal('GitHub REST API'), scoreVersion: z.literal('repo-health-v1'), coverage: z.number().min(0).max(1), partial: z.boolean(), warnings: z.array(warningSchema),
  debug: z.object({ requestCount: z.number(), durationMs: z.number(), cache: z.string(), remaining: z.number().nullable(), limit: z.number().nullable() }).optional(),
});

export const available = <T>(value: T, observedAt?: string): MetricValue<T> => ({ value, status: 'available', source: 'GitHub REST API', ...(observedAt ? { observedAt } : {}) });
export const unavailable = <T>(warning: string): MetricValue<T> => ({ value: null, status: 'unavailable', warning });
export const notApplicable = <T>(): MetricValue<T> => ({ value: null, status: 'not_applicable' });
