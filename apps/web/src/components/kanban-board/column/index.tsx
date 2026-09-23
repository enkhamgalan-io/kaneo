import { useState } from "react";
import { cn } from "@/lib/cn";
import type { ProjectWithTasks } from "@/types/project";
import type { CrossProjectBoard } from "../../board/cross-project";
import { ColumnDropzone } from "./column-dropzone";
import { ColumnHeader } from "./column-header";

type ColumnProps = {
  column: ProjectWithTasks["columns"][number];
  disableDragDrop?: boolean;
  crossProject?: CrossProjectBoard;
  // While dragging a card whose project has no such column.
  isDropDisabled?: boolean;
};

function Column({
  column,
  disableDragDrop = false,
  crossProject,
  isDropDisabled = false,
}: ColumnProps) {
  const [isDropzoneOver, setIsDropzoneOver] = useState(false);

  return (
    <div
      className={cn(
        "group relative flex h-full min-h-0 w-full flex-col rounded-xl border transition-[background-color,border-color,opacity] duration-150",
        isDropzoneOver
          ? "border-ring/40 bg-accent/60 shadow-md ring-2 ring-ring/30"
          : "border-border/70 bg-muted/40 shadow-xs/5 hover:border-border/90 dark:bg-card/90",
        isDropDisabled && "opacity-45",
      )}
    >
      <div className="shrink-0 border-b border-border/60 px-3 py-2">
        <ColumnHeader column={column} crossProject={crossProject} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 py-1 [-webkit-overflow-scrolling:touch]">
        <ColumnDropzone
          column={column}
          disableDragDrop={disableDragDrop}
          disableReorder={Boolean(crossProject)}
          onIsOverChange={setIsDropzoneOver}
        />
      </div>
    </div>
  );
}

export default Column;
