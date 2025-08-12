"use client";
import { useState, useEffect } from "react";
import { useRouter }           from "next/navigation";
import Link                    from "next/link";
import { ArrowLeft, Camera }   from "lucide-react";
import { Button }              from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } 
                                 from "@/components/ui/card";
import { useToast }            from "@/hooks/use-toast";

import { auth, provider }      from "@/services/firebase";
import { signInWithPopup }     from "firebase/auth";
import { useAuth }             from "@/hooks/useAuth";
import Image from "next/image";

export default function LoginPage() {
  const { user, loading } = useAuth();
  const [isSigningIn, setSigningIn] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  // if user is already signed in, redirect
  useEffect(() => {
    if (!loading && user) {
      router.push("/dashboard");
      // Check if this is truly a "new" login vs. auto-login
      const isNewSession = sessionStorage.getItem('justLoggedIn');
      if (isNewSession) {
        toast({ title: `Welcome back, ${user.displayName}` });
        sessionStorage.removeItem('justLoggedIn');
      } else {
        // Silent redirect for auto-login
      }
    }
  }, [user, loading]);

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    try {
      await signInWithPopup(auth, provider);
      sessionStorage.setItem('justLoggedIn', 'true');
    } catch (err: any) {
      console.error(err);
      toast({ title: "Sign-in failed", description: err.message, variant: "destructive" });
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Link href="/" className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-8">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to home
        </Link>
        <Card>
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-gradient-to-r from-green-500 to-blue-500 rounded-lg flex items-center justify-center mx-auto mb-4">
              <Image
                  src="/SpoilSense_logo.png"
                  alt="SpoilSense Logo"
                  width={64}
                  height={64}
                  className="object-contain"
                />
            </div>
            <CardTitle className="text-2xl">Welcome to SpoilSense</CardTitle>
            <CardDescription>Sign in to start predicting food spoilage and reducing waste</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={handleGoogleSignIn}
              disabled={isSigningIn}
              className="w-full"
              size="lg"
            >
              {isSigningIn
                ? <span className="flex items-center">…Signing in</span>
                : <span className="flex items-center">
                    {/* Google icon */}
                    <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">…</svg>
                    Continue with Google
                  </span>
              }
            </Button>
            <div className="text-center text-sm text-gray-500">
              By signing in, you agree to our Terms of Service and Privacy Policy
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
