import { describe, expect, it, vi } from 'vitest';
import { fetchRepositoryMetrics, filterPureIssues } from './repository';
import { GitHubClient } from './client';

const publicRepo = { owner: { login: 'owner' }, name: 'docker', full_name: 'owner/docker', description: null, html_url: 'https://github.com/owner/docker', default_branch: 'main', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', pushed_at: '2026-01-01T00:00:00Z', license: null, topics: [], stargazers_count: 0, forks_count: 0, subscribers_count: 0, private: false };

describe('GitHub mapping', () => {
  it('excludes Pull Requests returned by the Issues API', () => {
    expect(filterPureIssues([{ number: 1 }, { number: 2, pull_request: { url: 'x' } }])).toEqual([{ number: 1 }]);
  });
  it('rejects private repositories before requesting any secondary data', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ owner: { login: 'owner' }, name: 'secret', full_name: 'owner/secret', description: null, html_url: 'https://github.com/owner/secret', default_branch: 'main', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', pushed_at: null, license: null, topics: [], stargazers_count: 0, forks_count: 0, subscribers_count: 0, private: true })));
    await expect(fetchRepositoryMetrics(new GitHubClient('token', fetcher), { owner: 'owner', repo: 'secret' })).rejects.toMatchObject({ code: 'REPOSITORY_NOT_ACCESSIBLE' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('recognizes a Dockerfile even without a dependency manifest', async () => {
    const fetcher = vi.fn().mockImplementation(async (url: string) => {
      const path = new URL(url).pathname;
      if (path === '/repos/owner/docker') return new Response(JSON.stringify(publicRepo));
      if (path.includes('/git/trees/')) return new Response(JSON.stringify({ tree: [{ path: 'Dockerfile', type: 'blob' }], truncated: false }));
      if (path.endsWith('/languages')) return new Response('{}');
      return new Response('[]');
    });
    const metrics = await fetchRepositoryMetrics(new GitHubClient(undefined, fetcher), { owner: 'owner', repo: 'docker' }, false, true);
    expect(metrics.engineering.container).toMatchObject({ status: 'available', value: true });
  });
  it('keeps healthy sources when one successful response is malformed', async () => {
    const fetcher = vi.fn().mockImplementation(async (url: string) => {
      const path = new URL(url).pathname;
      if (path === '/repos/owner/docker') return new Response(JSON.stringify(publicRepo));
      if (path.endsWith('/languages')) return new Response('{"TypeScript":-5}');
      if (path.includes('/git/trees/')) return new Response(JSON.stringify({ tree: [{ path: 'README.md', type: 'blob' }], truncated: false }));
      return new Response('[]');
    });
    const metrics = await fetchRepositoryMetrics(new GitHubClient(undefined, fetcher), { owner: 'owner', repo: 'docker' }, true);
    expect(metrics.popularity.stars).toMatchObject({ status: 'available', value: 0 });
    expect(metrics.documentation.readme).toMatchObject({ status: 'available', value: true });
    expect(metrics.dataQuality.partial).toBe(true);
    expect(metrics.dataQuality.warnings.some((warning) => warning.code === 'GITHUB_INVALID_RESPONSE')).toBe(true);
  });
});
