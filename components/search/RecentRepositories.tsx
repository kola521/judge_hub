'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Clock3 } from 'lucide-react';

export const RECENT_KEY = 'repository-doctor-recent-v1';
export function rememberRepository(fullName: string) {
  try {
    const previous = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') as string[];
    localStorage.setItem(RECENT_KEY, JSON.stringify([fullName, ...previous.filter((item) => item !== fullName)].slice(0, 5)));
  } catch { /* local storage can be disabled */ }
}

export function RecentRepositories() {
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => {
    const timer = setTimeout(() => { try { setRecent(JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') as string[]); } catch { /* unavailable */ } }, 0);
    return () => clearTimeout(timer);
  }, []);
  if (!recent.length) return null;
  return <section className="recent-section" aria-label="最近分析"><div className="section-kicker"><Clock3 size={15} aria-hidden="true" /> 最近分析</div><div className="recent-list">{recent.map((item) => <Link href={'/repo/' + item} key={item}>{item}<span>↗</span></Link>)}</div></section>;
}
