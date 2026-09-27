import { z } from 'zod';
import { GitHubClient, GitHubError } from './client';
import { available, notApplicable, repositoryMetricsSchema, unavailable, type AnalysisWarning, type MetricValue, type RepositoryMetrics } from '../types/repository';
import type { RepositoryRef } from '../parser/github-url';

type Listed<T> = { items: T[]; truncated: boolean };
type Commit = { commit: { author: { date: string | null } | null }; author: { login: string } | null };
type Contributor = { login: string; contributions: number };
type Issue = { number: number; state: string; closed_at: string | null; pull_request?: unknown };
type Pull = { number: number; state: string; merged_at: string | null; user: { login: string } | null; updated_at: string };
type Release = { published_at: string | null };
type Tree = { truncated: boolean; tree: { path: string; type: string }[] };
type Repo = { owner: { login: string }; name: string; full_name: string; description: string | null; html_url: string; default_branch: string; created_at: string; updated_at: string; pushed_at: string | null; license: { spdx_id: string | null; name: string } | null; topics: string[]; stargazers_count: number; forks_count: number; subscribers_count: number; private: boolean };

const repoSchema = z.object({ owner: z.object({ login: z.string() }), name: z.string(), full_name: z.string(), description: z.string().nullable(), html_url: z.url(), default_branch: z.string(), created_at: z.string(), updated_at: z.string(), pushed_at: z.string().nullable(), license: z.object({ spdx_id: z.string().nullable(), name: z.string() }).nullable(), topics: z.array(z.string()).default([]), stargazers_count: z.number().nonnegative(), forks_count: z.number().nonnegative(), subscribers_count: z.number().nonnegative(), private: z.boolean() });
const listSchema = (item: z.ZodType) => z.object({ items: z.array(item), truncated: z.boolean() });
const sourceSchemas: z.ZodType[] = [
  z.record(z.string(), z.number().int().nonnegative()),
  listSchema(z.object({ commit: z.object({ author: z.object({ date: z.string().nullable() }).nullable() }), author: z.object({ login: z.string() }).nullable() })),
  listSchema(z.object({ login: z.string(), contributions: z.number().int().nonnegative() })),
  z.object({ truncated: z.boolean(), tree: z.array(z.object({ path: z.string(), type: z.string() })) }),
  listSchema(z.object({ number: z.number().int(), state: z.string(), closed_at: z.string().nullable(), pull_request: z.unknown().optional() })),
  listSchema(z.object({ number: z.number().int(), state: z.string(), closed_at: z.string().nullable(), pull_request: z.unknown().optional() })),
  listSchema(z.object({ number: z.number().int(), state: z.string(), merged_at: z.string().nullable(), user: z.object({ login: z.string() }).nullable(), updated_at: z.string() })),
  listSchema(z.object({ number: z.number().int(), state: z.string(), merged_at: z.string().nullable(), user: z.object({ login: z.string() }).nullable(), updated_at: z.string() })),
  listSchema(z.object({ published_at: z.string().nullable() })),
];

export function filterPureIssues<T extends { pull_request?: unknown }>(issues: T[]): T[] { return issues.filter((issue) => !issue.pull_request); }
const isoDaysAgo = (now: string, days: number) => new Date(Date.parse(now) - days * 86_400_000).toISOString();
const dayKey = (iso: string) => iso.slice(0, 10);
const failed = <T>(message: string): MetricValue<T> => unavailable<T>(message);
const result = <T>(settled: PromiseSettledResult<T>): T | null => settled.status === 'fulfilled' ? settled.value : null;

function limiter(max: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  return async <T>(job: () => Promise<T>): Promise<T> => {
    if (active >= max) await new Promise<void>((resolve) => queue.push(resolve));
    active++;
    try { return await job(); } finally { active--; queue.shift()?.(); }
  };
}

export async function fetchRepositoryMetrics(client: GitHubClient, ref: RepositoryRef, refresh = false, fastOnly = false): Promise<RepositoryMetrics> {
  const path = '/repos/' + encodeURIComponent(ref.owner) + '/' + encodeURIComponent(ref.repo);
  const raw = repoSchema.parse(await client.get<Repo>(path, refresh));
  if (raw.private) throw new GitHubError('REPOSITORY_NOT_ACCESSIBLE', '仅支持公开 GitHub 仓库。', 404);
  const now = new Date().toISOString();
  const since90 = isoDaysAgo(now, 90);
  const since30 = isoDaysAgo(now, 30);
  const q = (params: Record<string, string>) => '?' + new URLSearchParams(params).toString();
  const run = limiter(3);
  const names = ['languages', 'commits', 'contributors', 'tree', 'issuesOpen', 'issuesClosed', 'prsOpen', 'prsClosed', 'releases'] as const;
  const jobs = [
    () => client.get<Record<string, number>>(path + '/languages', refresh),
    () => client.list<Commit>(path + '/commits' + q({ since: since90, per_page: '100' }), 5, refresh),
    () => client.list<Contributor>(path + '/contributors?per_page=100', 2, refresh),
    () => client.get<Tree>(path + '/git/trees/' + encodeURIComponent(raw.default_branch) + '?recursive=1', refresh),
    () => client.list<Issue>(path + '/issues' + q({ state: 'open', per_page: '100' }), 3, refresh),
    () => client.list<Issue>(path + '/issues' + q({ state: 'closed', since: since90, per_page: '100' }), 3, refresh),
    () => client.list<Pull>(path + '/pulls' + q({ state: 'open', per_page: '100' }), 3, refresh),
    () => client.list<Pull>(path + '/pulls' + q({ state: 'closed', sort: 'updated', direction: 'desc', per_page: '100' }), 3, refresh),
    () => client.list<Release>(path + '/releases?per_page=100', 2, refresh),
  ] as const;
  const rawSettled = await Promise.allSettled(jobs.map((job, index) => index >= 4 && fastOnly ? Promise.resolve(null) : run<unknown>(job)));
  const settled: PromiseSettledResult<unknown>[] = rawSettled.map((state, index) => {
    if (state.status === 'rejected' || state.value === null) return state;
    return sourceSchemas[index].safeParse(state.value).success ? state : { status: 'rejected', reason: new GitHubError('GITHUB_INVALID_RESPONSE', 'GitHub 数据结构无效。', 502) };
  });
  const warnings: AnalysisWarning[] = [];
  if (fastOnly) warnings.push({ code: 'DEEP_SIGNALS_PENDING', message: '维护和协作数据正在补充，当前评分为初步结果。' });
  names.forEach((name, index) => {
    const state = settled[index];
    if (fastOnly && index >= 4) return;
    if (state.status === 'rejected') {
      const code = state.reason instanceof GitHubError ? state.reason.code : 'PARTIAL_GITHUB_FAILURE';
      warnings.push({ code, message: name + ' 数据暂不可用。' });
    } else if (typeof state.value === 'object' && state.value !== null && 'truncated' in state.value && state.value.truncated) {
      warnings.push({ code: name === 'contributors' ? 'CONTRIBUTORS_SAMPLED' : 'GITHUB_DATA_SAMPLED', message: name + ' 达到分页上限，相关总量不会按完整数据展示。' });
    }
  });
  const languages = result(settled[0]) as Record<string, number> | null;
  const commits = result(settled[1]) as Listed<Commit> | null;
  const contributors = result(settled[2]) as Listed<Contributor> | null;
  const tree = result(settled[3]) as Tree | null;
  const issuesOpen = result(settled[4]) as Listed<Issue> | null;
  const issuesClosed = result(settled[5]) as Listed<Issue> | null;
  const prsOpen = result(settled[6]) as Listed<Pull> | null;
  const prsClosed = result(settled[7]) as Listed<Pull> | null;
  const releases = result(settled[8]) as Listed<Release> | null;

  const commitDates = commits?.items.map((item) => item.commit.author?.date).filter((date): date is string => Boolean(date)) ?? [];
  const complete30 = Boolean(commits && (!commits.truncated || commitDates.some((date) => date < since30)));
  const commits30 = commitDates.filter((date) => date >= since30);
  const commitDays = Object.entries(commits30.reduce<Record<string, number>>((days, date) => { const key = dayKey(date); days[key] = (days[key] ?? 0) + 1; return days; }, {})).sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count }));
  const active = commits?.truncated ? failed<number>('提交记录达到采样上限') : commits ? available(new Set(commits.items.map((entry) => entry.author?.login).filter(Boolean)).size) : failed<number>('提交记录不可用');
  const totalContributions = contributors?.items.reduce((sum, contributor) => sum + contributor.contributions, 0) ?? 0;
  const concentration = (count: number): MetricValue<number> => !contributors ? failed<number>('贡献者不可用') : contributors.truncated ? failed<number>('贡献者达到采样上限') : totalContributions === 0 ? notApplicable<number>() : available(contributors.items.slice(0, count).reduce((sum, contributor) => sum + contributor.contributions, 0) / totalContributions);
  const releaseDates = releases?.items.map((release) => release.published_at).filter((date): date is string => Boolean(date)).sort().reverse() ?? [];
  const paths = tree && !tree.truncated ? tree.tree.map((item) => item.path.toLowerCase()) : null;
  if (tree?.truncated) warnings.push({ code: 'TREE_SAMPLED', message: '仓库目录树已截断，工程信号不可用。' });
  const has = (pattern: RegExp): MetricValue<boolean> => paths ? available(paths.some((path) => pattern.test(path))) : failed<boolean>('目录树不可用或已截断');
  const deps = has(/(^|\/)(package\.json|pyproject\.toml|requirements\.txt|go\.mod|cargo\.toml|pom\.xml|build\.gradle|gemfile)$/);
  const build = has(/(^|\/)(makefile|vite\.config\.[^/]+|webpack\.config\.[^/]+|tsconfig\.json|gradlew|setup\.py|cargo\.toml)$/);
  const containerDetected = has(/(^|\/)(dockerfile|compose\.ya?ml|setup\.py|pyproject\.toml)$/);
  const container = containerDetected.status === 'available' && containerDetected.value === true ? containerDetected : deps.status === 'available' && deps.value === false && build.status === 'available' && build.value === false ? notApplicable<boolean>() : containerDetected;
  const countOrUnavailable = <T>(list: Listed<T> | null, value: number, label: string): MetricValue<number> => !list ? failed<number>(label + ' 不可用') : list.truncated ? failed<number>(label + ' 达到采样上限') : available(value);
  const pureOpen = issuesOpen ? filterPureIssues(issuesOpen.items) : [];
  const pureClosed = issuesClosed ? filterPureIssues(issuesClosed.items).filter((issue) => issue.closed_at && issue.closed_at >= since90) : [];
  const recentMerged = prsClosed?.items.filter((pr) => pr.merged_at && pr.merged_at >= since90) ?? [];
  const prBreadth = prsClosed ? new Set(recentMerged.map((pr) => pr.user?.login).filter(Boolean)).size : 0;
  const normalizedLanguages = languages ? Object.entries(languages).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, bytes]) => ({ name, bytes, percentage: Object.values(languages).reduce((sum, value) => sum + value, 0) ? Math.round(bytes / Object.values(languages).reduce((sum, value) => sum + value, 0) * 1000) / 10 : 0 })) : [];
  const metrics: RepositoryMetrics = {
    repository: { owner: raw.owner.login, name: raw.name, fullName: raw.full_name, description: raw.description, htmlUrl: raw.html_url, defaultBranch: raw.default_branch, createdAt: raw.created_at, updatedAt: raw.updated_at, pushedAt: raw.pushed_at, license: raw.license?.spdx_id ?? raw.license?.name ?? null, topics: raw.topics },
    popularity: { stars: available(raw.stargazers_count), forks: available(raw.forks_count), watchers: available(raw.subscribers_count) },
    activity: { commits30d: complete30 ? available(commits30.length) : failed<number>('30 天提交窗口未完整获取'), commits90d: countOrUnavailable(commits, commitDates.length, '90 天提交'), lastCommitAt: commitDates[0] ? available(commitDates[0]) : commits ? notApplicable<string>() : failed<string>('最近提交不可用'), contributors: countOrUnavailable(contributors, contributors?.items.length ?? 0, '贡献者'), activeContributors: active, commitDays: complete30 ? commitDays : [] },
    maintenance: { issuesOpen: countOrUnavailable(issuesOpen, pureOpen.length, 'Open Issues'), issuesClosed90d: countOrUnavailable(issuesClosed, pureClosed.length, '90 天关闭 Issues'), prsOpen: countOrUnavailable(prsOpen, prsOpen?.items.length ?? 0, 'Open PRs'), prsMerged90d: countOrUnavailable(prsClosed, recentMerged.length, '90 天合并 PRs'), latestReleaseAt: releaseDates[0] ? available(releaseDates[0]) : releases ? notApplicable<string>() : failed<string>('Release 不可用'), releases90d: countOrUnavailable(releases, releaseDates.filter((date) => date >= since90).length, '90 天 Releases'), repositoryPushedAt: raw.pushed_at ? available(raw.pushed_at) : notApplicable<string>() },
    collaboration: { topContributorShare: concentration(1), top3ContributorShare: concentration(3), prContributorBreadth: countOrUnavailable(prsClosed, prBreadth, 'PR 作者') },
    documentation: { readme: has(/(^|\/)readme(\.[^/]*)?$/), license: raw.license ? available(true) : has(/(^|\/)(licen[cs]e|copying)(\.[^/]*)?$/), contributing: has(/(^|\/)contributing(\.[^/]*)?$/), security: has(/(^|\/)security(\.[^/]*)?$/), conduct: has(/(^|\/)code_of_conduct(\.[^/]*)?$/), docs: has(/^docs\//) },
    engineering: { ci: has(/^\.github\/workflows\//), tests: has(/(^|\/)(test|tests|__tests__)\/|(^|\/)[^/]+\.(test|spec)\.[^/]+$/), dependencies: deps, build, container },
    languages: normalizedLanguages,
    dataQuality: { coverage: 0, partial: warnings.length > 0, warnings, generatedAt: now, source: 'GitHub REST API', requestCount: client.stats.requestCount, sampled: warnings.some((warning) => warning.code.includes('SAMPLED')) },
  };
  return repositoryMetricsSchema.parse(metrics);
}
