import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-[4px] border select-none transition-colors",
  {
    variants: {
      variant: {
        default:
          "border-rule bg-paper-2 text-ink-2",
        amber:
          "border-accent/40 bg-accent-soft text-accent",
        cool:
          "border-cool/40 bg-cool-soft text-cool",
        ok:
          "border-ok/40 bg-ok-soft text-ok",
        bad:
          "border-bad/40 bg-bad-soft text-bad",
        subtle:
          "border-rule/60 bg-paper-3 text-ink-muted",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({ className, variant, ...props }) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
