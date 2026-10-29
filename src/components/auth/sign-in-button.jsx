"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { GitBranch } from "lucide-react";

export function SignInButton({ callbackUrl = "/dashboard", className, children, ...props }) {
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    setLoading(true);
    try {
      await signIn("github", { callbackUrl });
    } catch {
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={handleSignIn}
      disabled={loading}
      className={className}
      {...props}
    >
      <GitBranch className="w-4 h-4 mr-2" />
      {children || (loading ? "Connecting to GitHub..." : "Authenticate with GitHub")}
    </Button>
  );
}

export default SignInButton;
