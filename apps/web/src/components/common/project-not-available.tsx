import { Link } from "@tanstack/react-router";
import { FolderLock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

// A project the API answers with 404: missing, or one the user has not been
// added to. The two look the same on purpose.
export function ProjectNotAvailable({ workspaceId }: { workspaceId?: string }) {
  const { t } = useTranslation();

  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FolderLock />
        </EmptyMedia>
        <EmptyTitle>{t("workspace:projects.notAvailableTitle")}</EmptyTitle>
        <EmptyDescription>
          {t("workspace:projects.notAvailableDescription")}
        </EmptyDescription>
      </EmptyHeader>
      {workspaceId && (
        <EmptyContent>
          <Button
            variant="outline"
            size="sm"
            render={
              <Link
                to="/dashboard/workspace/$workspaceId"
                params={{ workspaceId }}
              />
            }
          >
            {t("workspace:projects.backToProjects")}
          </Button>
        </EmptyContent>
      )}
    </Empty>
  );
}
