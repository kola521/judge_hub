export const SCORE_VERSION = 'repo-health-v1' as const;
export const WEIGHTS = { activity: 25, maintenance: 20, collaboration: 20, documentation: 15, engineering: 15, community: 5 } as const;
export const THRESHOLDS = {
  commits90d: 90, activeContributors: 8, contributorBreadth: 12, prBreadth: 8,
  issueHandled: 0.75, prHandled: 0.75, releases90d: 3, recentDays: 30, staleDays: 365,
  stars: 10000, forks: 1500, watchers: 1000,
} as const;
