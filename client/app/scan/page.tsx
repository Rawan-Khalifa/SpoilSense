// client/app/scan/page.tsx
"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/hooks/useAuth"
import axios from "axios"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import Image from "next/image"
import {
  Upload,
  Camera,
  ArrowLeft,
  Droplets,
  Thermometer,
  Scan,
  Clock,
  Save,
  RotateCcw,
  Trash2,
  Home
} from "lucide-react"
import Link from "next/link"
import { useToast } from "@/hooks/use-toast"

interface PredictionResult {
  id: string
  imageUrl: string
  spoilageDays: number
  storageType: string
  temperature?: number
  humidity?: number
  scanTime: string
}

export default function ScanPage() {
  const { user, token, loading: authLoading } = useAuth()
  const router = useRouter()
  const { toast } = useToast()

  // image file + preview
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)

  // geolocation
  const [location, setLocation] = useState<{ lat: number; lon: number } | null>(null)
  const [locError, setLocError] = useState<string | null>(null)

  // environment & storage
  const [storageType, setStorageType] = useState<"room" | "fridge">("room")
  const [temperature, setTemperature] = useState<number[]>([4])   // default fridge temp
  const [humidity, setHumidity] = useState<number[]>([65])       // default fridge RH

  // UI state
  const [isLoading, setIsLoading]     = useState(false)
  const [prediction, setPrediction]   = useState<PredictionResult | null>(null)
  const [showSaveDialog, setShowSaveDialog] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // 1) Ask for location once on mount
  useEffect(() => {
    if (!location && !locError && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => setLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        err => setLocError(err.message),
        { enableHighAccuracy: true }
      )
    }
  }, [location, locError])

  // 2) Handle file selection
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSelectedFile(file)
    setSelectedImage(URL.createObjectURL(file))
    setPrediction(null)
  }

  // 3) Kick off the POST /inventory call
  const handleStartPrediction = async () => {
    if (!selectedFile) {
      toast({ title: "No image", description: "Please choose an image first.", variant: "destructive" })
      return
    }
    if (!location) {
      toast({ title: "Location needed", description: "Please allow location access.", variant: "destructive" })
      return
    }
    if (!token) {
      toast({ title: "Not signed in", description: "Please log in again.", variant: "destructive" })
      return
    }

    setIsLoading(true)
    try {
      const form = new FormData()
      form.append("image", selectedFile)
      form.append("latitude",  location.lat.toString())
      form.append("longitude", location.lon.toString())
      form.append("storageType", storageType)
      // only send override if fridge
      if (storageType === "fridge") {
        form.append("temperature", temperature[0].toString())
        form.append("humidity",    humidity[0].toString())
      }
      // record exact scan time
      const nowIso = new Date().toISOString()
      form.append("scanTime", nowIso)

      const resp = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/inventory`,
        form,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "multipart/form-data"
          }
        }
      )
      const data: PredictionResult = resp.data
      // format scanTime for display
      data.scanTime = new Date(data.scanTime || nowIso).toLocaleString()
      setPrediction(data)

      toast({
        title: "Prediction complete",
        description: `Expires in ${data.spoilageDays} days.`,
      })
    } catch (err: any) {
      console.error(err)
      toast({
        title: "Prediction failed",
        description: err.response?.data?.error || err.message || "Try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  // 4) Save dialog / retake / delete
  const handleSaveToInventory = () => setShowSaveDialog(true)
  const handleRetake = () => {
    setSelectedFile(null)
    setSelectedImage(null)
    setPrediction(null)
    fileInputRef.current!.value = ""
  }
  const handleDelete = () => {
    handleRetake()
    toast({ title: "Scan deleted", description: "You can start over." })
  }

  // Redirect to login if not authed
  useEffect(() => {
    if (!authLoading && !user) router.push("/login")
  }, [authLoading, user])

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b p-4 flex justify-between items-center">
        <Link href="/dashboard" className="flex items-center text-gray-600 hover:text-gray-900">
          <ArrowLeft className="w-5 h-5 mr-2" /> Dashboard
        </Link>
        <h1 className="text-xl font-bold">Food Scanner</h1>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-6">
        {!selectedImage ? (
          /* Upload Section */
          <Card>
            <CardHeader className="text-center">
              <CardTitle>Scan Your Food</CardTitle>
              <CardDescription>
                Upload or snap a photo to predict spoilage.
                {locError && (
                  <div className="text-red-500 mt-2">
                    ⚠️ Location error: {locError}
                  </div>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              <Button onClick={() => fileInputRef.current?.click()} size="lg">
                <Upload className="w-4 h-4 mr-2" /> Choose Image
              </Button>
            </CardContent>
          </Card>
        ) : (
          /* Preview + Controls */
          <>
            <Card>
              <CardHeader>
                <CardTitle>Preview</CardTitle>
                <CardDescription>
                  Scanned at {new Date().toLocaleString()}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="w-full h-64 relative bg-gray-100 rounded overflow-hidden">
                  <Image src={selectedImage} alt="Preview" fill className="object-cover" />
                </div>
              </CardContent>
            </Card>

            {/* Storage Type */}
            {!prediction && (
              <Card>
                <CardHeader>
                  <CardTitle>
                    <Thermometer className="w-5 h-5 mr-2" /> Storage Type
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <RadioGroup value={storageType} onValueChange={setStorageType}>
                    <div className="flex items-center space-x-4">
                      <RadioGroupItem value="room" id="room" />
                      <Label htmlFor="room">Room Temperature</Label>
                      <RadioGroupItem value="fridge" id="fridge" />
                      <Label htmlFor="fridge">Refrigerated</Label>
                    </div>
                  </RadioGroup>
                </CardContent>
              </Card>
            )}

            {/* Manual Env Controls if Refrigerated */}
            {!prediction && storageType === "fridge" && (
              <Card>
                <CardHeader>
                  <CardTitle>
                    <Droplets className="w-5 h-5 mr-2" /> Temperature & Humidity
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Temperature: {temperature[0]}°C</Label>
                    <Slider
                      value={temperature}
                      onValueChange={setTemperature}
                      min={0}
                      max={10}
                      step={1}
                    />
                  </div>
                  <div>
                    <Label>Humidity: {humidity[0]}%</Label>
                    <Slider
                      value={humidity}
                      onValueChange={setHumidity}
                      min={0}
                      max={100}
                      step={5}
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Prediction Button */}
            {!prediction && (
              <Card>
                <CardContent>
                  <Button
                    onClick={handleStartPrediction}
                    disabled={isLoading}
                    className="w-full"
                    size="lg"
                  >
                    {isLoading
                      ? "Analyzing…"
                      : (
                        <span className="flex items-center">
                          <Scan className="w-5 h-5 mr-2" />
                          Start Prediction
                        </span>
                      )
                    }
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Results */}
            {prediction && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>
                      <Clock className="w-5 h-5 mr-2" /> Results
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p>
                      Spoilage in <strong>{prediction.spoilageDays} days</strong>
                    </p>
                    <p>Storage: {prediction.storageType}</p>
                    {prediction.temperature != null && (
                      <p>Temp: {prediction.temperature}°C</p>
                    )}
                    {prediction.humidity != null && (
                      <p>Humidity: {prediction.humidity}%</p>
                    )}
                    <p>Scanned: {prediction.scanTime}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="flex space-x-4">
                    <Button onClick={handleSaveToInventory} className="flex-1">
                      <Save className="w-4 h-4 mr-2" /> Save
                    </Button>
                    <Button variant="outline" onClick={handleRetake} className="flex-1">
                      <RotateCcw className="w-4 h-4 mr-2" /> Retake
                    </Button>
                    <Button variant="destructive" onClick={handleDelete} className="flex-1">
                      <Trash2 className="w-4 h-4 mr-2" /> Delete
                    </Button>
                  </CardContent>
                </Card>
              </>
            )}
          </>
        )}
      </main>

      {/* Save Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Saved!</DialogTitle>
            <DialogDescription>
              Your scan has been added to your inventory.
            </DialogDescription>
          </DialogHeader>
          <div className="flex space-x-4 mt-4">
            <Link href="/scan">
              <Button>
                <Scan className="w-4 h-4 mr-2" /> New Scan
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button variant="outline">
                <Home className="w-4 h-4 mr-2" /> Dashboard
              </Button>
            </Link>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
