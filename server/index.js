import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import aiRoutes from './routes/aiRoutes.js';
import appointmentRoutes from './routes/appointmentRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 5000;

// CORS configuration
app.use(cors({
  origin: true,
  credentials: true,
}));

app.use(express.json());

// Routes
app.use('/api/ai', aiRoutes);
app.use('/api/appointments', appointmentRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'AI Smart Appointment Booking Backend',
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err.stack);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`⚡ AI Booking Backend Server running on port ${PORT}`);
  console.log(`====================================================`);
});
