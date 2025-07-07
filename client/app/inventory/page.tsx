"use client"

import { useState, useEffect } from "react"
import { useAuth }            from "@/hooks/useAuth"
import axios                  from "axios"
import Loading                from "./loading"
import { useToast }           from "@/hooks/use-toast"
import {
  Card, CardHeader, CardTitle, CardContent
} from "@/components/ui/card"
import {
  ArrowLeft, Search, Filter, Trash2, Download,
  Calendar, Thermometer, Droplets, AlertTriangle,
  CheckCircle, Clock
} from "lucide-react"
import { Input }              from "@/components/ui/input"
import { Badge }              from "@/components/ui/badge"
import { Button }             from "@/components/ui/button"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"

export default function InventoryPage() {
  const { user, token, loading: authLoading } = useAuth()
  const { toast } = useToast()
  const [inventory, setInventory]       = useState([])
  const [searchTerm, setSearchTerm]     = useState("")
  const [filterStatus, setFilterStatus] = useState("all")
  const [isLoading, setIsLoading]       = useState(true)

  // 1) Fetch real inventory once signed in
  useEffect(() => {
    if (!authLoading && user && token) {
      axios.get(`${process.env.NEXT_PUBLIC_API_URL}/inventory`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(res => setInventory(res.data))
      .catch(err => {
        console.error(err)
        toast({ title: "Failed to load inventory", variant: "destructive" })
      })
      .finally(() => setIsLoading(false))
    }
  }, [authLoading, user, token])

  // 2) Filter & search
  const filtered = inventory.filter(item => {
    const matchesSearch = item.productName.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesFilter = filterStatus === "all" || item.status === filterStatus
    return matchesSearch && matchesFilter
  })

  if (authLoading || isLoading) return <Loading />

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ... Your header, stats and controls ... */}
      {/* Use `filtered` instead of `mockInventory` */}
      {filtered.length === 0
        ? /* no items UI */
        : filtered.map(item => (
            <Card key={item.id}>
              <CardHeader>
                <CardTitle>{item.productName}</CardTitle>
                {/* ... */}
              </CardHeader>
              <CardContent>
                {/* use item.image, item.scanDate, item.expiryDate, etc. */}
              </CardContent>
            </Card>
          ))
      }
    </div>
  )
}
