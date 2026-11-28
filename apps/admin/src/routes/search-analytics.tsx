import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/shell/page-header.tsx";
import { SearchAnalyticsPage } from "@/features/search-analytics/search-analytics-page.tsx";
export const Route = createFileRoute("/search-analytics")({
  component: () => (
    <>
      <PageHeader title="搜索分析" description="真实搜索统计、榜单审核和资源控制" />
      <SearchAnalyticsPage />
    </>
  ),
});
