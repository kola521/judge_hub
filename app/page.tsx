import Link from 'next/link';
import { Activity, ArrowUpRight, ChartNoAxesCombined, ClipboardCheck, Github, ShieldCheck, Sparkles } from 'lucide-react';
import { RepositorySearch } from '@/components/search/RepositorySearch';
import { RecentRepositories } from '@/components/search/RecentRepositories';

const examples = [
  { name: 'facebook/react', note: '成熟的开源框架', icon: 'R' },
  { name: 'vercel/next.js', note: '高活跃 Web 项目', icon: 'N' },
  { name: 'kola521/judge_hub', note: '本项目仓库', icon: 'J' },
];

export default function Home() {
  return <main className="site-shell">
    <header className="topbar"><Link href="/" className="brand"><span className="brand-mark"><Activity size={19} strokeWidth={2.4} /></span><span>Repository<span className="brand-light"> Doctor</span></span></Link><span className="topbar-tag"><span className="live-dot" /> V1.0 · PUBLIC REPOS</span><a href="https://github.com/kola521/judge_hub" target="_blank" rel="noreferrer" className="topbar-link"><Github size={17} /> GitHub <ArrowUpRight size={14} /></a></header>
    <section className="hero"><div className="hero-content"><div className="eyebrow"><Sparkles size={14} /> EVIDENCE-BASED REPOSITORY ANALYSIS</div><h1>Know the health<br /><span>behind the repo.</span></h1><p className="hero-copy">输入公开 GitHub 仓库，获得基于真实数据的健康评分、逐项证据和可执行的改进建议。</p><RepositorySearch /><div className="hero-points"><span><ShieldCheck size={16} /> 真实 GitHub 数据</span><span><ChartNoAxesCombined size={16} /> 确定性六维评分</span><span><ClipboardCheck size={16} /> 每项结论有证据</span></div></div><div className="hero-visual" aria-hidden="true"><div className="visual-grid" /><div className="visual-card"><div className="visual-card-top"><span className="visual-avatar">R</span><span><strong>facebook/react</strong><small>REPOSITORY ANALYSIS</small></span><span className="visual-more">•••</span></div><div className="visual-score-row"><div className="visual-score"><span>86</span><small>HEALTH SCORE</small></div><div className="visual-bars"><i style={{ width: '87%' }} /><i style={{ width: '76%' }} /><i style={{ width: '92%' }} /><i style={{ width: '68%' }} /></div></div><div className="visual-card-bottom"><span className="visual-pill">● &nbsp; Good health</span><span>Coverage <strong>94%</strong></span></div></div><div className="visual-caption">Not a guess. A measurable starting point.</div></div></section>
    <section className="examples-section"><div className="section-heading"><div><span className="section-kicker">TRY AN EXAMPLE</span><h2>Explore a repository</h2></div><span className="section-aside">无需登录 · 支持公开仓库</span></div><div className="example-grid">{examples.map((example) => <Link className="example-card" href={'/repo/' + example.name} key={example.name}><span className="example-icon">{example.icon}</span><span className="example-meta"><strong>{example.name}</strong><small>{example.note}</small></span><ArrowUpRight size={18} /></Link>)}</div><RecentRepositories /></section>
    <footer className="footer"><span>Repository Doctor · repo-health-v1</span><span>健康分是可观察信号的启发式指标，不代表代码质量或安全保证。</span></footer>
  </main>;
}
