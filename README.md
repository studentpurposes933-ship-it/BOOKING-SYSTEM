# 🤖 AI-Powered Smart Appointment Booking System

A complete, production-ready, full-stack **AI-Powered Smart Appointment Booking System** featuring natural language AI intent understanding, real-time FullCalendar synchronization, atomic transaction double-booking prevention, and Firebase Authentication & Firestore.

---

## 🌟 Key Features

1. **Conversational AI Booking Assistant**: Powered by Gemini AI via a secure backend endpoint (`POST /api/ai/chat`). Parses natural language requests like *"Book an appointment tomorrow at 3 PM for project review"*. Includes **auto-rotating prompt pills** and **dynamic input placeholders**.
2. **Atomic Double-Booking Prevention**: Final booking operations execute via Firestore Transactions (`db.runTransaction`), strictly enforcing the non-overlapping invariant:
   $$\text{newStart} < \text{existingEnd} \quad \text{AND} \quad \text{newEnd} > \text{existingStart}$$
3. **Alternative Time Slot Suggestions**: Automatically calculates available alternative slots during working hours (Monday–Friday, 09:00 AM - 05:00 PM) when a requested slot is booked or blocked.
4. **Real-Time FullCalendar Synchronization**: Uses Firestore `onSnapshot()` listeners for instant, zero-reload updates across multiple connected browser windows in Day (`timeGridDay`), Week (`timeGridWeek`), and Month (`dayGridMonth`) views.
5. **Live Sync Status Indicator**: Displays a real-time status badge and a 5-second countdown timer showing live database synchronization state.
6. **Real Firebase Authentication**: Email & password registration and login with persistent auth state, automatically creating `users/{uid}` profile documents and featuring **Password Visibility Toggles (`Eye` / `EyeOff`)**.
7. **Backend API Security**: Express backend enforces `verifyToken` middleware on protected endpoints, verifying Firebase ID Tokens via `firebase-admin`. The AI secret API key is strictly stored on the backend (`server/.env`).
8. **Dual Booking Flow**: Supports both conversational AI booking and manual calendar slot click selection using the exact same central validation engine.

---

## 🛠️ Technology Stack

- **Frontend**: React.js 18, Vite 6, JavaScript, FullCalendar 6.1.15 (`@fullcalendar/react`, `@fullcalendar/daygrid`, `@fullcalendar/timegrid`, `@fullcalendar/interaction`), Lucide React, Axios.
- **Backend**: Node.js, Express.js, Firebase Admin SDK (`firebase-admin`), Google Generative AI SDK (`@google/generative-ai`), CORS, Dotenv.
- **Database & Authentication**: Firebase Firestore & Firebase Authentication (Project `booking-system-7b154`).

---

## 🏗️ Architecture Overview

```text
                             React + Vite Frontend (Port 5173)
                                          │
                  ┌───────────────────────┴───────────────────────┐
                  ↓                                               ↓
       Firebase Authentication                             Express API Server (Port 5000)
       (Client SDK Auth Token)                                    │
                  │                                     verifyToken Middleware
                  │                                               │
                  │                                      ┌────────┴────────┐
                  │                                      ↓                 ↓
                  │                                 Gemini AI        Booking Engine
                  │                                (Extraction)     (Working Hours)
                  │                                                        │
                  └───────────────────────┬────────────────────────────────┘
                                          ↓
                                Firestore Database (`booking-system-7b154`)
                                          │
                                 onSnapshot Listener
                                          │
                                          ↓
                               FullCalendar (Real-Time Sync)
```

---

## 📁 Project Directory Structure

```text
BOOKING SYSTEM/
├── .env                              # Frontend Firebase configuration & API URL
├── index.html                        # Main HTML entry point
├── package.json                      # Frontend dependencies (React, FullCalendar 6.1.15)
├── vite.config.js                    # Vite bundler configuration
├── firestore.rules                   # Production Firestore Security Rules
├── README.md                         # Project documentation
│
├── server/                           # Backend Express Server
│   ├── .env                          # Backend PORT, AI_API_KEY, FIREBASE_PROJECT_ID
│   ├── index.js                      # Express server entry point (Port 5000)
│   ├── package.json                  # Backend dependencies (express, firebase-admin)
│   ├── config/
│   │   └── firebaseAdmin.js          # Firebase Admin SDK initialization
│   ├── middleware/
│   │   └── authMiddleware.js         # Firebase ID token verification middleware
│   ├── routes/
│   │   ├── aiRoutes.js               # POST /api/ai/chat
│   │   └── appointmentRoutes.js      # Booking, conflict check, cancel, block routes
│   └── services/
│       ├── aiService.js              # Gemini AI NLP parsing logic
│       └── bookingService.js         # Working hours & atomic transaction engine
│
└── src/                              # Frontend Source Code
    ├── App.jsx                       # Main application component & layout
    ├── main.jsx                      # React entry point
    ├── index.css                     # Modern dark theme styles & animations
    ├── config/
    │   └── firebase.js               # Firebase Client Web SDK configuration
    ├── context/
    │   └── AuthContext.jsx           # Firebase Auth state & user profile sync
    ├── services/
    │   ├── apiService.js             # Axios client for Express backend routes
    │   └── clientBookingService.js   # Client-side atomic Firestore transaction helper
    └── components/
        ├── Appointments/
        │   └── UpcomingAppointments.jsx # Real-time list of user appointments
        ├── AIAssistant/
        │   └── AIChat.jsx            # Conversational AI assistant & prompt rotator
        ├── Auth/
        │   └── AuthModal.jsx         # Auth modal with eye icon password toggles
        ├── Calendar/
        │   ├── CalendarView.jsx      # FullCalendar integration with onSnapshot sync
        │   ├── ManualBookingModal.jsx# Slot click manual booking modal
        │   └── BlockSlotModal.jsx    # Time slot blocking modal
        └── Common/
            └── Navbar.jsx            # Top navigation bar with user profile & logout
```

---

## ⚙️ Environment Variables Configuration

### 1. Frontend Environment Variables (`.env`)
Create `.env` in the root folder:

```env
VITE_FIREBASE_API_KEY=AIzaSyDaGfde2tp6lbTgQ9ROSyJ32TRX9Q1l1rM
VITE_FIREBASE_AUTH_DOMAIN=booking-system-7b154.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=booking-system-7b154
VITE_FIREBASE_STORAGE_BUCKET=booking-system-7b154.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=712080323281
VITE_FIREBASE_APP_ID=1:712080323281:web:92e9030cf7c1bb999acbf0
VITE_FIREBASE_MEASUREMENT_ID=G-8CVWHQCJWP
VITE_API_BASE_URL=http://localhost:5000/api
```

### 2. Backend Environment Variables (`server/.env`)
Create `server/.env`:

```env
PORT=5000
AI_API_KEY=your_gemini_api_key
FIREBASE_PROJECT_ID=booking-system-7b154
```

> 🔒 **Security Note**: The AI secret API key is strictly stored on the Express backend (`server/.env`) and is NEVER exposed to client-side code.

---

## 🔒 Security Rules & Development Policy

The system adheres strictly to the Functionality-First Security Policy:
1. All core application features (Auth, NLP parsing, atomic double-booking transactions, real-time FullCalendar sync) are built and validated end-to-end first.
2. Firebase Authentication (`request.auth != null`) and ownership checks (`resource.data.userId == request.auth.uid`) are applied as the final production security layer.
3. Production security rules in `firestore.rules`:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /appointments/{appointmentId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && request.resource.data.userId == request.auth.uid;
      allow update, delete: if request.auth != null && resource.data.userId == request.auth.uid;
    }
    match /blockedSlots/{blockedSlotId} {
      allow read: if request.auth != null;
      allow create, update, delete: if request.auth != null;
    }
  }
}
```

---

## ⚡ Installation & How to Run

### 1. Install Dependencies

```bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd server
npm install
cd ..
```

### 2. Run Application

Start backend and frontend simultaneously:

**Terminal 1 (Backend Express Server):**
```bash
node server/index.js
```
*(Runs on `http://localhost:5000`)*

**Terminal 2 (Frontend Vite Dev Server):**
```bash
npm run dev
```
*(Runs on `http://localhost:5173`)*

Open **`http://localhost:5173/`** in your browser.

---

## 🗄️ Firestore Database Schemas

- **`users/{uid}`**:
  - `uid`: string (Firebase Auth User ID)
  - `name`: string (Full Name)
  - `email`: string (User Email)
  - `createdAt`: ISO timestamp string

- **`appointments/{appointmentId}`**:
  - `appointmentId`: string (Unique Document ID)
  - `userId`: string (Authenticated User `uid`)
  - `name`: string (User Name)
  - `email`: string (User Email)
  - `purpose`: string (Meeting Title / Purpose)
  - `startTime`: ISO timestamp string
  - `endTime`: ISO timestamp string
  - `status`: `'confirmed'` | `'cancelled'` | `'blocked'`
  - `createdAt`: ISO timestamp string
  - `updatedAt`: ISO timestamp string

- **`blockedSlots/{blockedSlotId}`**:
  - `blockedSlotId`: string (Unique Document ID)
  - `title`: string (Reason for block)
  - `startTime`: ISO timestamp string
  - `endTime`: ISO timestamp string
  - `status`: `'blocked'`
  - `createdBy`: string (User `uid`)
  - `createdAt`: ISO timestamp string

---

## 📡 API Endpoints Reference

| Method | Endpoint | Description | Protected |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/ai/chat` | Send natural language prompt to Gemini AI | Yes |
| `POST` | `/api/appointments/check-slot` | Check slot availability & get alternatives | Yes |
| `POST` | `/api/appointments/book` | Confirm & book appointment | Yes |
| `POST` | `/api/appointments/cancel` | Cancel an existing appointment | Yes |
| `POST` | `/api/appointments/block-slot` | Block a time range on the calendar | Yes |
| `GET` | `/api/health` | Backend server health check | No |

---

## 🧪 Build Verification

To test and build the production bundle:

```bash
npm run build
```

Yields **0 compilation errors and 0 warnings**.
#   B O O K I N G - S Y S T E M  
 