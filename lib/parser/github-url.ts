export interface RepositoryRef { owner: string; repo: string }

export function parseGitHubRepository(input: string): RepositoryRef {
  const raw = input.trim().replace(/\/+$/, '').replace(/\.git$/i, '');
  const candidate = /^github\.com\//i.test(raw) ? 'https://' + raw : raw;
  let path = candidate;
  if (/^https?:\/\//i.test(candidate)) {
    let url: URL;
    try { url = new URL(candidate); } catch { throw new Error('请输入有效的 GitHub 仓库地址。'); }
    if (url.hostname.toLowerCase() !== 'github.com' || url.username || url.password || url.search || url.hash) {
      throw new Error('仅支持公开 GitHub 仓库地址。');
    }
    path = url.pathname.replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '');
  }
  const parts = path.split('/');
  if (parts.length !== 2 || parts.some((part) => !/^[A-Za-z0-9_.-]+$/.test(part) || part === '.' || part === '..')) {
    throw new Error('请输入 owner/repo 或 github.com/owner/repo。');
  }
  return { owner: parts[0], repo: parts[1] };
}
