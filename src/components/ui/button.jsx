import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none",
  {
    variants: {
      variant: {
        default:
          "bg-accent text-accent-ink font-semibold hover:opacity-95 active:opacity-90 shadow-none border border-transparent",
        secondary:
          "bg-paper-2 text-ink border border-rule hover:border-rule-2 hover:bg-paper-3",
        outline:
          "border border-rule bg-transparent text-ink hover:bg-paper-2 hover:border-rule-2",
        ghost:
          "text-ink-muted hover:text-ink hover:bg-paper-2",
        cool:
          "bg-cool/10 text-cool border border-cool/30 hover:bg-cool/20",
      },
      size: {
        default: "h-9 px-4 py-2 rounded-pill",
        sm: "h-8 px-3 text-xs rounded-pill",
        lg: "h-11 px-6 text-base rounded-pill",
        icon: "h-9 w-9 rounded-pill",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

const Button = React.forwardRef(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
