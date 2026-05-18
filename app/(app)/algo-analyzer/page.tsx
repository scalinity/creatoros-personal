import type { Metadata } from "next";

import { AlgoAnalyzerView } from "@/components/analyzer";
import { requireAdmin } from "@/lib/auth/admin";
import { loadAlgoAnalyzerWorkspace } from "@/lib/algo-analyzer";

import { analyzeDraftAction, saveAnalyzerRewriteIdeaAction, saveAnalyzerRewriteOutputAction } from "./actions";

export const metadata: Metadata = {
  title: "Algorithm analyzer · CreatorOS Personal",
};

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type AlgoAnalyzerPageProps = {
  searchParams?: Promise<SearchParams>;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AlgoAnalyzerPage({ searchParams }: AlgoAnalyzerPageProps) {
  const admin = await requireAdmin();
  const params = (await searchParams) ?? {};
  const selected = firstValue(params.selected);
  const notice = firstValue(params.notice);
  const { reports, selectedReport } = await loadAlgoAnalyzerWorkspace(admin, selected);

  return (
    <AlgoAnalyzerView
      analyzeAction={analyzeDraftAction}
      filters={{ notice, selected }}
      report={selectedReport}
      reports={reports}
      saveIdeaAction={saveAnalyzerRewriteIdeaAction}
      saveOutputAction={saveAnalyzerRewriteOutputAction}
    />
  );
}
