import { createFileRoute } from "@tanstack/react-router";
import {
  BookOpen,
  Check,
  Copy,
  ExternalLink,
  FileCode2,
  GitBranch,
  KeyRound,
  Plus,
  Terminal,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import PageTitle from "@/components/page-title";
import { ApiKeyCreatedModal } from "@/components/settings/api-key-created-modal";
import { ApiKeyTable } from "@/components/settings/api-key-table";
import { CreateApiKeyDialog } from "@/components/settings/create-api-key-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardDescription,
  CardFrame,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@/components/ui/card";
import useGetApiKeys from "@/hooks/queries/use-get-api-keys";
import { toast } from "@/lib/toast";
import type { CreateApiKeyResponse } from "@/types/api-key";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/account/developer",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const { data: apiKeys = [], isLoading } = useGetApiKeys();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState<{
    key: string;
    name: string;
  } | null>(null);
  const [copiedMcp, setCopiedMcp] = useState(false);

  const mcpUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/mcp`
      : "/api/mcp";
  const openApiUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/openapi`
      : "/api/openapi";
  const handbookUrl =
    "https://kaneo.app/docs/core/functional/git-task-workflow";

  const handleCopyMcp = () => {
    navigator.clipboard.writeText(mcpUrl);
    setCopiedMcp(true);
    toast.success(t("settings:developerPage.mcpCopied"));
    setTimeout(() => setCopiedMcp(false), 2000);
  };

  const handleCreateSuccess = (data: CreateApiKeyResponse) => {
    setCreatedKey({
      key: data.key,
      name: data.name || t("settings:developerPage.unnamedKey"),
    });
  };

  const handleCreatedModalClose = () => {
    setCreatedKey(null);
  };

  return (
    <>
      <PageTitle title={t("settings:developerPage.pageTitle")} />
      <div className="max-w-4xl mx-auto space-y-8 pb-12">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">
            {t("settings:developerPage.title")}
          </h1>
          <p className="text-muted-foreground">
            {t("settings:developerPage.subtitle")}
          </p>
        </div>

        {/* Developer Handbook & Workflow Card */}
        <CardFrame>
          <Card className="!rounded-none !border-t-0">
            <CardHeader>
              <CardTitle className="inline-flex items-center gap-2 text-base">
                <BookOpen className="size-4" />
                {t("settings:developerPage.handbookCardTitle")}
              </CardTitle>
              <CardDescription>
                {t("settings:developerPage.handbookCardDescription")}
              </CardDescription>
              <CardAction>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(handbookUrl, "_blank")}
                  className="gap-2"
                >
                  <ExternalLink className="size-3.5" />
                  {t("settings:developerPage.openHandbook")}
                </Button>
              </CardAction>
            </CardHeader>
          </Card>

          <Card className="!rounded-none">
            <CardPanel className="p-4 space-y-6">
              {/* MCP Endpoint */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Terminal className="size-4 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    {t("settings:developerPage.mcpTitle")}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("settings:developerPage.mcpDescription")}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 rounded-md bg-muted px-3 py-1.5 font-mono text-xs text-foreground border border-border/50 select-all truncate">
                    {mcpUrl}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyMcp}
                    className="h-8 gap-1.5 shrink-0"
                  >
                    {copiedMcp ? (
                      <Check className="size-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                    <span className="text-xs">
                      {copiedMcp
                        ? t("settings:apiKey.createdModal.copied")
                        : t("settings:apiKey.createdModal.copy")}
                    </span>
                  </Button>
                </div>
              </div>

              {/* Git Task Workflow */}
              <div className="space-y-2 pt-2 border-t border-border/40">
                <div className="flex items-center gap-2">
                  <GitBranch className="size-4 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    {t("settings:developerPage.gitWorkflowTitle")}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="rounded-md border border-border/40 bg-muted/40 p-2.5 space-y-1">
                    <p className="font-medium text-foreground">
                      {t("settings:developerPage.gitWorkflowBranch")}
                    </p>
                    <p className="text-muted-foreground font-mono text-[11px]">
                      {t("settings:developerPage.gitWorkflowBranchDesc")}
                    </p>
                  </div>
                  <div className="rounded-md border border-border/40 bg-muted/40 p-2.5 space-y-1">
                    <p className="font-medium text-foreground">
                      {t("settings:developerPage.gitWorkflowClose")}
                    </p>
                    <p className="text-muted-foreground text-[11px]">
                      {t("settings:developerPage.gitWorkflowCloseDesc")}
                    </p>
                  </div>
                </div>
              </div>

              {/* OpenAPI Spec */}
              <div className="flex items-center justify-between pt-2 border-t border-border/40">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <FileCode2 className="size-4 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      {t("settings:developerPage.openapiTitle")}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("settings:developerPage.openapiDescription")}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.open(openApiUrl, "_blank")}
                  className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="size-3.5" />
                  {t("settings:developerPage.viewOpenApi")}
                </Button>
              </div>
            </CardPanel>
          </Card>
        </CardFrame>

        {/* API Keys Card */}
        <CardFrame>
          <Card className="!rounded-none !border-t-0">
            <CardHeader>
              <CardTitle className="inline-flex items-center gap-2 text-base">
                <KeyRound className="size-4" />
                {t("settings:developerPage.apiKeysCardTitle")}
              </CardTitle>
              <CardDescription>
                {t("settings:developerPage.apiKeysCardDescription")}
              </CardDescription>
              <CardAction>
                <Button
                  onClick={() => setCreateDialogOpen(true)}
                  className="gap-2"
                >
                  <Plus className="size-4" />
                  {t("settings:developerPage.createApiKey")}
                </Button>
              </CardAction>
            </CardHeader>
          </Card>

          <Card className="!rounded-none">
            <CardPanel className="p-4">
              <ApiKeyTable apiKeys={apiKeys} isLoading={isLoading} />
            </CardPanel>
          </Card>
        </CardFrame>
      </div>

      <CreateApiKeyDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onSuccess={handleCreateSuccess}
      />

      {createdKey && (
        <ApiKeyCreatedModal
          apiKey={createdKey.key}
          keyName={createdKey.name}
          open={true}
          onClose={handleCreatedModalClose}
        />
      )}
    </>
  );
}
