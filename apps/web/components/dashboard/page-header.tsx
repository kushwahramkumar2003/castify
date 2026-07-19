"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface PageHeaderProps {
  /** Optional control before the title (e.g. back button) */
  leading?: ReactNode;
  title: string;
  /** One short line — skip if it only restates the title */
  description?: ReactNode;
  /** Right-side actions: keep compact, never full-width blocks */
  actions?: ReactNode;
  className?: string;
}

/**
 * Product-style page chrome.
 * Title + actions share one row; description sits quietly underneath.
 */
export function PageHeader({
  leading,
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn("page-header", className)}>
      <div className="page-header__main">
        <div className="page-header__row">
          <div className="page-header__title-group">
            {leading ? (
              <div className="page-header__leading">{leading}</div>
            ) : null}
            <h1 className="page-title">{title}</h1>
          </div>
          {actions ? (
            <div className="page-header__actions">{actions}</div>
          ) : null}
        </div>
        {description ? <p className="page-subtitle">{description}</p> : null}
      </div>
    </header>
  );
}
