"use client"

import type React from "react"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Slider } from "@/components/ui/slider"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  Camera,
  Upload,
  ArrowLeft,
  Thermometer,
  Droplets,
  Clock,
  Trash2,
  RotateCcw,
  Save,
  Home,
  Scan,
} from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { useToast } from "@/hooks/use-toast"

interface PredictionResult {
  productName: string
  expiryDays: number
  confidence: number
  temperature: number
  humidity: number
  storageType: string
  scanTime: string
}

export default function ScanPage() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [temperature, setTemperature] = useState([22])
  const [humidity, setHumidity] = useState([65])
  const [storageType, setStorageType] = useState("room")
  const [isLoading, setIsLoading] = useState(false)
  const [prediction, setPrediction] = useState<PredictionResult | null>(null)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (e) => {
        setSelectedImage(e.target?.result as string)
        setPrediction(null)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleStartPrediction = async () => {
    if (!selectedImage) return

    setIsLoading(true)
    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 3000))

      const mockPrediction: PredictionResult = {
        productName: "Fresh Banana",
        expiryDays: 3.4,
        confidence: 92,
        temperature: temperature[0],
        humidity: humidity[0],
        storageType: storageType,
        scanTime: new Date().toLocaleString(),
      }

      setPrediction(mockPrediction)
      toast({
        title: "Prediction Complete!",
        description: `Your ${mockPrediction.productName} will expire in ${mockPrediction.expiryDays} days.`,
      })
    } catch (error) {
      toast({
        title: "Prediction failed",
        description: "Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleSaveToInventory = () => {
    setShowSaveDialog(true)
    toast({
      title: "Saved to Inventory!",
      description: "Your food prediction has been saved successfully.",
    })
  }

  const handleRetake = () => {
    setSelectedImage(null)
    setPrediction(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const handleDelete = () => {
    handleRetake()
    toast({
      title: "Scan deleted",
      description: "Your scan has been removed.",
    })
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
              <div className="w-8 h-8 bg-gradient-to-r from-green-500 to-blue-500 rounded-lg flex items-center justify-center">
                <Camera className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold text-gray-900">Food Scanner</span>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!selectedImage ? (
          /* Upload Section */
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Scan Your Food</CardTitle>
              <CardDescription>Upload a photo or take a picture to predict when your food will expire</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:border-gray-400 transition-colors">
                <div className="space-y-4">
                  <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center mx-auto">
                    <Upload className="w-8 h-8 text-gray-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Upload Food Image</h3>
                    <p className="text-gray-500 mb-4">Choose a clear, well-lit photo of your food item</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                    <Button onClick={() => fileInputRef.current?.click()}>
                      <Camera className="w-4 h-4 mr-2" />
                      Choose Image
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          /* Analysis Section */
          <div className="space-y-6">
            {/* Image Preview */}
            <Card>
              <CardHeader>
                <CardTitle>Uploaded Image</CardTitle>
                <CardDescription>Scan time: {new Date().toLocaleString()}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="relative w-full h-64 bg-gray-100 rounded-lg overflow-hidden">
                  <Image src={selectedImage || "/placeholder.svg"} alt="Uploaded food" fill className="object-cover" />
                </div>
              </CardContent>
            </Card>

            {/* Environmental Controls */}
            {!prediction && (
              <div className="grid md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Thermometer className="w-5 h-5 mr-2" />
                      Storage Conditions
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div>
                      <Label className="text-base font-medium mb-3 block">Storage Type</Label>
                      <RadioGroup value={storageType} onValueChange={setStorageType}>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="room" id="room" />
                          <Label htmlFor="room">Room Temperature</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="fridge" id="fridge" />
                          <Label htmlFor="fridge">Refrigerated</Label>
                        </div>
                      </RadioGroup>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Droplets className="w-5 h-5 mr-2" />
                      Environmental Settings
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div>
                      <Label className="text-sm font-medium mb-2 block">Temperature: {temperature[0]}°C</Label>
                      <Slider
                        value={temperature}
                        onValueChange={setTemperature}
                        max={35}
                        min={0}
                        step={1}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <Label className="text-sm font-medium mb-2 block">Humidity: {humidity[0]}%</Label>
                      <Slider
                        value={humidity}
                        onValueChange={setHumidity}
                        max={100}
                        min={0}
                        step={5}
                        className="w-full"
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Prediction Button or Loading */}
            {!prediction && (
              <Card>
                <CardContent className="pt-6">
                  <Button onClick={handleStartPrediction} disabled={isLoading} className="w-full" size="lg">
                    {isLoading ? (
                      <div className="flex items-center">
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                        Analyzing Image...
                      </div>
                    ) : (
                      <>
                        <Scan className="w-5 h-5 mr-2" />
                        Start Prediction
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Loading Animation */}
            {isLoading && (
              <Card>
                <CardContent className="py-12 text-center">
                  <div className="space-y-4">
                    <div className="w-16 h-16 border-4 border-green-200 border-t-green-500 rounded-full animate-spin mx-auto" />
                    <h3 className="text-lg font-medium">Analyzing your food...</h3>
                    <p className="text-gray-500">Our AI is processing the image and environmental data</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Prediction Results */}
            {prediction && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Clock className="w-5 h-5 mr-2" />
                      Prediction Results
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-6">
                      <div>
                        <h3 className="text-2xl font-bold text-green-600 mb-2">{prediction.productName}</h3>
                        <p className="text-lg text-gray-600 mb-4">
                          Expires in <span className="font-bold">{prediction.expiryDays} days</span>
                        </p>
                        <Badge variant="secondary">{prediction.confidence}% confidence</Badge>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Temperature:</span>
                          <span className="font-medium">{prediction.temperature}°C</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Humidity:</span>
                          <span className="font-medium">{prediction.humidity}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Storage:</span>
                          <span className="font-medium capitalize">{prediction.storageType}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Scanned:</span>
                          <span className="font-medium">{prediction.scanTime}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Action Buttons */}
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex flex-col sm:flex-row gap-3">
                      <Button onClick={handleSaveToInventory} className="flex-1">
                        <Save className="w-4 h-4 mr-2" />
                        Save to Inventory
                      </Button>
                      <Button onClick={handleRetake} variant="outline" className="flex-1 bg-transparent">
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Retake
                      </Button>
                      <Button onClick={handleDelete} variant="destructive" className="flex-1">
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Save Success Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Item Saved Successfully!</DialogTitle>
            <DialogDescription>
              Your food prediction has been added to your inventory. What would you like to do next?
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col sm:flex-row gap-3 mt-4">
            <Link href="/scan" className="flex-1">
              <Button className="w-full" onClick={() => setShowSaveDialog(false)}>
                <Scan className="w-4 h-4 mr-2" />
                New Scan
              </Button>
            </Link>
            <Link href="/dashboard" className="flex-1">
              <Button variant="outline" className="w-full bg-transparent" onClick={() => setShowSaveDialog(false)}>
                <Home className="w-4 h-4 mr-2" />
                Go to Dashboard
              </Button>
            </Link>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
