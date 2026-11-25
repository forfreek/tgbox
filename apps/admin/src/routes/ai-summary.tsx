import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/shell/page-header.tsx";
import { SummaryPage } from "@/features/ai-summary/summary-page.tsx";
export const Route = createFileRoute("/ai-summary")({
  component: () => (
    <>
      <PageHeader title="AI 摘要" description="手写并发布三语摘要，或查看机器生成版本。" />
      <SummaryPage />
    </>
  ),
});
