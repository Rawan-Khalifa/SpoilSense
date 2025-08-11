'use server'

import { revalidatePath } from 'next/cache'

export interface DetectedGrocery {
  name: string
}

export interface Recipe {
  name: string
  link: string | null
}

export interface RecipeAnalysisResult {
  groceries: DetectedGrocery[]
  recipes: Recipe[]
  success: boolean
  error?: string
}

export async function analyzeGroceriesImage(formData: FormData): Promise<RecipeAnalysisResult> {
  try {
    const file = formData.get('image') as File
    
    if (!file) {
      return {
        groceries: [],
        recipes: [],
        success: false,
        error: 'No image provided'
      }
    }

    // Convert file to base64
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const base64Image = buffer.toString('base64')

    // Step 1: Detect groceries using OpenAI
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that identifies groceries in photos.'
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'List all grocery items you see in this image. Only return item names (one per line).'
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`
                }
              }
            ]
          }
        ],
        max_tokens: 500
      })
    })

    const openaiData = await openaiResponse.json()

    if (!openaiResponse.ok || !openaiData.choices || !openaiData.choices[0]?.message?.content) {
      console.error('OpenAI API returned an unexpected response:', openaiData)
      return {
        groceries: [],
        recipes: [],
        success: false,
        error: 'Failed to extract grocery items from the image'
      }
    }

    const groceryItems = openaiData.choices[0].message.content
      .trim()
      .split('\n')
      .map((item: string) => ({ name: item.replace(/^[-•]\s*/, '').trim() }))
      .filter((item: DetectedGrocery) => item.name)


    // Step 2: Get recipe suggestions
    const recipeResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful recipe assistant.'
          },
          {
            role: 'user',
            content: `Suggest 3 **real and popular** recipes that use only these ingredients: ${groceryItems.map(g => g.name).join(', ')}. Each recipe should be common and searchable online (e.g., on AllRecipes, Food Network). Only return the recipe names (one per line), and do not invent unusual combinations.`
          }
        ],
        max_tokens: 300
      })
    })

    const recipeData = await recipeResponse.json()
    const recipeNames = recipeData.choices[0].message.content
      .trim()
      .split('\n')
      .map((name: string) => name.replace(/^[-•]\s*/, '').trim())
      .filter((name: string) => name)

    // Step 3: Search for recipe links using SerpAPI
    const recipes: Recipe[] = []
    
    for (const recipeName of recipeNames) {
      try {
        const searchResponse = await fetch(`https://serpapi.com/search.json?q=${encodeURIComponent(recipeName + ' recipe site:allrecipes.com OR site:foodnetwork.com')}&api_key=${process.env.SERPAPI_KEY}&num=1`)
        const searchData = await searchResponse.json()
        
        const link = searchData.organic_results?.[0]?.link || null
        recipes.push({
          name: recipeName,
          link: link
        })
      } catch (error) {
        recipes.push({
          name: recipeName,
          link: null
        })
      }
    }

    revalidatePath('/recipe-suggestions')
    
    return {
      groceries: groceryItems,
      recipes: recipes,
      success: true
    }

  } catch (error) {
    console.error('Error analyzing groceries:', error)
    return {
      groceries: [],
      recipes: [],
      success: false,
      error: 'Failed to analyze image. Please try again.'
    }
  }
}
