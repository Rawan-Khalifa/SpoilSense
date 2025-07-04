"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  ArrowLeft,
  Search,
  Filter,
  Trash2,
  Download,
  Calendar,
  Thermometer,
  Droplets,
  AlertTriangle,
  CheckCircle,
  Clock,
} from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { useToast } from "@/hooks/use-toast"

interface InventoryItem {
  id: string
  productName: string
  image: string
  scanDate: string
  expiryDate: string
  daysLeft: number
  temperature: number
  humidity: number
  storageType: string
  confidence: number
  status: "fresh" | "expiring" | "expired"
}

const mockInventory: InventoryItem[] = [
  {
    id: "1",
    productName: "Fresh Banana",
    image: "/placeholder.svg?height=200&width=200",
    scanDate: "2024-01-15 10:30 AM",
    expiryDate: "2024-01-18 10:30 AM",
    daysLeft: 3.4,
    temperature: 22,
    humidity: 65,
    storageType: "room",
    confidence: 92,
    status: "fresh",
  },
  {
    id: "2",
    productName: "Red Apple",
    image: "/placeholder.svg?height=200&width=200",
    scanDate: "2024-01-14 02:15 PM",
    expiryDate: "2024-01-16 02:15 PM",
    daysLeft: 1.2,
    temperature: 4,
    humidity: 85,
    storageType: "fridge",
    confidence: 88,
    status: "expiring",
  },
  {
    id: "3",
    productName: "Strawberries",
    image: "/placeholder.svg?height=200&width=200",
    scanDate: "2024-01-12 09:45 AM",
    expiryDate: "2024-01-15 09:45 AM",
    daysLeft: -0.5,
    temperature: 4,
    humidity: 90,
    storageType: "fridge",
    confidence: 95,
    status: "expired",
  },
  {
    id: "4",
    productName: "Orange",
    image: "/placeholder.svg?height=200&width=200",
    scanDate: "2024-01-13 04:20 PM",
    expiryDate: "2024-01-20 04:20 PM",
    daysLeft: 5.8,
    temperature: 20,
    humidity: 60,
    storageType: "room",
    confidence: 90,
    status: "fresh",
  },
  {
    id: "5",
    productName: "Lettuce",
    image: "/placeholder.svg?height=200&width=200",
    scanDate: "2024-01-14 11:00 AM",
    expiryDate: "2024-01-17 11:00 AM",
    daysLeft: 2.1,
    temperature: 4,
    humidity: 95,
    storageType: "fridge",
    confidence: 87,
    status: "expiring",
  },
  {
    id: "6",
    productName: "Tomato",
    image: "/placeholder.svg?height=200&width=200",
    scanDate: "2024-01-11 03:30 PM",
    expiryDate: "2024-01-19 03:30 PM",
    daysLeft: 4.2,
    temperature: 18,
    humidity: 70,
    storageType: "room",
    confidence: 93,
    status: "fresh",
  },
]

export default function InventoryPage() {
  const [searchTerm, setSearchTerm] = useState("")
  const [filterStatus, setFilterStatus] = useState("all")
  const [inventory, setInventory] = useState(mockInventory)
  const { toast } = useToast()

  const filteredInventory = inventory.filter((item) => {
    const matchesSearch = item.productName.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesFilter = filterStatus === "all" || item.status === filterStatus
    return matchesSearch && matchesFilter
  })

  const handleDeleteItem = (id: string) => {
    setInventory((prev) => prev.filter((item) => item.id !== id))
    toast({
      title: "Item deleted",
      description: "The item has been removed from your inventory.",
    })
  }

  const handleExportData = () => {
    toast({
      title: "Export started",
      description: "Your inventory data is being prepared for download.",
    })
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "fresh":
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case "expiring":
        return <Clock className="w-4 h-4 text-yellow-500" />
      case "expired":
        return <AlertTriangle className="w-4 h-4 text-red-500" />
      default:
        return null
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "fresh":
        return <Badge className="bg-green-100 text-green-800">Fresh</Badge>
      case "expiring":
        return <Badge className="bg-yellow-100 text-yellow-800">Expiring Soon</Badge>
      case "expired":
        return <Badge className="bg-red-100 text-red-800">Expired</Badge>
      default:
        return null
    }
  }

  const stats = {
    total: inventory.length,
    fresh: inventory.filter((item) => item.status === "fresh").length,
    expiring: inventory.filter((item) => item.status === "expiring").length,
    expired: inventory.filter((item) => item.status === "expired").length,
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Link href="/dashboard" className="flex items-center text-gray-600 hover:text-gray-900">
                <ArrowLeft className="w-5 h-5 mr-2" />
                Back to Dashboard
              </Link>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-xl font-bold text-gray-900">Food Inventory</span>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Items</p>
                  <p className="text-2xl font-bold">{stats.total}</p>
                </div>
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Calendar className="w-4 h-4 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Fresh</p>
                  <p className="text-2xl font-bold text-green-600">{stats.fresh}</p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Expiring</p>
                  <p className="text-2xl font-bold text-yellow-600">{stats.expiring}</p>
                </div>
                <Clock className="w-8 h-8 text-yellow-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Expired</p>
                  <p className="text-2xl font-bold text-red-600">{stats.expired}</p>
                </div>
                <AlertTriangle className="w-8 h-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filter */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Search food items..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-full sm:w-48">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Items</SelectItem>
                  <SelectItem value="fresh">Fresh</SelectItem>
                  <SelectItem value="expiring">Expiring Soon</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleExportData} variant="outline">
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Inventory Grid */}
        {filteredInventory.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                <Search className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No items found</h3>
              <p className="text-gray-500">
                {searchTerm || filterStatus !== "all"
                  ? "Try adjusting your search or filter criteria"
                  : "Start scanning food items to build your inventory"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredInventory.map((item) => (
              <Card key={item.id} className="hover:shadow-lg transition-shadow">
                <CardHeader className="pb-3">
                  <div className="relative w-full h-48 bg-gray-100 rounded-lg overflow-hidden mb-3">
                    <Image
                      src={item.image || "/placeholder.svg"}
                      alt={item.productName}
                      fill
                      className="object-cover"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{item.productName}</CardTitle>
                    {getStatusIcon(item.status)}
                  </div>
                  <div className="flex items-center justify-between">
                    {getStatusBadge(item.status)}
                    <span className="text-sm text-gray-500">{item.confidence}% confidence</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-gray-600">Scanned:</span>
                      <p className="font-medium">{item.scanDate}</p>
                    </div>
                    <div>
                      <span className="text-gray-600">Expires:</span>
                      <p className="font-medium">{item.expiryDate}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Days left:</span>
                    <span
                      className={`font-bold ${
                        item.daysLeft > 2 ? "text-green-600" : item.daysLeft > 0 ? "text-yellow-600" : "text-red-600"
                      }`}
                    >
                      {item.daysLeft > 0 ? `${item.daysLeft} days` : "Expired"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center">
                      <Thermometer className="w-4 h-4 mr-1 text-gray-400" />
                      <span>{item.temperature}°C</span>
                    </div>
                    <div className="flex items-center">
                      <Droplets className="w-4 h-4 mr-1 text-gray-400" />
                      <span>{item.humidity}%</span>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {item.storageType === "room" ? "Room Temp" : "Refrigerated"}
                    </Badge>
                  </div>

                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="destructive" size="sm" className="w-full">
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete Item
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Delete {item.productName}?</DialogTitle>
                        <DialogDescription>
                          This action cannot be undone. This will permanently remove the item from your inventory.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="flex justify-end space-x-2 mt-4">
                        <Button variant="outline">Cancel</Button>
                        <Button variant="destructive" onClick={() => handleDeleteItem(item.id)}>
                          Delete
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
