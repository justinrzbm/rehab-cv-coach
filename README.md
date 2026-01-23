# Handelit - Rehab CV Coach

**A project by The Dexteriteers created for natIgnite 2025!**

## About

Fine motor decline from aging, stroke, arthritis, or neurodegenerative conditions impacts millions of older adults, making tasks like drinking tea, opening containers, or getting dressed difficult or impossible.

Our solution is a computer vision–based rehab platform enabling older adults to independently practice functional fine motor activities. The system delivers real-time adaptive feedback, accessible audio guidance, and gamified challenges—all running directly in the browser.

## Tech Stack

**Frontend:**
- React + TypeScript + Vite
- TailwindCSS + shadcn/ui
- MediaPipe (hand/face/pose tracking)
- TensorFlow.js (object detection)
- Supabase (authentication & data)

**Backend:**
- FastAPI (serves static files)

## Project Structure

```
rehab-cv-coach/
├── src/                    # React frontend source
│   ├── components/         # Reusable UI components
│   ├── pages/              # Page components (routes)
│   ├── games/              # Gamified exercises
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Utilities
│   └── services/           # API services
├── backend/                # Python backend
│   ├── server.py           # FastAPI server
│   ├── requirements.txt    # Python dependencies
│   └── static/             # Built frontend (generated)
├── public/                 # Static assets
└── supabase/               # Database migrations
```

## Quick Start

### Prerequisites
- Node.js (v18+)
- Python (3.10+)
- Webcam

### Installation

```bash
# Install frontend dependencies
npm install

# Install backend dependencies
pip install -r backend/requirements.txt
```

### Run the App

```bash
npm start
```

This builds the frontend and starts the server at **http://localhost:8000**

### Development Mode

```bash
# Terminal 1: Frontend with hot reload
npm run dev

# Terminal 2: Backend (optional)
npm run start:backend
```

### Docker Deployment

#### Quick Start (Recommended)

**On macOS/Linux:**
```bash
./start.sh
```

**On Windows:**
```cmd
start.bat
```

This script automatically:
- Kills any process using port 8000
- Builds and starts the Docker container

#### Manual Docker Commands

```bash
# Build and run
docker-compose up --build

# Run in background
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

#### Using Docker directly

```bash
# Build the image
docker build -t rehab-cv-coach .

# Run the container
docker run -p 8000:8000 rehab-cv-coach

# Run in background
docker run -d -p 8000:8000 --name rehab-cv-coach rehab-cv-coach
```

The app will be available at **http://localhost:8000**

## Features

- **Feeding Module**: Practice the cup-to-mouth movement sequence
  - Reach bottle → Grab & hold → Lift to mouth → Hold → Tip → Place down
- **Hand Exercises**: Range-of-motion tracking with rep counting
- **Games**: Gamified hand exercises (Flappy Ball, Fruit Ninja, Star Shooter)
- **Progress Tracking**: View your improvement over time
- **Voice Guidance**: Audio instructions and encouragement

## Architecture

All computer vision runs **in the browser** using:
- MediaPipe Hands, Pose, and FaceMesh for body tracking
- COCO-SSD (TensorFlow.js) for object detection

The Python backend simply serves the built React app as static files.
