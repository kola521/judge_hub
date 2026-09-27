'use client';

import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { RepositoryAnalysisResponse } from '@/lib/types/repository';

const COLORS = ['#4763e4', '#9b79e6', '#53a9a0', '#e2a554', '#a5adbe'];

export function ReportCharts({ report }: { report: RepositoryAnalysisResponse }) {
  const radar = report.health.dimensions.map((dimension) => ({ name: dimension.name, score: dimension.score }));
  const commits = report.metrics.activity.commitDays;
  const top = report.metrics.languages.slice(0, 5);
  const other = report.metrics.languages.slice(5).reduce((sum, language) => sum + language.percentage, 0);
  const languages = [...top.map(({ name, percentage }) => ({ name, value: percentage })), ...(other > 0 ? [{ name: '其他', value: Math.round(other * 10) / 10 }] : [])];
  return <section className="report-section"><div className="report-section-heading"><div><span className="section-kicker">可视化指标</span><h2>数据趋势</h2></div><span className="section-aside">图表与文字摘要同步展示</span></div><div className="chart-grid">
    <article className="panel chart-panel"><div className="panel-title"><h3>六维雷达图</h3><span>六维比较</span></div><div className="chart-wrap">{radar.some((entry) => entry.score !== null) ? <ResponsiveContainer width="100%" height="100%"><RadarChart data={radar}><PolarGrid stroke="#dbe0ec" /><PolarAngleAxis dataKey="name" tick={{ fill: '#6d7790', fontSize: 11 }} /><Radar dataKey="score" stroke="#5269df" fill="#6678e8" fillOpacity={0.24} connectNulls={false} /><Tooltip formatter={(value) => value == null ? '不可用' : String(value)} /></RadarChart></ResponsiveContainer> : <div className="chart-empty">暂无可绘制维度</div>}</div><p className="chart-summary">{radar.map((entry) => entry.name + ' ' + (entry.score ?? '不可用')).join(' · ')}</p></article>
    <article className="panel chart-panel"><div className="panel-title"><h3>提交活动</h3><span>最近 30 天</span></div><div className="chart-wrap">{commits.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={commits}><CartesianGrid vertical={false} stroke="#edf0f5" /><XAxis dataKey="date" tick={{ fill: '#8390a5', fontSize: 10 }} tickFormatter={(value: string) => value.slice(5)} minTickGap={18} /><YAxis allowDecimals={false} tick={{ fill: '#8390a5', fontSize: 10 }} width={28} /><Tooltip /><Bar dataKey="count" fill="#5269df" radius={[3, 3, 0, 0]} maxBarSize={16} /></BarChart></ResponsiveContainer> : <div className="chart-empty">30 天提交趋势不可用</div>}</div><p className="chart-summary">{report.metrics.activity.commits30d.status === 'available' ? '最近 30 天共 ' + report.metrics.activity.commits30d.value + ' 次提交。' : '提交数据不可用或采样未覆盖完整窗口。'}</p></article>
    <article className="panel chart-panel"><div className="panel-title"><h3>编程语言占比</h3><span>按代码字节数</span></div><div className="chart-wrap">{languages.length ? <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={languages} dataKey="value" nameKey="name" innerRadius={58} outerRadius={90} paddingAngle={2}>{languages.map((entry, index) => <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />)}</Pie><Tooltip formatter={(value) => String(value) + '%'} /></PieChart></ResponsiveContainer> : <div className="chart-empty">语言数据不可用</div>}</div><div className="language-legend">{languages.map((entry, index) => <span key={entry.name}><i style={{ background: COLORS[index % COLORS.length] }} />{entry.name} {entry.value}%</span>)}</div></article>
  </div></section>;
}
