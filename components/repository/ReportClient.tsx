'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Activity, ArrowLeft, Check, CircleAlert, Clock3, ExternalLink, Github, Info, RefreshCw, Sparkles } from 'lucide-react';
import { ReportCharts } from '@/components/charts/ReportCharts';
import { rememberRepository } from '@/components/search/RecentRepositories';
import type { Evidence, MetricValue, RepositoryAnalysisResponse, ScoreDimension } from '@/lib/types/repository';

type Stage = 'connecting' | 'reading' | 'inspecting' | 'calculating' | 'ai' | 'done' | 'error';
const stages: { key: Stage; title: string }[] = [
  { key: 'connecting', title: 'Connecting to GitHub' }, { key: 'reading', title: 'Reading repository activity' },
  { key: 'inspecting', title: 'Inspecting project structure' }, { key: 'calculating', title: 'Calculating health score' },
  { key: 'ai', title: 'Generating AI insights' },
];
const statusText: Record<ScoreDimension['status'], string> = { excellent: 'Excellent', good: 'Good', warning: 'Needs attention', risk: 'At risk', unknown: 'Unknown' };
const compact = (number: number) => Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(number);
const metricText = <T extends number | string | boolean>(metric: MetricValue<T>, format?: (value: T) => string) => metric.status === 'not_applicable' ? '不适用' : metric.status === 'unavailable' || metric.value === null ? '不可用' : format ? format(metric.value) : typeof metric.value === 'boolean' ? (metric.value ? '已发现' : '未发现') : String(metric.value);
const dateText = (date: string | null) => date ? new Date(date).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }) : '不可用';

async function requestReport(url: string, body: { url: string; includeAI: boolean; fastOnly?: boolean; refresh?: boolean }): Promise<RepositoryAnalysisResponse> {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || '分析失败，请重试。');
  return data as RepositoryAnalysisResponse;
}

export function ReportClient({ owner, repo, debug }: { owner: string; repo: string; debug: boolean }) {
  const [report, setReport] = useState<RepositoryAnalysisResponse | null>(null);
  const [stage, setStage] = useState<Stage>('connecting');
  const [error, setError] = useState('');
  const [softError, setSoftError] = useState('');
  const runId = useRef(0);
  const fullName = owner + '/' + repo;
  const run = useCallback(async (refresh: boolean) => {
    const id = ++runId.current;
    let hasFast = false;
    const endpoint = '/api/analyze' + (debug ? '?debug=true' : '');
    setReport(null); setError(''); setSoftError(''); setStage('connecting');
    try {
      const fast = await requestReport(endpoint, { url: fullName, includeAI: false, fastOnly: true, refresh });
      if (id !== runId.current) return;
      hasFast = true;
      setReport(fast); setStage('reading');
      const complete = await requestReport(endpoint, { url: fullName, includeAI: false, refresh });
      if (id !== runId.current) return;
      setReport(complete); setStage('ai'); rememberRepository(complete.repository.fullName);
      try {
        const withAI = await requestReport(endpoint, { url: fullName, includeAI: true });
        if (id !== runId.current) return;
        setReport(withAI);
      } catch { if (id === runId.current) setSoftError('AI 解释暂不可用；评分和证据不受影响。'); }
      if (id === runId.current) setStage('done');
    } catch (caught) {
      if (id !== runId.current) return;
      const message = caught instanceof Error ? caught.message : '分析失败，请重试。';
      if (hasFast) { setSoftError('部分深度数据暂不可用：' + message); setStage('done'); }
      else { setError(message); setStage('error'); }
    }
  }, [fullName, debug]);
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) void run(false); });
    const activeRun = runId;
    return () => { cancelled = true; activeRun.current++; };
  }, [run]);
  const evidenceByKey = new Map<string, Evidence>(report?.health.dimensions.flatMap((dimension) => dimension.evidence).map((entry) => [entry.key, entry]) ?? []);
  const stageIndex = stages.findIndex((entry) => entry.key === stage);
  return <main className="site-shell report-shell"><header className="topbar"><Link href="/" className="brand"><span className="brand-mark"><Activity size={19} strokeWidth={2.4} /></span><span>Repository<span className="brand-light"> Doctor</span></span></Link><span className="topbar-tag"><span className="live-dot" /> V1.0 · PUBLIC REPOS</span><Link href="/" className="topbar-link"><ArrowLeft size={16} /> New analysis</Link></header>
    <div className="report-container"><Link href="/" className="back-link"><ArrowLeft size={15} /> 返回搜索</Link>
      <div className="report-page-heading"><div><span className="section-kicker">REPOSITORY REPORT</span><h1>{fullName}</h1><p>基于公开 GitHub 数据的可解释健康分析</p></div><button onClick={() => void run(true)} className="outline-button" disabled={stage !== 'done' && stage !== 'error'}><RefreshCw size={15} /> 重新分析</button></div>
      {stage !== 'done' && stage !== 'error' && <section className="progress-panel" aria-live="polite"><div className="progress-head"><span className="spinner" /> <strong>{stages[Math.max(stageIndex, 0)]?.title}</strong><span>ANALYZING</span></div><div className="progress-list">{stages.map((item, index) => <div className={index < stageIndex ? 'progress-step complete' : index === stageIndex ? 'progress-step active' : 'progress-step'} key={item.key}><span>{index < stageIndex ? <Check size={12} /> : index + 1}</span>{item.title}</div>)}</div></section>}
      {error && <section className="error-panel" role="alert"><CircleAlert size={24} /><div><h2>无法分析此仓库</h2><p>{error}</p><p>请检查地址、仓库可见性和 GitHub API 限流状态。</p><button className="primary-button" onClick={() => void run(true)}>重试分析</button></div></section>}
      {report && <><div className="report-top-grid"><RepositoryHeader report={report} /><Snapshot report={report} /></div>
        {(report.partial || softError || report.warnings.some((warning) => warning.code === 'GITHUB_RATE_LIMITED')) && <div className="warning-banner" role="status"><CircleAlert size={18} /><span><strong>部分结果</strong> · {softError || '部分 GitHub 信号不可用；缺失数据未按 0 计分。'} Coverage {Math.round(report.coverage * 100)}%。</span></div>}
        <KeyMetrics report={report} /><HealthBreakdown report={report} /><ReportCharts report={report} /><EngineeringSignals report={report} /><AIInsights report={report} loading={stage === 'ai'} evidenceByKey={evidenceByKey} />
        {report.warnings.length > 0 && <section className="report-section"><div className="report-section-heading"><div><span className="section-kicker">DATA QUALITY</span><h2>数据说明</h2></div></div><div className="panel warning-list">{report.warnings.map((warning, index) => <p key={warning.code + index}><strong>{warning.code}</strong><span>{warning.message}</span></p>)}</div></section>}
        {debug && report.debug && <section className="report-section"><div className="report-section-heading"><div><span className="section-kicker">DIAGNOSTICS</span><h2>Debug</h2></div></div><div className="panel debug-grid"><span>Requests <strong>{report.debug.requestCount}</strong></span><span>API latency <strong>{report.debug.durationMs} ms</strong></span><span>Cache <strong>{report.debug.cache}</strong></span><span>Rate remaining <strong>{report.debug.remaining ?? '—'} / {report.debug.limit ?? '—'}</strong></span><span>Coverage <strong>{Math.round(report.coverage * 100)}%</strong></span></div></section>}
        <p className="report-disclaimer"><Info size={15} /> Health Score 是可观察 GitHub 信号的启发式指标，不是软件质量、安全性、商业适用性或未来维护承诺的绝对判断。</p>
      </>}
    </div><footer className="footer"><span>Repository Doctor · repo-health-v1</span><span>Data source: GitHub REST API</span></footer>
  </main>;
}

function RepositoryHeader({ report }: { report: RepositoryAnalysisResponse }) {
  const repository = report.repository;
  return <section className="panel repository-header"><div className="repo-title-row"><span className="repo-avatar"><Github size={25} /></span><div><span className="section-kicker">GITHUB REPOSITORY</span><h2>{repository.fullName}</h2></div></div><p>{repository.description || '仓库未提供描述。'}</p><div className="repo-meta"><span>{repository.license || 'License 未标注'}</span><span>更新于 {dateText(repository.updatedAt)}</span><a href={repository.htmlUrl} target="_blank" rel="noreferrer">查看 GitHub <ExternalLink size={14} /></a></div>{repository.topics.length > 0 && <div className="topic-list">{repository.topics.slice(0, 6).map((topic) => <span key={topic}>{topic}</span>)}</div>}</section>;
}

function Snapshot({ report }: { report: RepositoryAnalysisResponse }) {
  const score = report.health.totalScore;
  return <section className="panel snapshot"><div className="snapshot-header"><span className="section-kicker">REPOSITORY SNAPSHOT</span><span className={'status-badge ' + report.health.status}>{statusText[report.health.status]}</span></div><div className="score-row"><div className="score-ring" style={{ background: 'conic-gradient(#5269df ' + (score ?? 0) + '%, #e9edf6 0)' }}><div><strong>{score ?? '—'}</strong><small>/ 100</small></div></div><div className="score-copy"><strong>Health Score</strong><p>{report.health.provisional ? '数据覆盖不足，分数为初步结果。' : '基于六维可观察信号计算。'}</p></div></div><div className="coverage-row"><div><strong>Analysis Coverage</strong><span>{Math.round(report.coverage * 100)}%</span></div><div className="coverage-track"><i style={{ width: Math.round(report.coverage * 100) + '%' }} /></div></div><div className="snapshot-footer"><Clock3 size={14} /> {dateText(report.generatedAt)} 生成 · GitHub REST API {report.partial ? '· Partial' : ''}</div></section>;
}

function KeyMetrics({ report }: { report: RepositoryAnalysisResponse }) {
  const m = report.metrics;
  const entries = [
    ['Stars', metricText(m.popularity.stars, compact)], ['Forks', metricText(m.popularity.forks, compact)],
    ['Contributors', metricText(m.activity.contributors, compact)], ['Commits · 30d', metricText(m.activity.commits30d, compact)],
    ['Last commit', metricText(m.activity.lastCommitAt, dateText)], ['Open issues', metricText(m.maintenance.issuesOpen, compact)],
  ];
  return <section className="report-section"><div className="report-section-heading"><div><span className="section-kicker">AT A GLANCE</span><h2>关键指标</h2></div><span className="section-aside">缺失数据以“不可用”显示</span></div><div className="metric-grid">{entries.map(([label, value]) => <div className="panel metric-card" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div></section>;
}

function HealthBreakdown({ report }: { report: RepositoryAnalysisResponse }) {
  return <section className="report-section"><div className="report-section-heading"><div><span className="section-kicker">SCORE EXPLAINED</span><h2>六维健康评分</h2></div><span className="section-aside">展开查看程序生成的 Evidence</span></div><div className="dimension-grid">{report.health.dimensions.map((dimension) => <details className="panel dimension-card" key={dimension.key}><summary><span className="dimension-title"><strong>{dimension.name}</strong><small>权重 {dimension.weight}%</small></span><span className={'dimension-number ' + dimension.status}>{dimension.score ?? '—'}<small> / 100</small></span></summary><div className="dimension-bar"><i style={{ width: (dimension.score ?? 0) + '%' }} /></div><span className={'dimension-status ' + dimension.status}>{statusText[dimension.status]}</span><div className="evidence-list">{dimension.evidence.length ? dimension.evidence.map((evidence) => <div key={evidence.key}><span className={'evidence-dot ' + evidence.polarity} /><div><strong>{evidence.metric}</strong><p>{evidence.description}</p><code>{evidence.key}</code></div></div>) : <p>该维度暂无可用 Evidence，状态保持 Unknown。</p>}</div></details>)}</div></section>;
}

function EngineeringSignals({ report }: { report: RepositoryAnalysisResponse }) {
  const d = report.metrics.documentation; const e = report.metrics.engineering;
  const entries: [string, MetricValue<boolean>][] = [['README', d.readme], ['License', d.license], ['Contributing', d.contributing], ['Security', d.security], ['Code of Conduct', d.conduct], ['docs/', d.docs], ['CI workflows', e.ci], ['Tests', e.tests], ['Dependencies', e.dependencies], ['Build config', e.build], ['Container / package', e.container]];
  return <section className="report-section"><div className="report-section-heading"><div><span className="section-kicker">REPOSITORY STRUCTURE</span><h2>文档与工程信号</h2></div><span className="section-aside">仅检测目录与元数据，不扫描源码质量</span></div><div className="panel signal-grid">{entries.map(([label, metric]) => <div className="signal-item" key={label}><span>{label}</span><strong className={metric.status === 'available' ? metric.value ? 'signal-yes' : 'signal-no' : 'signal-unknown'}>{metricText(metric)}</strong></div>)}</div></section>;
}

function AIInsights({ report, loading, evidenceByKey }: { report: RepositoryAnalysisResponse; loading: boolean; evidenceByKey: Map<string, Evidence> }) {
  const ai = report.aiAnalysis;
  const list = (items: { text: string; evidenceKeys: string[] }[]) => <div className="insight-list">{items.length ? items.map((item, index) => <div className="insight-item" key={index}><p>{item.text}</p>{item.evidenceKeys.length > 0 && <div className="insight-evidence">{item.evidenceKeys.map((key) => <span key={key} title={evidenceByKey.get(key)?.description}>{evidenceByKey.get(key)?.metric || key}</span>)}</div>}</div>) : <p className="muted">暂无有证据支持的内容。</p>}</div>;
  return <section className="report-section"><div className="report-section-heading"><div><span className="section-kicker">EVIDENCE-BOUND INTERPRETATION</span><h2>AI Insights</h2></div><span className="section-aside"><Sparkles size={15} /> AI 不参与算分</span></div>{loading ? <div className="panel ai-placeholder"><span className="spinner" /> 正在根据指标与 Evidence 生成解释…</div> : ai ? <div className="ai-grid"><div className="panel ai-summary"><span className="section-kicker">SUMMARY</span><p>{ai.summary}</p></div><div className="panel ai-column"><h3>Strengths</h3>{list(ai.strengths)}</div><div className="panel ai-column"><h3>Risks</h3>{list(ai.risks)}</div><div className="panel ai-column"><h3>Recommendations</h3>{list(ai.recommendations)}</div></div> : <div className="panel ai-placeholder"><CircleAlert size={18} /> AI 解释暂不可用。上方的 GitHub 指标、Health Score 和 Evidence 仍可查看。</div>}</section>;
}
