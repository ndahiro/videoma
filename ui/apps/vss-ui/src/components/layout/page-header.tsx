import * as React from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  index: string;
  title: string;
  description?: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  loading?: boolean;
  className?: string;
}

export function PageHeader({
  index,
  title,
  description,
  meta,
  actions,
  loading,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn("border-b border-border bg-background", className)}>
      <div className="px-8 pt-7 pb-5 flex items-start justify-between gap-8">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 mb-3">
            <span className="timecode text-[11px] text-primary">{index}</span>
            <span className="hr-hairline w-12" />
            <span className="eyebrow">{meta ?? "Videoma"}</span>
          </div>
          <h1 className="font-serif text-[34px] leading-[1.05] tracking-editorial text-foreground">
            {title}
          </h1>
          {description && (
            <p className="mt-2 text-sm text-muted-foreground max-w-xl leading-relaxed">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        )}
      </div>
      {loading && <div className="tape-bar" />}
    </header>
  );
}