"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import Loading from "@/app/inventory/loading";

interface AuthGuardProps {
  children: React.ReactNode;
  redirectTo?: string;
}

export function AuthGuard({ children, redirectTo = "/login" }: AuthGuardProps) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      console.log("🔒 User not authenticated, redirecting to:", redirectTo);
      router.replace(redirectTo);
    }
  }, [user, loading, router, redirectTo]);

  // Show loading while checking authentication
  if (loading) {
    return <Loading />;
  }

  // If no user and not loading, don't render children (redirect in progress)
  if (!user) {
    return <Loading />;
  }

  // User is authenticated, render children
  return <>{children}</>;
}

// Higher-order component version for easier usage
export function withAuthGuard<P extends object>(
  Component: React.ComponentType<P>,
  redirectTo?: string
) {
  const AuthGuardedComponent = (props: P) => (
    <AuthGuard redirectTo={redirectTo}>
      <Component {...props} />
    </AuthGuard>
  );

  AuthGuardedComponent.displayName = `withAuthGuard(${Component.displayName || Component.name})`;
  
  return AuthGuardedComponent;
}
