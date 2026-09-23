import { createLink } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import {
  type AnchorHTMLAttributes,
  type ComponentType,
  type ReactNode,
  type Ref,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/cn";

type ViewTabAnchorProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  ref?: Ref<HTMLAnchorElement>;
  icon?: ComponentType<{ className?: string }>;
  // "segmented" is the desktop header control; "grid" is the mobile popover.
  variant?: "segmented" | "grid";
};

// The router marks the matching link with data-status="active" (and
// aria-current="page"), so the tab styles itself from that rather than from
// an activeView prop every caller has to keep in sync.
function ViewTabAnchor({
  icon: Icon,
  variant = "segmented",
  className,
  children,
  ...props
}: ViewTabAnchorProps) {
  return (
    <a
      {...props}
      className={cn(
        variant === "grid"
          ? "flex w-full min-w-0 items-center justify-center gap-1 whitespace-nowrap rounded-md border border-transparent px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent data-[status=active]:border-border data-[status=active]:bg-secondary data-[status=active]:text-foreground"
          : cn(
              buttonVariants({ variant: "ghost", size: "xs" }),
              "h-6 gap-1.5 rounded-md px-2 text-xs text-muted-foreground data-[status=active]:bg-secondary data-[status=active]:text-secondary-foreground data-[status=active]:hover:bg-secondary/90",
            ),
        className,
      )}
    >
      {/* The icon never shrinks, and a label too long for its cell truncates
          instead of pushing the popover past a phone-width screen. */}
      {Icon ? <Icon className="size-3.5 shrink-0" /> : null}
      <span className="truncate">{children}</span>
    </a>
  );
}

// A tab is a real link: it opens in a new tab on middle-click and preloads on
// hover. Pass `activeOptions={viewTabActiveOptions}` (or the exact variant for
// an index tab) so an open task sheet, which adds ?taskId=, does not
// un-highlight the current view.
export const ViewTab = createLink(ViewTabAnchor);

export const viewTabActiveOptions = { includeSearch: false } as const;

// For a tab pointing at a parent path, which would otherwise match every
// child view too.
export const exactViewTabActiveOptions = {
  exact: true,
  includeSearch: false,
} as const;

export function ViewSwitcher({ children }: { children: ReactNode }) {
  const { t } = useTranslation();

  return (
    <nav
      aria-label={t("navigation:views.label")}
      className="hidden h-8 items-center gap-0.5 rounded-lg border border-border/80 bg-background p-0.5 sm:inline-flex"
    >
      {children}
    </nav>
  );
}

export function ViewGrid({ children }: { children: ReactNode }) {
  const { t } = useTranslation();

  return (
    <nav aria-label={t("navigation:views.label")} className="space-y-1">
      <p className="px-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {t("navigation:views.label")}
      </p>
      {/* Two across fits every label with its icon in the popover on the
          narrowest screens; four across overflowed and hid the icons. */}
      <div className="grid grid-cols-2 gap-1">{children}</div>
    </nav>
  );
}

// For layouts whose views live under a persistent parent route: the popover
// would otherwise stay open after a tab is chosen, since nothing remounts.
export function MobileViewNav({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            className="size-7 border border-transparent"
            aria-label={t("navigation:views.label")}
          />
        }
      >
        <Menu className="size-4" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 max-w-[calc(100vw-1rem)] p-2"
      >
        {/* biome-ignore lint/a11y/noStaticElementInteractions: only closes the popover after a tab link inside it is activated; the links carry the semantics. */}
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: keyboard activation of a link dispatches a click, which bubbles here. */}
        <div onClick={() => setOpen(false)}>
          <ViewGrid>{children}</ViewGrid>
        </div>
      </PopoverContent>
    </Popover>
  );
}
