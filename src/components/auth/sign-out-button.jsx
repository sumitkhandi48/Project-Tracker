"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export function SignOutButton({
  callbackUrl = "/",
  className,
  variant = "secondary",
  size = "sm",
  children,
  ...props
}) {
  const [loading, setLoading] = useState(false);

  const handleSignOut = async () => {
    setLoading(true);
    try {
      await signOut({ callbackUrl });
    } catch {
      setLoading(false);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleSignOut}
      disabled={loading}
      className={className}
      {...props}
    >
      <LogOut className="w-3.5 h-3.5 mr-1.5 text-ink-muted" />
      {children || (loading ? "Disconnecting..." : "Sign out")}
    </Button>
  );
}

export default SignOutButton;
