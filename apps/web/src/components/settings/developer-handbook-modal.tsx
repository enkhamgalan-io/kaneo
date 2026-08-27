import {
  AlertTriangle,
  BookOpen,
  Bot,
  Check,
  Code2,
  Copy,
  GitBranch,
  GitCommit,
  GitPullRequest,
  Globe,
  Layers,
  Sparkles,
  Terminal,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";

type DeveloperHandbookModalProps = {
  open: boolean;
  onClose: () => void;
};

export function DeveloperHandbookModal({
  open,
  onClose,
}: DeveloperHandbookModalProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<
    "repo" | "mcp" | "mapping" | "branches" | "ai"
  >("repo");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://your-kaneo-instance.com";
  const mcpEndpoint = `${origin}/api/mcp`;

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success(t("settings:developerPage.mcpCopied"));
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const claudeCodeCommand = `claude mcp add --transport http kaneo ${mcpEndpoint}`;
  const codexToml = `[mcp_servers.kaneo]\nurl = "${mcpEndpoint}"\nbearer_token_env_var = "KANEO_MCP_TOKEN"\nstartup_timeout_sec = 20\ntool_timeout_sec = 60`;
  const agentsMdSnippet = `## Branch & commit convention\n- Branch from the Kaneo task: <project-slug>-<task-number>-<short-title>\n  e.g. task #123 in "proj" → proj-123-fix-login\n- Never commit straight to main/master/develop/staging/production.\n- Close work in the commit body with fixes #<issue-number>\n  (the Git host issue number, from the task's linked issue).\n- Use Conventional Commits: feat / fix / refactor / docs.`;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden bg-background">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/50">
          <div className="flex items-center gap-2">
            <BookOpen className="size-5 text-primary" />
            <DialogTitle className="text-lg font-semibold">
              {t("settings:developerPage.handbookModalTitle")}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground mt-1">
            {t("settings:developerPage.handbookModalSubtitle")}
          </DialogDescription>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1.5 pt-3 overflow-x-auto">
            <Button
              variant={activeTab === "repo" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setActiveTab("repo")}
              className="h-7 text-xs gap-1.5 shrink-0"
            >
              <Globe className="size-3.5" />
              1. Repositories
            </Button>
            <Button
              variant={activeTab === "mcp" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setActiveTab("mcp")}
              className="h-7 text-xs gap-1.5 shrink-0"
            >
              <Terminal className="size-3.5" />
              2. MCP Setup
            </Button>
            <Button
              variant={activeTab === "mapping" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setActiveTab("mapping")}
              className="h-7 text-xs gap-1.5 shrink-0"
            >
              <Layers className="size-3.5" />
              3. Status Automation
            </Button>
            <Button
              variant={activeTab === "branches" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setActiveTab("branches")}
              className="h-7 text-xs gap-1.5 shrink-0"
            >
              <GitBranch className="size-3.5" />
              4. Branches & Commits
            </Button>
            <Button
              variant={activeTab === "ai" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setActiveTab("ai")}
              className="h-7 text-xs gap-1.5 shrink-0"
            >
              <Bot className="size-3.5" />
              5. AI Assistant Loop
            </Button>
          </div>
        </DialogHeader>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 text-sm text-foreground">
          {activeTab === "repo" && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-semibold flex items-center gap-2">
                  <Globe className="size-4 text-primary" />
                  1. Connect your repository
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Connecting is done once per project by a maintainer from{" "}
                  <strong className="text-foreground">Project Settings</strong>.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-lg border border-border/50 bg-muted/20 p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">GitHub</span>
                    <Badge variant="outline" className="text-[10px]">
                      GitHub App
                    </Badge>
                  </div>
                  <ol className="list-decimal list-inside space-y-1.5 text-xs text-muted-foreground">
                    <li>
                      Configure the GitHub App on your organization/account.
                    </li>
                    <li>
                      Open Project →{" "}
                      <strong className="text-foreground">
                        Project Settings → GitHub
                      </strong>
                      .
                    </li>
                    <li>Browse or enter repository owner and name.</li>
                    <li>
                      Click{" "}
                      <strong className="text-foreground">
                        Verify Installation
                      </strong>
                      , then{" "}
                      <strong className="text-foreground">
                        Connect Repository
                      </strong>
                      .
                    </li>
                  </ol>
                </div>

                <div className="rounded-lg border border-border/50 bg-muted/20 p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">GitLab</span>
                    <Badge variant="outline" className="text-[10px]">
                      Personal Access Token
                    </Badge>
                  </div>
                  <ol className="list-decimal list-inside space-y-1.5 text-xs text-muted-foreground">
                    <li>
                      Create a token on GitLab (
                      <code className="text-[11px] bg-muted px-1 py-0.5 rounded">
                        api
                      </code>{" "}
                      scope).
                    </li>
                    <li>
                      Open Project →{" "}
                      <strong className="text-foreground">
                        Project Settings → GitLab
                      </strong>
                      .
                    </li>
                    <li>
                      Enter instance URL, project path (
                      <code className="text-[11px] bg-muted px-1 py-0.5 rounded">
                        group/repo
                      </code>
                      ), and token.
                    </li>
                    <li>
                      Click <strong className="text-foreground">Verify</strong>,
                      then <strong className="text-foreground">Connect</strong>.
                    </li>
                  </ol>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold block mb-0.5">
                    User Email Matching
                  </span>
                  {t("settings:developerPage.handbookEmailWarning")}
                </div>
              </div>
            </div>
          )}

          {activeTab === "mcp" && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-semibold flex items-center gap-2">
                  <Terminal className="size-4 text-primary" />
                  2. Connect the MCP server
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  The built-in Model Context Protocol (MCP) server lets AI tools
                  (Claude Code, Cursor, Codex) read and update Kaneo tasks
                  directly from your editor.
                </p>
              </div>

              {/* Endpoint banner */}
              <div className="rounded-lg border border-border/50 bg-muted/30 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Live HTTP MCP Endpoint
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(mcpEndpoint, "mcp-url")}
                    className="h-6 gap-1 text-xs"
                  >
                    {copiedKey === "mcp-url" ? (
                      <Check className="size-3 text-emerald-500" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                    <span>
                      {copiedKey === "mcp-url"
                        ? t("settings:apiKey.createdModal.copied")
                        : t("settings:apiKey.createdModal.copy")}
                    </span>
                  </Button>
                </div>
                <code className="block font-mono text-xs text-foreground select-all break-all">
                  {mcpEndpoint}
                </code>
              </div>

              {/* Claude Code setup */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-3.5 text-primary" />
                    <span className="font-semibold text-xs">
                      Claude Code Configuration
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      copyToClipboard(claudeCodeCommand, "claude-code")
                    }
                    className="h-6 gap-1 text-xs"
                  >
                    {copiedKey === "claude-code" ? (
                      <Check className="size-3 text-emerald-500" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                    <span>
                      {copiedKey === "claude-code"
                        ? t("settings:apiKey.createdModal.copied")
                        : t("settings:apiKey.createdModal.copy")}
                    </span>
                  </Button>
                </div>
                <pre className="rounded-lg bg-muted/60 p-3 font-mono text-xs overflow-x-auto border border-border/40 select-all">
                  {claudeCodeCommand}
                </pre>
                <p className="text-xs text-muted-foreground">
                  On first call, Claude Code opens the browser for OAuth 2.1
                  authentication. After approving, tools execute seamlessly.
                </p>
              </div>

              {/* Codex setup */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs">
                    Codex configuration (config.toml)
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(codexToml, "codex-toml")}
                    className="h-6 gap-1 text-xs"
                  >
                    {copiedKey === "codex-toml" ? (
                      <Check className="size-3 text-emerald-500" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                    <span>
                      {copiedKey === "codex-toml"
                        ? t("settings:apiKey.createdModal.copied")
                        : t("settings:apiKey.createdModal.copy")}
                    </span>
                  </Button>
                </div>
                <pre className="rounded-lg bg-muted/60 p-3 font-mono text-xs overflow-x-auto border border-border/40 select-all">
                  {codexToml}
                </pre>
              </div>
            </div>
          )}

          {activeTab === "mapping" && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-semibold flex items-center gap-2">
                  <Layers className="size-4 text-primary" />
                  3. How issues and tasks map
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  A Kaneo task and its Git host issue are synchronized both
                  ways.
                </p>
              </div>

              <div className="rounded-lg border border-border/50 overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/50 border-b border-border/50">
                    <tr>
                      <th className="px-4 py-2.5 font-medium text-foreground">
                        Git Action
                      </th>
                      <th className="px-4 py-2.5 font-medium text-foreground">
                        Task Moves To
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    <tr>
                      <td className="px-4 py-2.5 flex items-center gap-2">
                        <GitBranch className="size-3.5 text-muted-foreground" />
                        Push a task branch (e.g.{" "}
                        <code className="bg-muted px-1 py-0.5 rounded font-mono">
                          kan-12-feature
                        </code>
                        )
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant="secondary" className="text-[11px]">
                          in-progress
                        </Badge>
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2.5 flex items-center gap-2">
                        <GitPullRequest className="size-3.5 text-muted-foreground" />
                        Open a Pull / Merge Request
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant="secondary" className="text-[11px]">
                          in-review
                        </Badge>
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2.5 flex items-center gap-2">
                        <Check className="size-3.5 text-emerald-500" />
                        Merge the Pull / Merge Request
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant="default" className="text-[11px]">
                          done
                        </Badge>
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2.5 flex items-center gap-2">
                        <GitCommit className="size-3.5 text-muted-foreground" />
                        Commit message with{" "}
                        <code className="bg-muted px-1 py-0.5 rounded font-mono">
                          fixes #issue
                        </code>
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant="default" className="text-[11px]">
                          done
                        </Badge>
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2.5 flex items-center gap-2">
                        <Code2 className="size-3.5 text-muted-foreground" />
                        Close the linked issue on GitHub/GitLab
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant="default" className="text-[11px]">
                          done
                        </Badge>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "branches" && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-semibold flex items-center gap-2">
                  <GitBranch className="size-4 text-primary" />
                  4. Branches and commit messages
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Two handles drive automation: the branch name and the commit
                  message.
                </p>
              </div>

              {/* Branch name rule */}
              <div className="rounded-lg border border-border/50 bg-muted/20 p-4 space-y-2">
                <h4 className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                  <GitBranch className="size-3.5 text-primary" />
                  Branch name links the task
                </h4>
                <p className="text-xs text-muted-foreground">
                  Name the branch with the project slug and the{" "}
                  <strong className="text-foreground">Kaneo task number</strong>
                  :
                </p>
                <pre className="rounded bg-muted/80 p-2.5 font-mono text-xs overflow-x-auto border border-border/40 select-all">
                  git checkout -b kan-12-fix-login-redirect
                </pre>
                <p className="text-[11px] text-muted-foreground">
                  Protected branches (
                  <code className="bg-muted px-1 py-0.5 rounded">main</code>,{" "}
                  <code className="bg-muted px-1 py-0.5 rounded">master</code>,{" "}
                  <code className="bg-muted px-1 py-0.5 rounded">develop</code>)
                  are ignored.
                </p>
              </div>

              {/* Commit close keyword */}
              <div className="rounded-lg border border-border/50 bg-muted/20 p-4 space-y-2">
                <h4 className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                  <GitCommit className="size-3.5 text-primary" />
                  Commit message auto-closes the task
                </h4>
                <p className="text-xs text-muted-foreground">
                  Reference the{" "}
                  <strong className="text-foreground">
                    Git host issue number
                  </strong>{" "}
                  with a closing keyword:
                </p>
                <pre className="rounded bg-muted/80 p-2.5 font-mono text-xs overflow-x-auto border border-border/40 select-all">
                  git commit -m "fix: resolve login issue (fixes #45)"
                </pre>
                <p className="text-[11px] text-muted-foreground">
                  Supported keywords:{" "}
                  <code className="bg-muted px-1 py-0.5 rounded">close(s)</code>
                  ,{" "}
                  <code className="bg-muted px-1 py-0.5 rounded">fix(es)</code>,{" "}
                  <code className="bg-muted px-1 py-0.5 rounded">
                    resolve(s)
                  </code>{" "}
                  followed by{" "}
                  <code className="bg-muted px-1 py-0.5 rounded">
                    #&lt;id&gt;
                  </code>
                  .
                </p>
              </div>

              {/* AGENTS.md / CLAUDE.md snippet */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs">
                    Add to your repository's AGENTS.md / CLAUDE.md:
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      copyToClipboard(agentsMdSnippet, "agents-md")
                    }
                    className="h-6 gap-1 text-xs"
                  >
                    {copiedKey === "agents-md" ? (
                      <Check className="size-3 text-emerald-500" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                    <span>
                      {copiedKey === "agents-md"
                        ? t("settings:apiKey.createdModal.copied")
                        : t("settings:apiKey.createdModal.copy")}
                    </span>
                  </Button>
                </div>
                <pre className="rounded-lg bg-muted/60 p-3 font-mono text-xs overflow-x-auto border border-border/40 select-all leading-relaxed">
                  {agentsMdSnippet}
                </pre>
              </div>
            </div>
          )}

          {activeTab === "ai" && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-semibold flex items-center gap-2">
                  <Bot className="size-4 text-primary" />
                  5. Find and implement tasks with AI tools
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  End-to-end loop for implementing tasks directly with Claude
                  Code or Cursor.
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex gap-3 items-start p-3 rounded-lg border border-border/40 bg-muted/20">
                  <Badge
                    variant="outline"
                    className="h-5 w-5 rounded-full p-0 flex items-center justify-center shrink-0 mt-0.5 text-xs"
                  >
                    1
                  </Badge>
                  <div className="space-y-1">
                    <strong className="text-xs font-semibold block">
                      Find assigned work
                    </strong>
                    <p className="text-xs text-muted-foreground">
                      Ask your AI tool:{" "}
                      <em>
                        "List my open Kaneo tasks and show details for the top
                        one."
                      </em>
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 items-start p-3 rounded-lg border border-border/40 bg-muted/20">
                  <Badge
                    variant="outline"
                    className="h-5 w-5 rounded-full p-0 flex items-center justify-center shrink-0 mt-0.5 text-xs"
                  >
                    2
                  </Badge>
                  <div className="space-y-1">
                    <strong className="text-xs font-semibold block">
                      Branch from the task
                    </strong>
                    <p className="text-xs text-muted-foreground">
                      Create and push your task branch (
                      <code className="bg-muted px-1 py-0.5 rounded font-mono text-[11px]">
                        git checkout -b proj-123-short-title
                      </code>
                      ). Pushing automatically marks the task{" "}
                      <strong className="text-foreground">in-progress</strong>.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 items-start p-3 rounded-lg border border-border/40 bg-muted/20">
                  <Badge
                    variant="outline"
                    className="h-5 w-5 rounded-full p-0 flex items-center justify-center shrink-0 mt-0.5 text-xs"
                  >
                    3
                  </Badge>
                  <div className="space-y-1">
                    <strong className="text-xs font-semibold block">
                      Implement and commit with issue reference
                    </strong>
                    <p className="text-xs text-muted-foreground">
                      Write code, verify tests, and commit with closing
                      keywords:{" "}
                      <code className="bg-muted px-1 py-0.5 rounded font-mono text-[11px]">
                        git commit -m "feat: ... (fixes #45)"
                      </code>
                      .
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 items-start p-3 rounded-lg border border-border/40 bg-muted/20">
                  <Badge
                    variant="outline"
                    className="h-5 w-5 rounded-full p-0 flex items-center justify-center shrink-0 mt-0.5 text-xs"
                  >
                    4
                  </Badge>
                  <div className="space-y-1">
                    <strong className="text-xs font-semibold block">
                      Pull Request & Review
                    </strong>
                    <p className="text-xs text-muted-foreground">
                      {"Opening a PR moves the task to "}
                      <strong className="text-foreground">in-review</strong>
                      {"; merging it moves it to "}
                      <strong className="text-foreground">done</strong>.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border/50 flex justify-end bg-muted/20">
          <Button onClick={onClose} size="sm" className="h-8 text-xs">
            {t("settings:apiKey.createdModal.done")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
