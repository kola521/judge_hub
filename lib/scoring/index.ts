import type { Evidence, HealthScore, MetricValue, RepositoryMetrics, ScoreDimension } from '../types/repository';
import { SCORE_VERSION, THRESHOLDS, WEIGHTS } from './config';

type Scalar = number | boolean | string;
type Item = { key: string; label: string; weight: number; metric: MetricValue<Scalar>; score: (value: Scalar) => number; polarity?: (value: Scalar) => Evidence['polarity'] };
const cap = (number: number) => Math.max(0, Math.min(100, number));
const linear = (number: number, target: number) => cap(number / target * 100);
const logScale = (number: number, target: number) => cap(Math.log1p(number) / Math.log1p(target) * 100);
const boolScore = (value: Scalar) => value === true ? 100 : 0;
const numberScore = (target: number) => (value: Scalar) => linear(Number(value), target);
const ratioScore = (target: number) => (value: Scalar) => linear(Number(value), target);
const item = (key: string, label: string, weight: number, metric: MetricValue<Scalar>, score: Item['score']): Item => ({ key, label, weight, metric, score });
const status = (score: number | null): ScoreDimension['status'] => score === null ? 'unknown' : score >= 85 ? 'excellent' : score >= 70 ? 'good' : score >= 50 ? 'warning' : 'risk';

export function calculateHealth(metrics: RepositoryMetrics): HealthScore {
  const m = metrics;
  const dateScore = (value: Scalar) => {
    const days = Math.max(0, (Date.parse(m.dataQuality.generatedAt) - Date.parse(String(value))) / 86_400_000);
    return cap((THRESHOLDS.staleDays - days) / (THRESHOLDS.staleDays - THRESHOLDS.recentDays) * 100);
  };
  const ratio = (numerator: MetricValue<number>, denominator: MetricValue<number>): MetricValue<number> => {
    if (numerator.status !== 'available' || denominator.status !== 'available') return { value: null, status: 'unavailable' };
    return { value: (numerator.value ?? 0) / Math.max(1, (numerator.value ?? 0) + (denominator.value ?? 0)), status: 'available' };
  };
  const specs: { key: keyof typeof WEIGHTS; name: string; items: Item[] }[] = [
    { key: 'activity', name: '活跃度', items: [
      item('activity.commits30d', '30 天提交', 22.5, m.activity.commits30d, numberScore(THRESHOLDS.commits90d / 3)),
      item('activity.commits90d', '90 天提交', 22.5, m.activity.commits90d, numberScore(THRESHOLDS.commits90d)),
      item('activity.lastCommitAt', '最近提交', 30, m.activity.lastCommitAt, dateScore),
      item('activity.activeContributors', '90 天活跃贡献者', 25, m.activity.activeContributors, numberScore(THRESHOLDS.activeContributors)),
    ] },
    { key: 'maintenance', name: '维护情况', items: [
      item('maintenance.issueHandling', '90 天 Issue 处理', 25, ratio(m.maintenance.issuesClosed90d, m.maintenance.issuesOpen), ratioScore(THRESHOLDS.issueHandled)),
      item('maintenance.prHandling', '90 天 PR 处理', 25, ratio(m.maintenance.prsMerged90d, m.maintenance.prsOpen), ratioScore(THRESHOLDS.prHandled)),
      item('maintenance.latestReleaseAt', '最近发布', 12.5, m.maintenance.latestReleaseAt, dateScore),
      item('maintenance.releases90d', '90 天发布次数', 12.5, m.maintenance.releases90d, numberScore(THRESHOLDS.releases90d)),
      item('maintenance.repositoryPushedAt', '仓库更新', 25, m.maintenance.repositoryPushedAt, dateScore),
    ] },
    { key: 'collaboration', name: '协作情况', items: [
      item('activity.contributors', '贡献者广度', 30, m.activity.contributors, numberScore(THRESHOLDS.contributorBreadth)),
      item('activity.activeContributors', '活跃贡献者', 30, m.activity.activeContributors, numberScore(THRESHOLDS.activeContributors)),
      item('collaboration.topContributorShare', '头部贡献者占比', 12.5, m.collaboration.topContributorShare, (value) => cap((1 - Number(value)) * 125)),
      item('collaboration.top3ContributorShare', '前三贡献者占比', 12.5, m.collaboration.top3ContributorShare, (value) => cap((1 - Number(value)) * 150)),
      item('collaboration.prContributorBreadth', 'PR 协作广度', 15, m.collaboration.prContributorBreadth, numberScore(THRESHOLDS.prBreadth)),
    ] },
    { key: 'documentation', name: '文档完整度', items: [
      item('documentation.readme', 'README', 30, m.documentation.readme, boolScore),
      item('documentation.license', '开源许可证', 20, m.documentation.license, boolScore),
      item('documentation.contributing', '贡献指南', 20, m.documentation.contributing, boolScore),
      item('documentation.security', '安全说明', 15, m.documentation.security, boolScore),
      item('documentation.conduct', '行为准则', 10, m.documentation.conduct, boolScore),
      item('documentation.docs', '文档目录', 5, m.documentation.docs, boolScore),
    ] },
    { key: 'engineering', name: '工程实践', items: [
      item('engineering.ci', '持续集成', 30, m.engineering.ci, boolScore),
      item('engineering.tests', '测试信号', 25, m.engineering.tests, boolScore),
      item('engineering.dependencies', '依赖清单', 20, m.engineering.dependencies, boolScore),
      item('engineering.build', '构建配置', 15, m.engineering.build, boolScore),
      item('engineering.container', '容器或打包信号', 10, m.engineering.container, boolScore),
    ] },
    { key: 'community', name: '社区关注', items: [
      item('popularity.stars', '收藏数', 40, m.popularity.stars, (value) => logScale(Number(value), THRESHOLDS.stars)),
      item('popularity.forks', '派生数', 35, m.popularity.forks, (value) => logScale(Number(value), THRESHOLDS.forks)),
      item('popularity.watchers', '关注数', 25, m.popularity.watchers, (value) => logScale(Number(value), THRESHOLDS.watchers)),
    ] },
  ];
  let availableWeight = 0;
  let applicableWeight = 0;
  const rawDimensions: { score: number; weight: number }[] = [];
  const dimensions = specs.map((spec): ScoreDimension => {
    let numerator = 0;
    let denominator = 0;
    const evidence: Evidence[] = [];
    for (const entry of spec.items) {
      const globalWeight = WEIGHTS[spec.key] * entry.weight / 100;
      if (entry.metric.status === 'not_applicable') continue;
      applicableWeight += globalWeight;
      if (entry.metric.status !== 'available' || entry.metric.value === null) continue;
      availableWeight += globalWeight;
      const signalScore = entry.score(entry.metric.value);
      numerator += signalScore * entry.weight;
      denominator += entry.weight;
      evidence.push({ key: entry.key, metric: entry.label, value: entry.metric.value, description: entry.label + '：' + String(entry.metric.value), polarity: signalScore >= 70 ? 'positive' : signalScore < 50 ? 'negative' : 'neutral', observedAt: entry.metric.observedAt });
    }
    const rawScore = denominator > 0 ? numerator / denominator : null;
    if (rawScore !== null) rawDimensions.push({ score: rawScore, weight: WEIGHTS[spec.key] });
    const score = rawScore !== null ? Math.round(rawScore) : null;
    return { key: spec.key, name: spec.name, score, weight: WEIGHTS[spec.key], status: status(score), evidence };
  });
  const totalScore = rawDimensions.length ? Math.round(rawDimensions.reduce((sum, dimension) => sum + dimension.score * dimension.weight, 0) / rawDimensions.reduce((sum, dimension) => sum + dimension.weight, 0)) : null;
  const coverage = applicableWeight ? Math.round(availableWeight / applicableWeight * 1000) / 1000 : 0;
  return { totalScore, status: status(totalScore), scoreVersion: SCORE_VERSION, coverage, provisional: coverage < 0.7, dimensions };
}
