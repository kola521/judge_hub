'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Github, Search } from 'lucide-react';
import { parseGitHubRepository } from '@/lib/parser/github-url';

export function RepositorySearch({ initialValue = '' }: { initialValue?: string }) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState('');
  const router = useRouter();
  function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      const { owner, repo } = parseGitHubRepository(value);
      setError('');
      router.push('/repo/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo));
    } catch (caught) { setError(caught instanceof Error ? caught.message : '请输入有效仓库地址。'); }
  }
  return <form onSubmit={submit} className="search-form">
    <label htmlFor="repository-url" className="field-label">公开 GitHub 仓库</label>
    <div className="search-box"><Github aria-hidden="true" size={21} className="search-icon" />
      <input id="repository-url" autoComplete="off" spellCheck={false} value={value} onChange={(event) => { setValue(event.target.value); setError(''); }} placeholder="github.com/owner/repository" aria-invalid={Boolean(error)} aria-describedby={error ? 'search-error' : 'search-hint'} />
      <button type="submit" disabled={!value.trim()}><Search size={17} aria-hidden="true" /><span>Analyze repository</span><ArrowRight size={16} aria-hidden="true" /></button>
    </div>
    <p id={error ? 'search-error' : 'search-hint'} role={error ? 'alert' : undefined} className={error ? 'field-error' : 'field-hint'}>{error || '支持 https://github.com/owner/repo、github.com/owner/repo 和 owner/repo'}</p>
  </form>;
}
