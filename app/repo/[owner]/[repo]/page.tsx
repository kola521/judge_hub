import { ReportClient } from '@/components/repository/ReportClient';

export default async function RepoPage({ params, searchParams }: { params: Promise<{ owner: string; repo: string }>; searchParams: Promise<{ debug?: string }> }) {
  const { owner, repo } = await params;
  const { debug } = await searchParams;
  return <ReportClient owner={owner} repo={repo} debug={debug === 'true'} />;
}
