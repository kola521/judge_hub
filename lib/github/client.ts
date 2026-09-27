type CacheEntry = { data: unknown; expiresAt: number; etag?: string; lastModified?: string; link?: string | null };
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<{ data: unknown; link: string | null }>>();
const API = 'https://api.github.com';

export class GitHubError extends Error {
  constructor(public code: string, message: string, public status: number, public retryAt?: string) { super(message); }
}

export function httpStatusForGitHubError(error: GitHubError): number {
  if (error.code === 'GITHUB_RATE_LIMITED') return 429;
  if (error.code === 'REPOSITORY_NOT_ACCESSIBLE') return 404;
  if (error.code === 'GITHUB_TIMEOUT') return 504;
  return 502;
}

export class GitHubClient {
  readonly stats = { requestCount: 0, cacheHits: 0, durationMs: 0, remaining: null as number | null, limit: null as number | null };
  private rateLimitedUntil = 0;
  constructor(private token = process.env.GITHUB_TOKEN, private fetcher: typeof fetch = fetch) {}

  private url(path: string): string {
    const url = new URL(path, API);
    if (url.origin !== API) throw new GitHubError('INTERNAL_ERROR', 'Invalid GitHub API URL', 500);
    return url.toString();
  }

  private async fetchJson<T>(path: string, refresh = false): Promise<{ data: T; link: string | null }> {
    const url = this.url(path);
    const key = url;
    const existing = cache.get(key);
    if (!refresh && existing && existing.expiresAt > Date.now()) {
      this.stats.cacheHits++;
      return { data: existing.data as T, link: existing.link ?? null };
    }
    const running = inflight.get(key);
    if (running) return running as Promise<{ data: T; link: string | null }>;
    const task = this.fetchNetwork<T>(url, existing).then((result) => {
      cache.set(key, { data: result.data, link: result.link, etag: result.etag, lastModified: result.lastModified, expiresAt: Date.now() + 7 * 60_000 });
      return { data: result.data, link: result.link };
    });
    inflight.set(key, task as Promise<{ data: unknown; link: string | null }>);
    try { return await task; } finally { inflight.delete(key); }
  }

  private async fetchNetwork<T>(url: string, cached?: CacheEntry): Promise<{ data: T; link: string | null; etag?: string; lastModified?: string }> {
    if (this.rateLimitedUntil > Date.now()) throw new GitHubError('GITHUB_RATE_LIMITED', 'GitHub API 暂时限制请求，请稍后重试。', 429, new Date(this.rateLimitedUntil).toISOString());
    for (let attempt = 0; attempt < 3; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 9_000);
      const start = Date.now();
      try {
        this.stats.requestCount++;
        const response = await this.fetcher(url, { signal: controller.signal, headers: {
          Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
          ...(this.token ? { Authorization: 'Bearer ' + this.token } : {}),
          ...(cached?.etag ? { 'If-None-Match': cached.etag } : cached?.lastModified ? { 'If-Modified-Since': cached.lastModified } : {}),
        } });
        this.stats.durationMs += Date.now() - start;
        const remaining = response.headers.get('x-ratelimit-remaining');
        const limit = response.headers.get('x-ratelimit-limit');
        const resetHeader = response.headers.get('x-ratelimit-reset');
        if (remaining !== null) this.stats.remaining = Number(remaining);
        if (limit !== null) this.stats.limit = Number(limit);
        if (remaining === '0') this.rateLimitedUntil = resetHeader ? Number(resetHeader) * 1000 : Date.now() + 60_000;
        if (response.status === 304 && cached) return { data: cached.data as T, link: cached.link ?? null, etag: cached.etag, lastModified: cached.lastModified };
        if (!response.ok) {
          const reset = resetHeader;
          const retryAfter = response.headers.get('retry-after');
          const retryAt = retryAfter ? new Date(Date.now() + Number(retryAfter) * 1000).toISOString() : reset ? new Date(Number(reset) * 1000).toISOString() : undefined;
          if (response.status === 429 || retryAfter) this.rateLimitedUntil = retryAt ? Date.parse(retryAt) : Date.now() + 60_000;
          if (response.status === 429 || remaining === '0' || retryAfter) throw new GitHubError('GITHUB_RATE_LIMITED', 'GitHub API 暂时限制请求，请稍后重试。', response.status, retryAt);
          if (response.status === 403) {
            const body = await response.text();
            if (/rate limit/i.test(body)) throw new GitHubError('GITHUB_RATE_LIMITED', 'GitHub API 暂时限制请求，请稍后重试。', 403, retryAt);
            throw new GitHubError('REPOSITORY_NOT_ACCESSIBLE', '仓库不可访问或当前凭据无权访问。', 403);
          }
          if (response.status === 404) throw new GitHubError('REPOSITORY_NOT_ACCESSIBLE', '仓库不存在、不是公开仓库，或当前凭据无权访问。', 404);
          if (response.status >= 500 && attempt < 2) { await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt + Math.random() * 100)); continue; }
          throw new GitHubError('GITHUB_REQUEST_FAILED', 'GitHub 数据请求失败。', response.status);
        }
        if (response.status === 204) return { data: [] as T, link: null };
        let data: T;
        try { data = await response.json() as T; } catch {
          if (attempt < 2 && this.rateLimitedUntil <= Date.now()) { await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt)); continue; }
          throw new GitHubError('GITHUB_INVALID_RESPONSE', 'GitHub 返回了无法解析的数据。', 502);
        }
        return { data, link: response.headers.get('link'), etag: response.headers.get('etag') ?? undefined, lastModified: response.headers.get('last-modified') ?? undefined };
      } catch (error) {
        if (error instanceof GitHubError) throw error;
        if (attempt < 2 && !(error instanceof DOMException && error.name === 'AbortError')) { await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt + Math.random() * 100)); continue; }
        throw new GitHubError(error instanceof DOMException && error.name === 'AbortError' ? 'GITHUB_TIMEOUT' : 'GITHUB_REQUEST_FAILED', '连接 GitHub 超时或网络不可用。', 504);
      } finally { clearTimeout(timer); }
    }
    throw new GitHubError('GITHUB_REQUEST_FAILED', 'GitHub 数据请求失败。', 502);
  }

  get<T>(path: string, refresh = false): Promise<T> { return this.fetchJson<T>(path, refresh).then((result) => result.data); }

  async list<T>(path: string, maxPages = 3, refresh = false): Promise<{ items: T[]; truncated: boolean }> {
    const items: T[] = [];
    let next: string | null = path;
    for (let page = 0; page < maxPages && next; page++) {
      const result: { data: T[]; link: string | null } = await this.fetchJson<T[]>(next, refresh);
      if (!Array.isArray(result.data)) throw new GitHubError('GITHUB_INVALID_RESPONSE', 'GitHub 列表格式无效。', 502);
      items.push(...result.data);
      const match: RegExpMatchArray | null = result.link?.match(/<([^>]+)>;\s*rel="next"/) ?? null;
      next = match ? this.url(match[1]) : null;
    }
    return { items, truncated: next !== null };
  }
}
