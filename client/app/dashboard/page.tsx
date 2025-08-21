// client/app/page.tsx
"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  Card, CardHeader, CardContent, CardDescription, CardTitle
} from "@/components/ui/card"
import {
  Camera, Package, Scan, BarChart3, Clock, Leaf, LogOut
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuth }  from "@/hooks/useAuth"
import Loading      from "@/app/inventory/loading"
import { useToast } from "@/hooks/use-toast"
import { AuthGuard } from "@/components/auth-guard"
import { makeAuthenticatedRequest, handleApiError } from "@/lib/api-client"
import axios from "axios"

interface DashboardStats {
  itemsScanned: number;
  wastePrevented: number;
  expiringSoon: number;
}

function DashboardContent() {
  const router = useRouter()
  const { user, token, logout, deleteAccount } = useAuth()
  const { toast } = useToast()

  const [stats, setStats] = useState<DashboardStats>({
    itemsScanned: 0,
    wastePrevented: 0,
    expiringSoon: 0
  })
  const [statsLoading, setStatsLoading] = useState(false) // Changed to false - don't block UI

  // Fetch inventory and compute stats
  useEffect(() => {
    const fetchInventory = async () => {
      if (!token) return
      
      try {
        const inventory = await makeAuthenticatedRequest(
          (authToken) => axios.get(
            `${process.env.NEXT_PUBLIC_API_BASE_URL}/inventory`,
            { headers: { Authorization: `Bearer ${authToken}` } }
          ),
          token,
          () => {
            // Handle auth error
            console.log("Auth error - setting default stats")
            setStats({
              itemsScanned: 0,
              wastePrevented: 0,
              expiringSoon: 0
            })
          }
        )
        
        const inv: any[] = inventory
        const totalSaved = inv.reduce((sum, i) => sum + (i.estimatedPrice || 0), 0)
        const expiring = inv.filter(i => {
          if (!i.predictedDate) return false
          const predicted = new Date(i.predictedDate)
          const now = new Date()
          const msLeft = predicted.getTime() - now.getTime()
          const daysLeft = Math.ceil(msLeft / (1000*60*60*24))
          return daysLeft <= 1 && daysLeft >= 0
        }).length

        setStats({
          itemsScanned: inv.length,
          wastePrevented: Math.round(totalSaved),
          expiringSoon: expiring
        })
      } catch (error) {
        console.error("Failed to fetch inventory:", error)
        // Don't show error toast, just set default values
        setStats({
          itemsScanned: 0,
          wastePrevented: 0,
          expiringSoon: 0
        })
      } finally {
        setStatsLoading(false)
      }
    }

    fetchInventory()
  }, [token, toast, router])

  // simple logout
  const onLogout = async () => {
    await logout();
    router.push("/login");
  };

  // forget account
  const onForget = async () => {
    if (confirm("Delete your account permanently?")) {
      await deleteAccount();
      router.push("/login");
    }
  };

  if (statsLoading) {
    return <Loading />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-r from-green-500 to-blue-500 rounded-lg flex items-center justify-center">
                <Image
                  src="/SpoilSense_logo.png"
                  alt="SpoilSense Logo"
                  width={32}
                  height={32}
                  className="object-contain"
                />
              </div>
              <span className="text-xl font-bold text-gray-900">SpoilSense</span>
            </div>
            <Button variant="ghost" onClick={onLogout}>
              <LogOut className="w-4 h-4 mr-2" /> Logout
            </Button>

            <Button variant="destructive" onClick={onForget} className="ml-4">
              Delete My Account
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome back!</h1>
          <p className="text-lg text-gray-600">
            Ready to predict food spoilage and reduce waste? Choose an option below to get started.
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Items Scanned */}
          <Card>
            <CardHeader className="flex items-center justify-between pb-2">
              <CardTitle className="text-sm">Items Scanned</CardTitle>
              <Scan className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.itemsScanned}</div>
              <p className="text-xs text-muted-foreground">total so far</p>
            </CardContent>
          </Card>

          {/* Waste Prevented */}
          <Card>
            <CardHeader className="flex items-center justify-between pb-2">
              <CardTitle className="text-sm">Waste Prevented</CardTitle>
              <Leaf className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${stats.wastePrevented}</div>
              <p className="text-xs text-muted-foreground">estimated saved</p>
            </CardContent>
          </Card>

          {/* Expiring Soon */}
          <Card>
            <CardHeader className="flex items-center justify-between pb-2">
              <CardTitle className="text-sm">Expiring Soon</CardTitle>
              <Clock className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.expiringSoon}</div>
              <p className="text-xs text-muted-foreground">within 24 hrs</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Actions */}
        <div className="grid md:grid-cols-2 gap-8 mb-8">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <Link href="/scan">
              <CardHeader>
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <Camera className="w-6 h-6 text-green-600" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">Scan Food</CardTitle>
                    <CardDescription>Take a photo to predict when your food will expire</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center text-sm text-gray-600">
                    <span className="w-2 h-2 bg-green-500 rounded-full mr-2" /> AI-powered image analysis
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <span className="w-2 h-2 bg-blue-500 rounded-full mr-2" /> Environmental factor consideration
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <span className="w-2 h-2 bg-purple-500 rounded-full mr-2" /> Instant predictions
                  </div>
                </div>
                <Button className="w-full mt-4">Start Scanning</Button>
              </CardContent>
            </Link>
          </Card>

          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <Link href="/inventory">
              <CardHeader>
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Package className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">View Inventory</CardTitle>
                    <CardDescription>Manage all your scanned food items and predictions</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center text-sm text-gray-600">
                    <span className="w-2 h-2 bg-orange-500 rounded-full mr-2" /> Track expiration dates
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <span className="w-2 h-2 bg-red-500 rounded-full mr-2" /> Get expiry alerts
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <span className="w-2 h-2 bg-green-500 rounded-full mr-2" /> Export data
                  </div>
                </div>
                <Button variant="outline" className="w-full mt-4 bg-transparent">
                  View Inventory
                </Button>
              </CardContent>
            </Link>
          </Card>

          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <Link href="/recipe-suggestions">
              <CardHeader>
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Package className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">Recipe Suggestions</CardTitle>
                    <CardDescription>Make the most of your ingredients</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center text-sm text-gray-600">
                    <span className="w-2 h-2 bg-orange-500 rounded-full mr-2" /> Upload photos of your groceries
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <span className="w-2 h-2 bg-red-500 rounded-full mr-2" /> Get AI-powered recipe suggestions
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <span className="w-2 h-2 bg-green-500 rounded-full mr-2" /> Go to recipe links
                  </div>
                </div>
                <Button variant="outline" className="w-full mt-4 bg-transparent">
                  Get Recipes
                </Button>
              </CardContent>
            </Link>
          </Card>
        </div>

        {/* How It Works */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <BarChart3 className="w-5 h-5 mr-2" />
              How SpoilSense Works
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <span className="text-green-600 font-bold">1</span>
                </div>
                <h3 className="font-semibold mb-2">Capture</h3>
                <p className="text-sm text-gray-600">Take a photo of your food item using your device camera</p>
              </div>
              <div className="text-center">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <span className="text-blue-600 font-bold">2</span>
                </div>
                <h3 className="font-semibold mb-2">Analyze</h3>
                <p className="text-sm text-gray-600">Our AI analyzes the image with environmental data</p>
              </div>
              <div className="text-center">
                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <span className="text-purple-600 font-bold">3</span>
                </div>
                <h3 className="font-semibold mb-2">Predict</h3>
                <p className="text-sm text-gray-600">Get accurate expiration predictions and save to inventory</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

// Wrap the dashboard with AuthGuard
export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  )
}
