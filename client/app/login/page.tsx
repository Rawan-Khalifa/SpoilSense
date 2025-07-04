// client/app/login/page.tsx
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Camera, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"

// Firebase SDK init
import { auth } from "@/services/firebase"  
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth"

// HTTP client to call Flask API
import axios from "axios"

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

  const handleGoogleSignIn = async () => {
    setIsLoading(true)
    try {
      // 1) Sign in with Google via Firebase
      const provider = new GoogleAuthProvider()
      const result = await signInWithPopup(auth, provider)
      const user = result.user

      // 2) Grab the Firebase ID token
      const idToken = await user.getIdToken()

      // 3) Tell Flask backend about it
      //    (Flask will verify and upsert the user in Firestore)
      await axios.post(
        "http://localhost:5000/auth/login",
        {},  // no body needed
        { headers: { Authorization: `Bearer ${idToken}` } }
      )

      toast({
        title: "Welcome to SpoilSensei!",
        description: `Signed in as ${user.displayName}`,
      })

      // 4) Redirect to protected dashboard
      router.push("/dashboard")
    } catch (err: any) {
      console.error(err)
      toast({
        title: "Sign-in failed",
        description: err.message || "Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Link href="/" className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-8">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to home
        </Link>

        <Card>
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-gradient-to-r from-green-500 to-blue-500 rounded-lg flex items-center justify-center mx-auto mb-4">
              <Camera className="w-8 h-8 text-white" />
            </div>
            <CardTitle className="text-2xl">Welcome to SpoilSensei</CardTitle>
            <CardDescription>Sign in to start predicting food spoilage and reducing waste</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={handleGoogleSignIn} disabled={isLoading} className="w-full" size="lg">
              {isLoading
                ? <div className="flex items-center">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Signing in...
                  </div>
                : <div className="flex items-center">
                    {/* Google logo SVG */}
                    <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                      {/* …paths… */}
                    </svg>
                    Continue with Google
                  </div>
              }
            </Button>

            <div className="text-center text-sm text-gray-500">
              By signing in, you agree to our Terms of Service and Privacy Policy
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
