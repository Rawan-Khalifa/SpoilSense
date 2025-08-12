'use client'

import { useAuth } from "@/hooks/useAuth"
import { useToast } from "@/hooks/use-toast"
import Loading from "@/app/inventory/loading"
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Upload, Camera, ChefHat, ExternalLink, ArrowLeft, Loader2 } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { analyzeGroceriesImage, type RecipeAnalysisResult } from '../actions/recipe-actions'

export default function RecipeSuggestions() {
  const { user, token, loading: authLoading } = useAuth()
  const { toast } = useToast()
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [results, setResults] = useState<RecipeAnalysisResult | null>(null)
  const router = useRouter()

  const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setSelectedImage(file)
      const reader = new FileReader()
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string)
      }
      reader.readAsDataURL(file)
      setResults(null) // Clear previous results
    }
  }

  const handleAnalyze = async () => {
    if (!selectedImage) return

    setIsAnalyzing(true)
    try {
      const formData = new FormData()
      formData.append('image', selectedImage)
      if (!token) {
        toast({ title: "Not signed in", description: "Please log in again.", variant: "destructive" })
        return
      } // quick auth check 

      const result = await analyzeGroceriesImage(formData)
      setResults(result)
    } catch (error) {
      setResults({
        groceries: [],
        recipes: [],
        success: false,
        error: 'Failed to analyze image. Please try again.'
      })
    } finally {
      setIsAnalyzing(false)
    }
  }

  // Block render until auth is known
  if (authLoading) return <Loading />

  // If not logged in, send to login and stop rendering
  if (!user) {
    router.push("/login")
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
        <header className="bg-white border-b p-4 flex justify-between items-center">
          <Link href="/dashboard" className="flex items-center text-gray-600 hover:text-gray-900">
            <ArrowLeft className="w-5 h-5 mr-2" /> Dashboard
          </Link>
          <h1 className="text-xl font-bold">Recipe Suggestions</h1>
        </header>

      <div className="max-w-7xl mx-auto p-4 space-y-6">
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Upload Section */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Camera className="w-5 h-5" />
                  Upload Your Groceries Photo
                </CardTitle>
                <CardDescription>
                  Take a clear photo of all the groceries you have available. Our AI will scan them and suggest delicious recipes you can make!
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert>
                  <Camera className="w-4 h-4" />
                  <AlertDescription>
                    <strong>Tips for best results:</strong>
                    <ul className="mt-2 space-y-1 text-sm">
                      <li>• Spread out your groceries clearly</li>
                      <li>• Ensure good lighting</li>
                      <li>• Include all ingredients you want to use</li>
                      <li>• Make sure items are visible and not overlapping</li>
                    </ul>
                  </AlertDescription>
                </Alert>

                <div className="space-y-2">
                  <Label htmlFor="grocery-image">Select Image</Label>
                  <Input
                    id="grocery-image"
                    type="file"
                    accept="image/*"
                    onChange={handleImageSelect}
                    className="cursor-pointer"
                  />
                </div>

                {imagePreview && (
                  <div className="space-y-4">
                    <div className="relative w-full h-64 bg-gray-100 rounded-lg overflow-hidden">
                      <Image
                        src={imagePreview || "/placeholder.svg"}
                        alt="Selected groceries"
                        fill
                        className="object-contain"
                      />
                    </div>
                    <Button 
                      onClick={handleAnalyze}
                      disabled={isAnalyzing}
                      className="w-full bg-orange-600 hover:bg-orange-700"
                    >
                      {isAnalyzing ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Analyzing Groceries...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4 mr-2" />
                          Analyze & Get Recipes
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Results Section */}
          <div className="space-y-6">
            {results && (
              <>
                {results.success ? (
                  <div className="space-y-6">
                    {/* Detected Groceries */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-green-700">🧠 Detected Groceries</CardTitle>
                        <CardDescription>
                          AI identified {results.groceries.length} items in your photo
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap gap-2">
                          {results.groceries.map((grocery, index) => (
                            <Badge key={index} variant="secondary" className="bg-green-100 text-green-800">
                              {grocery.name}
                            </Badge>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Recipe Suggestions */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-orange-700">🍽️ Recipe Suggestions</CardTitle>
                        <CardDescription>
                          Here are {results.recipes.length} recipes you can make with your ingredients
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {results.recipes.map((recipe, index) => (
                          <div key={index} className="p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                            <div className="flex items-center justify-between">
                              <div>
                                <h3 className="font-semibold text-lg">📌 {recipe.name}</h3>
                                {recipe.link ? (
                                  <Link 
                                    href={recipe.link} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:text-blue-800 flex items-center gap-1 mt-1"
                                  >
                                    View Recipe <ExternalLink className="w-3 h-3" />
                                  </Link>
                                ) : (
                                  <span className="text-gray-500 text-sm">No link found</span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  </div>
                ) : (
                  <Alert variant="destructive">
                    <AlertDescription>
                      {results.error || 'Something went wrong. Please try again.'}
                    </AlertDescription>
                  </Alert>
                )}
              </>
            )}

            {!results && !selectedImage && (
              <Card className="border-dashed border-2 border-gray-300">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <Upload className="w-12 h-12 text-gray-400 mb-4" />
                  <h3 className="text-lg font-semibold text-gray-600 mb-2">
                    Upload an image to get started
                  </h3>
                  <p className="text-gray-500">
                    Your recipe suggestions will appear here after analyzing your groceries photo
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
