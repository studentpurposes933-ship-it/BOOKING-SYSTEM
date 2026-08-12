import express from 'express';
import { verifyToken } from '../middleware/authMiddleware.js';
import { extractBookingIntent, formatTime12h, formatHumanDate } from '../services/aiService.js';
import { checkSlotConflict, isWithinWorkingHours, findAlternativeSlots } from '../services/bookingService.js';

const router = express.Router();

router.post('/chat', verifyToken, async (req, res) => {
  try {
    const { message, history = [], currentDraft = {} } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message string is required.' });
    }

    // 1. Natural language parameter extraction via AI Service with persistent draft merging
    const aiResult = await extractBookingIntent({
      userMessage: message,
      history,
      userProfile: req.user,
      currentDraft,
    });

    // 2. If information is missing, prompt user with short message, missing fields, and current draft state
    if (aiResult.missingFields && aiResult.missingFields.length > 0) {
      return res.json({
        status: 'need_info',
        message: aiResult.responseMessage,
        extracted: aiResult,
        missingFields: aiResult.missingFields,
      });
    }

    // 3. Construct ISO start and end timestamps
    const [year, month, day] = aiResult.date.split('-').map(Number);
    const [hours, minutes] = aiResult.startTime.split(':').map(Number);

    const startDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
    const duration = aiResult.duration || 30;
    const endDate = new Date(startDate.getTime() + duration * 60 * 1000);

    const startTimeISO = startDate.toISOString();
    const endTimeISO = endDate.toISOString();

    const humanDate = formatHumanDate(aiResult.date);
    const startTime12h = formatTime12h(aiResult.startTime);
    const endTime12h = endDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });

    // 4. Validate working hours
    const workingCheck = isWithinWorkingHours(startTimeISO, endTimeISO);
    if (!workingCheck.valid) {
      const alternatives = await findAlternativeSlots(aiResult.date, duration);
      return res.json({
        status: 'outside_working_hours',
        message: `${startTime12h} on ${humanDate} is outside working hours (09:00 AM - 05:00 PM). Try one of these:`,
        extracted: { ...aiResult, startTimeISO, endTimeISO, humanDate, startTime12h, endTime12h },
        alternatives,
      });
    }

    // 5. Check Firestore for conflicts
    const conflictCheck = await checkSlotConflict(startTimeISO, endTimeISO);

    if (conflictCheck.hasConflict) {
      const alternatives = await findAlternativeSlots(aiResult.date, duration);
      return res.json({
        status: 'conflict',
        message: `${startTime12h} is booked. Try one of these:`,
        extracted: { ...aiResult, startTimeISO, endTimeISO, humanDate, startTime12h, endTime12h },
        alternatives,
      });
    }

    // 6. Slot is available -> Present compact confirmation summary card to user
    return res.json({
      status: 'confirm_booking',
      message: `${startTime12h} ${humanDate} · ${aiResult.purpose}. Book for ${duration} minutes?`,
      extracted: {
        ...aiResult,
        startTimeISO,
        endTimeISO,
        humanDate,
        startTime12h,
        endTime12h,
        duration,
        name: req.user.name || aiResult.name || 'Valued User',
        email: req.user.email || aiResult.email || '',
      },
    });
  } catch (error) {
    console.error('AI Chat Error:', error);
    return res.status(500).json({ error: 'Internal server error processing AI chat.' });
  }
});

export default router;
