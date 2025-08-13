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
              disabled={isSigningIn || loading}
              className="w-full"
              size="lg"
            >
              {isSigningIn
                ? <span className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Signing in...
                  </span>
                : <span className="flex items-center">
                    {/* Complete Google icon */}
                    <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
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
