# SpoilSense 🍎🤖

**AI-Powered Food Spoilage Detection System**

SpoilSense is an intelligent web application that helps users reduce food waste by predicting when their food items will spoil. Users simply take a photo of their food, and the app uses artificial intelligence to analyze the image and provide accurate expiration predictions based on environmental conditions.

## 🌟 Features

- **AI-Powered Analysis**: Uses OpenAI GPT-4 Vision to analyze food images and assess freshness
- **Smart Environmental Factors**: Considers storage conditions (room temperature vs. refrigerated) and local weather
- **Inventory Management**: Track all food items and get alerts for items expiring soon
- **Recipe Suggestions**: Generate recipes based on available ingredients
- **Confidence Scoring**: AI provides confidence levels (0-100%) for each prediction
- **Mobile-Responsive**: Works seamlessly on phones, tablets, and desktop
- **Real-Time Weather**: Fetches current weather conditions for more accurate predictions

## 🏗️ Technical Architecture

### Frontend (Next.js 14)
- **Framework**: Next.js 14 with React and TypeScript
- **Styling**: Tailwind CSS with shadcn/ui components
- **Authentication**: Firebase Authentication with Google Sign-in
- **State Management**: React hooks for user authentication and app state
- **Deployment**: Vercel

### Backend (Flask)
- **Framework**: Python Flask for RESTful API
- **Authentication**: Firebase Admin SDK for token verification
- **Database**: Firebase Firestore for user data and inventory storage
- **File Storage**: Firebase Cloud Storage for food images
- **Deployment**: Render

### AI & External Services
- **Computer Vision**: OpenAI GPT-4 Vision API for food analysis
- **Weather Data**: Open-Meteo API with fallbacks (wttr.in, OpenWeatherMap)
- **Recipe API**: SerpAPI for recipe suggestions

## 🛠️ Setup & Installation

### Prerequisites
- Node.js 18+ and npm
- Python 3.8+
- Firebase Project
- OpenAI API Key

### 1. Clone the Repository
```bash
git clone <your-repo-url>
cd SpoilSense
```

### 2. Firebase Setup

#### Create Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project named `spoilsense-[your-id]`
3. Enable Authentication → Sign-in providers → Google
4. Enable Firestore Database
5. Enable Storage

#### Get Firebase Configuration
1. Go to Project Settings → General
2. Add a web app and copy the config object
3. Go to Project Settings → Service accounts
4. Generate new private key and download the JSON file

#### Configure Authentication Domains
1. Authentication → Settings → Authorized domains
2. Add your domains:
   - `localhost` (for development)
   - `your-vercel-app.vercel.app` (for production)

### 3. OpenAI API Setup
1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Create an API key
3. Ensure you have access to GPT-4 Vision (gpt-4o model)

### 4. Environment Variables

#### Client Environment Variables
Create `client/.env.local`:
```bash
# Firebase Config
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# API Configuration
# For local development:
NEXT_PUBLIC_API_BASE_URL=http://localhost:5000
# For production deployment:
# NEXT_PUBLIC_API_BASE_URL=https://your-render-app.onrender.com
```

#### Server Environment Variables
Create `server/.env`:
```bash
# Firebase Service Account
GOOGLE_APPLICATION_CREDENTIALS=./firebase-service-account.json

# OpenAI API
OPENAI_API_KEY=sk-proj-your_openai_api_key

# Firebase Storage
FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app

# Server Port
PORT=5000
```

### 5. Install Dependencies

#### Frontend
```bash
cd client
npm install
```

#### Backend
```bash
cd server
pip install -r requirements.txt
```

### 6. Firebase Service Account Setup
1. Place your downloaded `firebase-service-account.json` in the `server/` directory
2. Ensure it's listed in `.gitignore` (already included)

### 7. Run Locally

#### Start Backend (Terminal 1)
```bash
cd server
python app.py
```
Server will run on `http://localhost:5000`

#### Start Frontend (Terminal 2)
```bash
cd client
npm run dev
```
Frontend will run on `http://localhost:3000`

## 🚀 Deployment

### Deploy to Render (Backend)
1. Create a new Web Service on [Render](https://render.com/)
2. Connect your GitHub repository
3. Set build command: `pip install -r requirements.txt`
4. Set start command: `python app.py`
5. Add environment variables:
   ```
   GOOGLE_APPLICATION_CREDENTIALS=/etc/secrets/firebase-service-account.json
   OPENAI_API_KEY=your_openai_api_key
   FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
   PORT=5000
   ```
6. Upload your `firebase-service-account.json` as a secret file

### Deploy to Vercel (Frontend)
1. Connect your GitHub repository to [Vercel](https://vercel.com/)
2. Set build command: `npm run build`
3. Set root directory: `client`
4. Add environment variables:
   ```
   NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
   NEXT_PUBLIC_API_BASE_URL=https://your-render-app.onrender.com
   ```

## 🔧 Local vs Production Configuration

### Environment Variable Switching

For **local development**, use:
```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:5000
```

For **production deployment**, use:
```bash
NEXT_PUBLIC_API_BASE_URL=https://your-render-app.onrender.com
```

### Development Workflow
1. **Local Development**: Both frontend and backend run locally
2. **Testing**: Frontend (local) → Backend (deployed on Render)
3. **Production**: Both frontend and backend deployed

## 📱 How to Use

1. **Sign Up**: Create an account using Google Sign-in
2. **Scan Food**: Take a photo of your food items
3. **Set Storage**: Choose room temperature or refrigerated storage
4. **Get Prediction**: Receive AI-powered spoilage predictions
5. **Save to Inventory**: Track items and get expiration alerts
6. **Recipe Suggestions**: Generate recipes from your ingredients

## 🧪 API Endpoints

### Authentication
- `POST /auth/login` - User login and location update
- `DELETE /auth/delete` - Delete user account

### Food Analysis
- `POST /predict` - Analyze food image and predict spoilage
- `POST /inventory` - Save prediction to user inventory
- `GET /inventory` - Get user's food inventory
- `DELETE /inventory/{id}` - Delete inventory item

### Testing
- `GET /` - Health check
- `GET /test/weather` - Test weather API connectivity

## 🎯 Key Technical Methods

### AI Food Analysis
```python
# Uses OpenAI GPT-4 Vision with structured prompts
def estimate_spoilage(image_path, lat, lon, storage_type, temperature, humidity):
    # Analyzes food image with environmental context
    # Returns JSON with spoilage days, confidence, and reasoning
```

### Weather Integration
```python
# Multi-API weather fetching with fallbacks
def get_weather_with_fallback(latitude, longitude):
    # Try Open-Meteo → wttr.in → Geographic defaults
    # Returns temperature and humidity data
```

### Image Processing
- Base64 encoding for secure image transmission
- Firebase Storage for persistent image storage
- Temporary file handling for AI processing

## 🛡️ Security Features

- Firebase Authentication with JWT tokens
- CORS protection for API endpoints
- Secure file upload with validation
- Environment variable protection
- Public/private storage separation

## 🌍 Environmental Impact

SpoilSense helps users:
- **Reduce food waste** by accurate spoilage predictions
- **Save money** by optimizing food usage
- **Make informed decisions** about food storage
- **Track environmental impact** through waste prevention metrics

---

**Built with ❤️ during our Minerva Sustainability Lab internship in Tokyo, Japan**
