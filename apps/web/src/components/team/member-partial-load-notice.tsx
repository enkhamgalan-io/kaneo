import { TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";

// Shown above a member view when some of the member's projects could not be
// loaded, so the view is not mistaken for the complete picture.
export function MemberPartialLoadNotice({
  failedCount,
}: {
  failedCount: number;
}) {
  const { t } = useTranslation();
  if (failedCount === 0) return null;

  return (
    <div
      role="status"
      className="flex items-center gap-2 border-b border-border/80 bg-warning/8 px-4 py-2 text-xs text-warning-foreground"
    >
      <TriangleAlert className="size-3.5 shrink-0" />
      {t("team:memberTasks.partialLoadError", { count: failedCount })}
    </div>
  );
}
