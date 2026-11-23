import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/shell/page-header.tsx";
import { SummaryPage } from "@/features/ai-summary/summary-page.tsx";
export const Route = createFileRoute("/ai-summary")({
  component: () => (
    <>
      <PageHeader title="AI 摘要" description="生成三语草稿，核对来源后编辑、批准或撤回。" />
      <SummaryPage />
    </>
  ),
});
