import { PublishingCalendarView } from "@/components/publishing";
import { requireAdmin } from "@/lib/auth/admin";
import { loadPublishingCalendar } from "@/lib/publishing";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type CalendarPageProps = {
  searchParams?: Promise<SearchParams>;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  const admin = await requireAdmin();
  const query = (await searchParams) ?? {};
  const calendar = await loadPublishingCalendar(admin, { timezone: firstValue(query.timezone) });

  return <PublishingCalendarView calendar={calendar} />;
}
