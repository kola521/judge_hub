import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { AIAnalysis, AnalysisWarning, HealthScore, RepositoryMetrics } from '../types/repository';

const itemSchema = z.object({ text: z.string().min(1).max(400), evidenceKeys: z.array(z.string()).min(1).max(5) });
const schema = z.object({ summary: z.string().min(1).max(600), summaryEvidenceKeys: z.array(z.string()).min(1).max(5), strengths: z.array(itemSchema).max(4), risks: z.array(itemSchema).max(4), recommendations: z.array(itemSchema).max(4) });
const PROMPT_VERSION = 'evidence-v4-deepseek';
const cache = new Map<string, { expiresAt: number; analysis: AIAnalysis }>();
const englishLabels: Record<string, string> = {
  excellent: '表现优秀', good: '良好', warning: '需关注', risk: '风险较高', unknown: '未知',
  activity: '活跃度', maintenance: '维护情况', collaboration: '协作情况', documentation: '文档完整度', engineering: '工程实践', community: '社区关注',
  available: '可用', unavailable: '数据不可用', not_applicable: '不适用',
};

function localizeAIText(value: string): string {
  return value.replace(/\b(excellent|good|warning|risk|unknown|activity|maintenance|collaboration|documentation|engineering|community|available|unavailable|not_applicable)\b/gi, (label) => englishLabels[label.toLowerCase()]);
}
function buildInsightSchema(validKeys: Set<string>) {
  const evidenceKeysSchema = { type: 'array', items: { type: 'string', enum: [...validKeys] }, minItems: 1, maxItems: 5 };
  const insightItemSchema = { type: 'object', additionalProperties: false, required: ['text', 'evidenceKeys'], properties: { text: { type: 'string' }, evidenceKeys: evidenceKeysSchema } };
  return { type: 'object', additionalProperties: false, required: ['summary', 'summaryEvidenceKeys', 'strengths', 'risks', 'recommendations'], properties: {
    summary: { type: 'string' },
    summaryEvidenceKeys: evidenceKeysSchema,
    strengths: { type: 'array', items: insightItemSchema, maxItems: 4 },
    risks: { type: 'array', items: insightItemSchema, maxItems: 4 },
    recommendations: { type: 'array', items: insightItemSchema, maxItems: 4 },
  } };
}

export function validateAIAnalysis(raw: unknown, validKeys: Set<string>): AIAnalysis {
  const parsed = schema.parse(raw);
  const allKeys = [...parsed.summaryEvidenceKeys, ...parsed.strengths.flatMap((item) => item.evidenceKeys), ...parsed.risks.flatMap((item) => item.evidenceKeys), ...parsed.recommendations.flatMap((item) => item.evidenceKeys)];
  if (allKeys.some((key) => !validKeys.has(key))) throw new Error('AI output refers to unknown evidence');
  return { summary: parsed.summary, strengths: parsed.strengths, risks: parsed.risks, recommendations: parsed.recommendations };
}

type InsightResult = { analysis: AIAnalysis | null; warning?: AnalysisWarning };

export async function generateRepositoryInsight(metrics: RepositoryMetrics, health: HealthScore, fetcher: typeof fetch = fetch): Promise<InsightResult> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return { analysis: null, warning: { code: 'AI_UNAVAILABLE', message: '未配置 AI Key；指标和程序评分仍可使用。' } };
  const evidence = health.dimensions.flatMap((dimension) => dimension.evidence);
  if (evidence.length < 2) return { analysis: null, warning: { code: 'AI_UNAVAILABLE', message: '可用证据不足，已跳过 AI 解释。' } };
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-flash';
  const input = { repository: metrics.repository.fullName, metrics: { popularity: metrics.popularity, activity: metrics.activity, maintenance: metrics.maintenance, collaboration: metrics.collaboration, documentation: metrics.documentation, engineering: metrics.engineering, languages: metrics.languages }, health, coverage: health.coverage, partial: metrics.dataQuality.partial, warnings: metrics.dataQuality.warnings };
  const digest = createHash('sha256').update(JSON.stringify({ input, provider: 'deepseek', model, promptVersion: PROMPT_VERSION, scoreVersion: health.scoreVersion })).digest('hex');
  const cached = cache.get(digest);
  if (cached && cached.expiresAt > Date.now()) return { analysis: cached.analysis };
  const validKeys = new Set(evidence.map((entry) => entry.key));
  const insightSchema = buildInsightSchema(validKeys);
  const instructions = '你是 GitHub 仓库指标解释器。只能依据输入的指标、程序分数和 Evidence 写简洁中文 JSON。不得调用外部数据，不得重新评分，不得推断代码质量、安全性、项目阶段或仓库历史，不得猜测原因或未来走势。只陈述有数值或状态及其 Evidence 直接支持的事实；unavailable 表示数据不可用，不能当成 0。输出的正文必须使用简体中文，内部评分状态和维度名也应翻译，不要原样输出英文枚举。summaryEvidenceKeys 必须列出支持 summary 的现有 evidenceKey；每项 strength、risk 和 recommendation 也必须引用至少一个现有 evidenceKey，每个引用列表最多 5 个 key。strengths、risks、recommendations 各最多 4 项；没有证据的风险返回空数组。summary 1-2 句，建议具体可执行。';
  let lastCode = 'AI_UNAVAILABLE';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetcher('https://api.deepseek.com/responses', { method: 'POST', signal: AbortSignal.timeout(25_000), headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, instructions: instructions + (attempt ? ' 上一次输出无效，请修复 JSON 结构和证据引用。' : ''), input: JSON.stringify(input), reasoning: { effort: 'none' }, max_output_tokens: 1800, text: { format: { type: 'json_schema', name: 'repository_insight', strict: true, schema: insightSchema } } }) });
      if (!response.ok) throw new Error('AI provider status ' + response.status);
      const body = await response.json() as { output?: { content?: { type: string; text?: string }[] }[] };
      const output = body.output?.flatMap((item) => item.content ?? []).find((item) => item.type === 'output_text')?.text;
      if (!output) throw new Error('AI output missing');
      const validated = validateAIAnalysis(JSON.parse(output), validKeys);
      const analysis = { summary: localizeAIText(validated.summary), strengths: validated.strengths.map((item) => ({ ...item, text: localizeAIText(item.text) })), risks: validated.risks.map((item) => ({ ...item, text: localizeAIText(item.text) })), recommendations: validated.recommendations.map((item) => ({ ...item, text: localizeAIText(item.text) })) };
      cache.set(digest, { analysis, expiresAt: Date.now() + 7 * 60_000 });
      return { analysis };
    } catch (error) {
      lastCode = error instanceof DOMException && error.name === 'TimeoutError' ? 'AI_TIMEOUT' : attempt === 0 ? 'AI_INVALID_OUTPUT' : 'AI_UNAVAILABLE';
      if (lastCode === 'AI_TIMEOUT') break;
    }
  }
  return { analysis: null, warning: { code: lastCode, message: 'AI 解释暂不可用；程序评分和证据仍可查看。' } };
}
