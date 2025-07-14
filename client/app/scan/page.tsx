// client/app/scan/page.tsx
"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/hooks/useAuth"
import axios from "axios"
import { Button } from "@/components/ui/button"
import {
  Card, CardHeader, CardTitle, CardDescription, CardContent
} from "@/components/ui/card"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogDescription
} from "@/components/ui/dialog"
import Image from "next/image"
import {
  Upload, ArrowLeft, Droplets, Thermometer,
  Scan, Clock, Save, RotateCcw, Trash2, Home
} from "lucide-react"
import Link from "next/link"
import { useToast } from "@/hooks/use-toast"

interface PredictionResult {
  id: string
  imageUrl: string
  spoilageDays: number
  storageType: "room"|"fridge"
  temperature?: number
  humidity?: number
  scanTime: string
}

export default function ScanPage() {
  const { user, token, loading: authLoading } = useAuth()
  const router = useRouter()
  const { toast } = useToast()

  // --- state ---
  const [selectedFile, setSelectedFile]     = useState<File|null>(null)
  const [selectedImage, setSelectedImage]   = useState<string|null>(null)
  const [location, setLocation]             = useState<{lat:number,lon:number}|null>(null)
  const [locError, setLocError]             = useState<string|null>(null)
  const [storageType, setStorageType]       = useState<"room"|"fridge">("room")
  const [temperature, setTemperature]       = useState<number[]>([4])
  const [humidity, setHumidity]             = useState<number[]>([65])
  const [isLoading, setIsLoading]           = useState(false)
  const [prediction, setPrediction]         = useState<PredictionResult|null>(null)
  const [showSaveDialog, setShowSaveDialog] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // --- get location once ---
  useEffect(() => {
    if (!location && !locError && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => setLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        err => setLocError(err.message),
        { enableHighAccuracy: true }
      )
    }
  }, [location, locError])

  // --- pick image ---
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSelectedFile(file)
    setSelectedImage(URL.createObjectURL(file))
    setPrediction(null)
  }

  // --- call GPT + backend to predict spoilage (but NOT save) ---
  const handleStartPrediction = async () => {
    if (!selectedFile) {
      return toast({ title: "No image", description: "Please choose an image first.", variant: "destructive" })
    }
    if (!location) {
      return toast({ title: "Location needed", description: "Please allow location access.", variant: "destructive" })
    }
    if (!token) {
      return toast({ title: "Not signed in", description: "Please log in again.", variant: "destructive" })
    }

    setIsLoading(true)
    try {
      const form = new FormData()
      form.append("image", selectedFile)
      form.append("latitude",  location.lat.toString())
      form.append("longitude", location.lon.toString())
      form.append("storageType", storageType)
      if (storageType === "fridge") {
        form.append("temperature", temperature[0].toString())
        form.append("humidity",    humidity[0].toString())
      }
      const nowIso = new Date().toISOString()
      form.append("scanTime", nowIso)

      // note: this endpoint ONLY predicts, does not save
      const resp = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/inventory`,  // <-- assume /predict returns GPT result only
        form,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "multipart/form-data"
          }
        }
      )
      const data: PredictionResult = resp.data
      data.scanTime = new Date(data.scanTime || nowIso).toLocaleString()
      setPrediction(data)

      toast({
        title: "Prediction complete",
        description: `Expires in ${data.spoilageDays} days.`,
      })
    } catch (err: any) {
      // special InvalidImage error from backend
      if (err.response?.status === 400 && err.response.data.error === "InvalidImage") {
        toast({
          title: "Invalid image",
          description: err.response.data.suggestion || err.response.data.message,
          variant: "destructive",
        })
        // reset to let user pick again
        setSelectedImage(null)
        setSelectedFile(null)
        fileInputRef.current!.value = ""
      } else {
        console.error(err)
        toast({
          title: "Prediction failed",
          description: err.response?.data?.error || err.message || "Please try a different image.",
          variant: "destructive",
        })
      }
    } finally {
      setIsLoading(false)
    }
  }

  // --- save to inventory (actually persists) ---
  const handleSaveToInventory = async () => {
    if (!prediction) {
      return toast({ title: "No prediction", description: "Run a prediction first.", variant: "destructive" })
    }
    try {
      // reuse formData or build new
      const form = new FormData()
      form.append("imageUrl", prediction.imageUrl)
      form.append("latitude",  location!.lat.toString())
      form.append("longitude", location!.lon.toString())
      form.append("storageType", prediction.storageType)
      if (prediction.storageType === "fridge") {
        form.append("temperature", prediction.temperature!.toString())
        form.append("humidity",    prediction.humidity!.toString())
      }
      form.append("scanTime", new Date(prediction.scanTime).toISOString())

      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/inventory`,
        form,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setShowSaveDialog(true)
    } catch (err: any) {
      console.error(err)
      toast({
        title: "Save failed",
        description: "Could not save to inventory. Please try again.",
        variant: "destructive",
      })
    }
  }

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

  // redirect if not logged in
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
          <Card>
            <CardHeader className="text-center">
              <CardTitle>Scan Your Food</CardTitle>
              <CardDescription>
                Upload or snap a photo to predict spoilage.
                {locError && <div className="text-red-500 mt-2">⚠️ Location error: {locError}</div>}
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
          <>
            <Card>
              <CardHeader>
                <CardTitle>Preview</CardTitle>
                <CardDescription>Scanned at {new Date().toLocaleString()}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="w-full h-64 relative bg-gray-100 rounded overflow-hidden">
                  <Image src={selectedImage} alt="Preview" fill className="object-cover" />
                </div>
              </CardContent>
            </Card>

            {!prediction && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle><Thermometer className="w-5 h-5 mr-2" /> Storage Type</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <RadioGroup value={storageType} onValueChange={setStorageType}>
                      <div className="flex items-center space-x-4">
                        <RadioGroupItem value="room" id="room" /><Label htmlFor="room">Room Temperature</Label>
                        <RadioGroupItem value="fridge" id="fridge" /><Label htmlFor="fridge">Refrigerated</Label>
                      </div>
                    </RadioGroup>
                  </CardContent>
                </Card>

                {storageType === "fridge" && (
                  <Card>
                    <CardHeader>
                      <CardTitle><Droplets className="w-5 h-5 mr-2" /> Temperature & Humidity</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <Label>Temperature: {temperature[0]}°C</Label>
                        <Slider value={temperature} onValueChange={setTemperature} min={0} max={10} step={1} />
                      </div>
                      <div>
                        <Label>Humidity: {humidity[0]}%</Label>
                        <Slider value={humidity} onValueChange={setHumidity} min={0} max={100} step={5} />
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardContent>
                    <Button
                      onClick={handleStartPrediction}
                      disabled={isLoading || !location}
                      className="w-full"
                      size="lg"
                    >
                      {isLoading
                        ? "Analyzing…"
                        : (<span className="flex items-center"><Scan className="w-5 h-5 mr-2" /> Start Prediction</span>)
                      }
                    </Button>
                  </CardContent>
                </Card>
              </>
            )}

            {prediction && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle><Clock className="w-5 h-5 mr-2" /> Results</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p>Spoilage in <strong>{prediction.spoilageDays} days</strong></p>
                    <p>Storage: {prediction.storageType}</p>
                    {prediction.temperature != null && <p>Temp: {prediction.temperature}°C</p>}
                    {prediction.humidity    != null && <p>Humidity: {prediction.humidity}%</p>}
                    <p>Scanned: {prediction.scanTime}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="flex space-x-4">
                    <Button onClick={handleSaveToInventory} className="flex-1">
                      <Save className="w-4 h-4 mr-2" /> Save
                    </Button>
                    <Button onClick={handleRetake} variant="outline" className="flex-1 bg-transparent">
                      <RotateCcw className="w-4 h-4 mr-2" /> Retake
                    </Button>
                    <Button onClick={handleDelete} variant="destructive" className="flex-1">
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
            <DialogDescription>Your scan has been added to your inventory.</DialogDescription>
          </DialogHeader>
          <div className="flex space-x-4 mt-4">
            <Link href="/scan"><Button><Scan className="w-4 h-4 mr-2" /> New Scan</Button></Link>
            <Link href="/dashboard"><Button variant="outline"><Home className="w-4 h-4 mr-2" /> Dashboard</Button></Link>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
