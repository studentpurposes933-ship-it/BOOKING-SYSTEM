import express from 'express';
import { verifyToken } from '../middleware/authMiddleware.js';
import { extractBookingIntent } from '../services/aiService.js';
import { checkSlotConflict, isWithinWorkingHours, findAlternativeSlots } from '../services/bookingService.js';

const router = express.Router();

router.post('/chat', verifyToken, async (req, res) => {
  try {
    const { message, history = [] } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message string is required.' });
    }

    // 1. Natural language parameter extraction via AI Service
    const aiResult = await extractBookingIntent({
      userMessage: message,
      history,
      userProfile: req.user,
      currentContext: { currentDate: new Date().toISOString().split('T')[0] },
    });

    // 2. If information is missing, prompt user for missing details
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

    // 4. Validate working hours
    const workingCheck = isWithinWorkingHours(startTimeISO, endTimeISO);
    if (!workingCheck.valid) {
      const alternatives = await findAlternativeSlots(aiResult.date, duration);
      return res.json({
        status: 'outside_working_hours',
        message: `${workingCheck.reason} Would you like to choose one of these available working hour slots instead?`,
        extracted: { ...aiResult, startTimeISO, endTimeISO },
        alternatives,
      });
    }

    // 5. Check Firestore for conflicts
    const conflictCheck = await checkSlotConflict(startTimeISO, endTimeISO);

    if (conflictCheck.hasConflict) {
      const alternatives = await findAlternativeSlots(aiResult.date, duration);
      return res.json({
        status: 'conflict',
        message: `The requested time (${aiResult.startTime}) is not available due to an existing booking or blocked slot. Here are available alternative times:`,
        extracted: { ...aiResult, startTimeISO, endTimeISO },
        alternatives,
      });
    }

    // 6. Slot is available -> Present confirmation summary card to user
    return res.json({
      status: 'confirm_booking',
      message: `Great news! Your requested time slot on ${aiResult.date} from ${aiResult.startTime} to ${endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} is available. Please confirm your booking details below:`,
      extracted: {
        ...aiResult,
        startTimeISO,
        endTimeISO,
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
