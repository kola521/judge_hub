import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { analyzeRepository } from '@/lib/analysis';
import { GitHubError, httpStatusForGitHubError } from '@/lib/github/client';
import { parseGitHubRepository } from '@/lib/parser/github-url';

export const runtime = 'nodejs';
const requestSchema = z.object({ url: z.string().min(1), includeAI: z.boolean().optional(), refresh: z.boolean().optional(), fastOnly: z.boolean().optional() });

export async function POST(request: NextRequest) {
  let input: z.infer<typeof requestSchema>;
  try { input = requestSchema.parse(await request.json()); }
  catch { return NextResponse.json({ code: 'INVALID_REPOSITORY_INPUT', message: '请输入 GitHub 仓库地址。' }, { status: 400 }); }
  let ref;
  try { ref = parseGitHubRepository(input.url); }
  catch (error) { return NextResponse.json({ code: 'INVALID_REPOSITORY_INPUT', message: error instanceof Error ? error.message : '仓库地址无效。' }, { status: 400 }); }
  try {
    const report = await analyzeRepository(ref, { includeAI: input.includeAI ?? true, refresh: input.refresh, fastOnly: input.fastOnly, debug: request.nextUrl.searchParams.get('debug') === 'true' });
    return NextResponse.json(report, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof GitHubError) return NextResponse.json({ code: error.code, message: error.message, retryAt: error.retryAt }, { status: httpStatusForGitHubError(error) });
    const traceId = crypto.randomUUID();
    console.error(JSON.stringify({ event: 'analysis_failed', traceId, errorType: error instanceof Error ? error.name : 'unknown' }));
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: '分析暂时失败，请稍后重试。', traceId }, { status: 500 });
  }
}
