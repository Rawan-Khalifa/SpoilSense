"use client"

import { useState, useEffect } from "react"
import { useAuth }            from "@/hooks/useAuth"
import axios                  from "axios"
import Loading                from "./loading"
import { useToast }           from "@/hooks/use-toast"
import { AuthGuard }          from "@/components/auth-guard"
import { makeAuthenticatedRequest, handleApiError } from "@/lib/api-client"
import {
  Card, CardHeader, CardTitle, CardContent
} from "@/components/ui/card"
import {
  ArrowLeft, Search, Calendar, Clock,
  Thermometer, Droplets, AlertTriangle, Trash2
} from "lucide-react"
import { Input }              from "@/components/ui/input"
import { Badge }              from "@/components/ui/badge"
import { Button }             from "@/components/ui/button"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"

type Status = "all" | "fresh" | "expiring" | "expired"

interface InventoryItem {
  id: string
  productName: string
  imageUrl: string
  scanTime: string
  predictedDate: string
  spoilageDays: number       // initial days
  confidence: number
  storageType: "room"|"fridge"
  temperature?: number
  humidity?: number
  status: Exclude<Status,"all">
}

function InventoryPageContent() {
  const { user, token, loading: authLoading } = useAuth()
  const { toast } = useToast()
  const [inventory, setInventory]       = useState<InventoryItem[]>([])
  const [searchTerm, setSearchTerm]     = useState<string>("")
  const [filterStatus, setFilterStatus] = useState<Status>("all")
  const [isLoading, setIsLoading]       = useState<boolean>(true)

  // Fetch & shape
  useEffect(() => {
    if (!token) return

    const fetchInventory = async () => {
      try {
        const response = await axios.get(
          `${process.env.NEXT_PUBLIC_API_BASE_URL}/inventory`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        
        const now = new Date()
        const items: InventoryItem[] = response.data.map((item: any) => {
          // compute remaining days
          const predicted = new Date(item.predictedDate)
          const msLeft    = predicted.getTime() - now.getTime()
          const daysLeft  = Math.ceil(msLeft / (1000*60*60*24))
          // compute status
          let status: InventoryItem["status"] = "fresh"
          if (daysLeft < 0)      status = "expired"
          else if (daysLeft <= 1) status = "expiring"

          return {
            id:            item.id,
            productName:   item.productName,
            imageUrl:      item.imageUrl,
            scanTime:      item.scanTime,
            predictedDate: item.predictedDate,
            spoilageDays:  item.spoilageDays,
            confidence:    item.confidence,
            storageType:   item.storageType,
            temperature:   item.temperature,
            humidity:      item.humidity,
            status,
          }
        })
        setInventory(items)
      } catch (error) {
        console.error(error)
        toast({ title: "Failed to load inventory", variant: "destructive" })
      } finally {
        setIsLoading(false)
      }
    }

    fetchInventory()
  }, [token, toast])

  // Remove one item locally + server
  const handleDelete = async (id: string) => {
    if (!confirm("Remove this item?")) return
    try {
      await axios.delete(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/inventory/${id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setInventory(inv => inv.filter(i => i.id !== id))
      toast({ title: "Deleted", variant: "default" })
    } catch (e) {
      console.error(e)
      toast({ title: "Delete failed", variant: "destructive" })
    }
  }

  // filter+search
  const filtered = inventory.filter(item => {
    if (!item.productName.toLowerCase().includes(searchTerm.toLowerCase())) return false
    if (filterStatus !== "all" && item.status !== filterStatus) return false
    return true
  })

  if (authLoading || isLoading) return <Loading />

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      {/* Header + Controls */}
      <div className="flex flex-wrap items-center mb-6 gap-4">
        <Button variant="ghost" onClick={() => window.history.back()}>
          <ArrowLeft /> Back
        </Button>
        <Input
          placeholder="Search…"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="flex-1 max-w-xs"
        />
        <Select
          value={filterStatus}
          onValueChange={(v: string) => setFilterStatus(v as Status)}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Filter status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="fresh">Fresh</SelectItem>
            <SelectItem value="expiring">Expiring Soon</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center text-gray-500 mt-20">No items found.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map(item => {
            // re-calc for UI
            const now = new Date()
            const pred = new Date(item.predictedDate)
            const msLeft = pred.getTime() - now.getTime()
            const daysLeft = Math.max(0, Math.ceil(msLeft / (1000*60*60*24)))
            const pct = Math.max(0, Math.min(100, (daysLeft / item.spoilageDays) * 100))

            return (
              <Card key={item.id} className="relative">
                {/* top-right delete */}
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute top-2 right-2"
                  onClick={() => handleDelete(item.id)}
                >
                  <Trash2 />
                </Button>

                <CardHeader className="pb-2">
                  <CardTitle className="flex justify-between items-center">
                    {item.productName}
                    <Badge
                      variant={
                        item.status === "expired"  ? "destructive" :
                        item.status === "expiring" ? "outline"     :
                                                     "secondary"
                      }
                    >
                      {item.status}
                    </Badge>
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-2">
                  <div className="rounded overflow-hidden">
                    <div className="h-2 bg-gray-200">
                      <div
                        className={`h-full ${
                          item.status === "expired"  ? "bg-red-500" :
                          item.status === "expiring" ? "bg-yellow-400" :
                                                       "bg-green-500"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <img
                      src={item.imageUrl}
                      alt={item.productName}
                      className="w-full h-44 object-cover mt-1"
                      onError={(e) => {
                        // Fallback to a placeholder image
                        e.currentTarget.src = '/placeholder-food.png';
                      }}
                      onLoad={() => {
                        // Optional: Remove cache buster after successful load
                      }}
                    />
                  </div>
                  <div className="flex items-center text-sm text-gray-700">
                    <Calendar className="mr-1" /> Scanned: {new Date(item.scanTime).toLocaleDateString()}
                  </div>
                  <div className="flex items-center text-sm text-gray-700">
                    <Clock className="mr-1" /> Expires: {pred.toLocaleDateString()}
                  </div>
                  {item.storageType === "fridge" && item.temperature != null && (
                    <div className="flex items-center text-sm text-gray-700">
                      <Thermometer className="mr-1" /> {item.temperature}°C
                    </div>
                  )}
                  {item.storageType === "fridge" && item.humidity != null && (
                    <div className="flex items-center text-sm text-gray-700">
                      <Droplets className="mr-1" /> {item.humidity}%
                    </div>
                  )}
                  <div className="flex items-center text-sm text-gray-700">
                    <AlertTriangle className="mr-1" /> Confidence: {item.confidence}%
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Wrap with AuthGuard
export default function InventoryPage() {
  return (
    <AuthGuard>
      <InventoryPageContent />
    </AuthGuard>
  )
}
