"use client"

import { useState, useEffect } from "react"
import { useAuth }            from "@/hooks/useAuth"
import axios                  from "axios"
import Loading                from "./loading"
import { useToast }           from "@/hooks/use-toast"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { ArrowLeft, Search, Calendar, Clock, Thermometer, Droplets, AlertTriangle } from "lucide-react"
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
  spoilageDays: number
  confidence: number
  storageType: "room" | "fridge"
  temperature?: number
  humidity?: number
  status: Exclude<Status, "all">
}

export default function InventoryPage() {
  const { user, token, loading: authLoading } = useAuth()
  const { toast } = useToast()

  const [inventory, setInventory]       = useState<InventoryItem[]>([])
  const [searchTerm, setSearchTerm]     = useState<string>("")
  const [filterStatus, setFilterStatus] = useState<Status>("all")
  const [isLoading, setIsLoading]       = useState<boolean>(true)

  useEffect(() => {
    if (!authLoading && user && token) {
      axios.get(`${process.env.NEXT_PUBLIC_API_URL}/inventory`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(res => {
        // Map raw to our InventoryItem & compute status
        const items: InventoryItem[] = res.data.map((item: any) => {
          const days = item.spoilageDays as number
          let status: InventoryItem["status"] = "fresh"
          if (days < 0) status = "expired"
          else if (days <= 1) status = "expiring"

          return {
            id:            item.id,
            productName:   item.productName,
            imageUrl:      item.imageUrl,
            scanTime:      item.scanTime,
            predictedDate: item.predictedDate,
            spoilageDays:  days,
            confidence:    item.confidence,
            storageType:   item.storageType,
            temperature:   item.temperature,
            humidity:      item.humidity,
            status,
          }
        })
        setInventory(items)
      })
      .catch(err => {
        console.error(err)
        toast({ title: "Failed to load inventory", variant: "destructive" })
      })
      .finally(() => setIsLoading(false))
    }
  }, [authLoading, user, token, toast])

  const filtered = inventory.filter(item => {
    const nameMatches = item.productName.toLowerCase().includes(searchTerm.toLowerCase())
    const statusMatches = filterStatus === "all" || item.status === filterStatus
    return nameMatches && statusMatches
  })

  if (authLoading || isLoading) return <Loading />

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="flex items-center mb-4 space-x-4">
        <Button variant="ghost" onClick={() => window.history.back()}>
          <ArrowLeft /> Back
        </Button>
        <Input
          placeholder="Search…"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="flex-1"
          icon={<Search />}
        />
        <Select
          value={filterStatus}
          onValueChange={(value: string) => setFilterStatus(value as Status)}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Filter status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="fresh">Fresh</SelectItem>
            <SelectItem value="expiring">Expiring</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center text-gray-500 mt-20">No items found.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(item => (
            <Card key={item.id}>
              <CardHeader>
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
                <img
                  src={item.imageUrl}
                  alt={item.productName}
                  className="w-full h-48 object-cover rounded"
                />
                <div><Calendar className="inline-block mr-1" /> Scanned: {new Date(item.scanTime).toLocaleDateString()}</div>
                <div><Clock    className="inline-block mr-1" /> Expires: {new Date(item.predictedDate).toLocaleDateString()}</div>
                {item.temperature != null && (
                  <div><Thermometer className="inline-block mr-1" /> Temp: {item.temperature}°C</div>
                )}
                {item.humidity != null && (
                  <div><Droplets    className="inline-block mr-1" /> Humidity: {item.humidity}%</div>
                )}
                <div><AlertTriangle className="inline-block mr-1" /> Confidence: {item.confidence}%</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
