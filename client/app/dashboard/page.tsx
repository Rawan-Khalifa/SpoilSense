"use client"

import { useState, useEffect } from "react"
import { Button }                      from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Scan, Leaf, Clock, LogOut }  from "lucide-react"
import Image                           from "next/image"
import Link                            from "next/link"
import { useRouter }                   from "next/navigation"
import { useAuth }                     from "@/hooks/useAuth"
import axios                           from "axios"
import Loading                         from "@/app/inventory/loading"
import { useToast }                    from "@/hooks/use-toast"

interface InventoryItem {
  id: string
  status: "fresh"|"expiring"|"expired"
  estimatedPrice: number
}

export default function DashboardPage() {
  const router = useRouter()
  const { user, token, loading: authLoading } = useAuth()
  const { toast } = useToast()

  const [scanned, setScanned]             = useState(0)
  const [saved, setSaved]                 = useState(0)
  const [expiringSoon, setExpiringSoon]   = useState(0)
  const [loading, setLoading]             = useState(true)

  useEffect(() => {
    if (!authLoading && user && token) {
      axios.get(`${process.env.NEXT_PUBLIC_API_URL}/inventory`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(res => {
        const items: InventoryItem[] = res.data
        setScanned(items.length)
        setExpiringSoon(
          items.filter(i => i.status === "expiring").length
        )
        setSaved(
          Math.round(
            items.reduce((sum, i) => sum + (i.estimatedPrice||0), 0)
          )
        )
      })
      .catch(err => {
        console.error(err)
        toast({ title: "Failed to load dashboard stats", variant: "destructive"})
      })
      .finally(() => setLoading(false))
    }
  }, [authLoading, user, token, toast])

  if (authLoading || loading) return <Loading />

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ... header unchanged ... */}

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader className="flex justify-between items-center pb-2">
              <CardTitle className="text-sm">Items Scanned</CardTitle>
              <Scan className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{scanned}</div>
              <p className="text-xs text-muted-foreground">total so far</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex justify-between items-center pb-2">
              <CardTitle className="text-sm">Waste Prevented</CardTitle>
              <Leaf className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${saved}</div>
              <p className="text-xs text-muted-foreground">estimated saved</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex justify-between items-center pb-2">
              <CardTitle className="text-sm">Expiring Soon</CardTitle>
              <Clock className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{expiringSoon}</div>
              <p className="text-xs text-muted-foreground">within 24 hrs</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Actions… (unchanged) */}
      </div>
    </div>
  )
}
