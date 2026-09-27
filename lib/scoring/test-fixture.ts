import { available, type RepositoryMetrics } from '../types/repository';

export function fixtureMetrics(): RepositoryMetrics {
  const now = new Date().toISOString();
  const yes = available(true);
  return {
    repository: { owner: 'example', name: 'repo', fullName: 'example/repo', description: null, htmlUrl: 'https://github.com/example/repo', defaultBranch: 'main', createdAt: now, updatedAt: now, pushedAt: now, license: 'MIT', topics: [] },
    popularity: { stars: available(100), forks: available(20), watchers: available(10) },
    activity: { commits30d: available(30), commits90d: available(90), lastCommitAt: available(now), contributors: available(10), activeContributors: available(5), commitDays: [] },
    maintenance: { issuesOpen: available(5), issuesClosed90d: available(15), prsOpen: available(2), prsMerged90d: available(8), latestReleaseAt: available(now), releases90d: available(2), repositoryPushedAt: available(now) },
    collaboration: { topContributorShare: available(0.3), top3ContributorShare: available(0.6), prContributorBreadth: available(4) },
    documentation: { readme: yes, license: yes, contributing: yes, security: yes, conduct: yes, docs: yes },
    engineering: { ci: yes, tests: yes, dependencies: yes, build: yes, container: yes },
    languages: [{ name: 'TypeScript', bytes: 100, percentage: 100 }],
    dataQuality: { coverage: 1, partial: false, warnings: [], generatedAt: now, source: 'GitHub REST API', requestCount: 1, sampled: false },
  };
}
