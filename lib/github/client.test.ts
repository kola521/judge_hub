import { describe, expect, it, vi } from 'vitest';
import { GitHubClient, GitHubError, httpStatusForGitHubError } from './client';

describe('GitHubClient', () => {
  it('follows Link pagination within a cap', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response('[{"id":1}]', { headers: { link: '<https://api.github.com/repos/a/b/issues?page=2>; rel="next"' } }))
      .mockResolvedValueOnce(new Response('[{"id":2}]'));
    const result = await new GitHubClient(undefined, fetcher).list<{ id: number }>('/repos/a/b/issues', 2);
    expect(result.items.map((item) => item.id)).toEqual([1, 2]);
    expect(result.truncated).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('stops on primary rate limit without retries', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1800000000' } }));
    await expect(new GitHubClient(undefined, fetcher).get('/repos/a/b')).rejects.toMatchObject({ code: 'GITHUB_RATE_LIMITED' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('does not retry a server error after the response reports zero remaining requests', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status: 503, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1800000000' } }));
    await expect(new GitHubClient(undefined, fetcher).get('/repos/a/rate-bound')).rejects.toMatchObject({ code: 'GITHUB_RATE_LIMITED' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('maps 404 to a repository access error', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status: 404 }));
    await expect(new GitHubClient(undefined, fetcher).get('/repos/a/b')).rejects.toBeInstanceOf(GitHubError);
  });
  it('uses ETag on a conditional refresh and reuses 304 data', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response('{"name":"repo"}', { headers: { etag: '"v1"' } }))
      .mockResolvedValueOnce(new Response(null, { status: 304 }));
    const client = new GitHubClient(undefined, fetcher);
    expect(await client.get('/repos/etag/repo')).toEqual({ name: 'repo' });
    expect(await client.get('/repos/etag/repo', true)).toEqual({ name: 'repo' });
    expect(fetcher.mock.calls[1][1].headers['If-None-Match']).toBe('"v1"');
  });
  it('distinguishes forbidden access from rate limiting', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{"message":"Resource not accessible"}', { status: 403, headers: { 'x-ratelimit-remaining': '57' } }));
    await expect(new GitHubClient(undefined, fetcher).get('/repos/forbidden/repo')).rejects.toMatchObject({ code: 'REPOSITORY_NOT_ACCESSIBLE' });
  });
  it('maps abort to timeout without retrying', async () => {
    const fetcher = vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError'));
    await expect(new GitHubClient(undefined, fetcher).get('/repos/timeout/repo')).rejects.toMatchObject({ code: 'GITHUB_TIMEOUT' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('retries a transient malformed JSON response before marking the source unavailable', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response('{"incomplete":', { status: 200 }))
      .mockResolvedValueOnce(new Response('{"name":"recovered"}', { status: 200 }));
    expect(await new GitHubClient(undefined, fetcher).get('/repos/retry/json')).toEqual({ name: 'recovered' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('stops queued requests after a response exhausts the primary budget', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}', { headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600) } }));
    const client = new GitHubClient(undefined, fetcher);
    await client.get('/repos/budget/one');
    await expect(client.get('/repos/budget/two')).rejects.toMatchObject({ code: 'GITHUB_RATE_LIMITED' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('maps access denial separately from rate limiting at the API boundary', () => {
    expect(httpStatusForGitHubError(new GitHubError('REPOSITORY_NOT_ACCESSIBLE', 'denied', 403))).toBe(404);
    expect(httpStatusForGitHubError(new GitHubError('GITHUB_RATE_LIMITED', 'limited', 403))).toBe(429);
  });
});
