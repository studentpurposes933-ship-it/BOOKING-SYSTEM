import express from 'express';
import { verifyToken } from '../middleware/authMiddleware.js';
import {
  checkSlotConflict,
  isWithinWorkingHours,
  findAlternativeSlots,
  createAppointmentAtomic,
  cancelAppointment,
} from '../services/bookingService.js';
import { db } from '../config/firebaseAdmin.js';
import { collection, getDocs, query, where, doc, setDoc, deleteDoc } from 'firebase/firestore';

const router = express.Router();

// 1. Check availability for a given slot
router.post('/check', verifyToken, async (req, res) => {
  try {
    const { startTime, endTime, date, duration } = req.body;

    if (!startTime || !endTime) {
      return res.status(400).json({ error: 'startTime and endTime ISO strings are required.' });
    }

    const workingCheck = isWithinWorkingHours(startTime, endTime);
    if (!workingCheck.valid) {
      const alternatives = await findAlternativeSlots(date || startTime, duration || 30);
      return res.json({
        available: false,
        reason: workingCheck.reason,
        alternatives,
      });
    }

    const conflictRes = await checkSlotConflict(startTime, endTime);
    if (conflictRes.hasConflict) {
      const alternatives = await findAlternativeSlots(date || startTime, duration || 30);
      return res.json({
        available: false,
        reason: 'Slot is already booked or blocked.',
        alternatives,
      });
    }

    return res.json({ available: true, message: 'Slot is available for booking.' });
  } catch (error) {
    console.error('Check slot error:', error);
    return res.status(500).json({ error: 'Failed to check slot availability.' });
  }
});

// 2. Atomic appointment booking endpoint
router.post('/book', verifyToken, async (req, res) => {
  try {
    const { name, email, purpose, startTime, endTime } = req.body;

    if (!purpose || !startTime || !endTime) {
      return res.status(400).json({ error: 'Missing required booking fields (purpose, startTime, endTime).' });
    }

    const appointmentResult = await createAppointmentAtomic({
      userId: req.user.uid,
      name: name || req.user.name || 'Valued User',
      email: email || req.user.email || '',
      purpose,
      startTime,
      endTime,
    });

    return res.status(201).json(appointmentResult);
  } catch (error) {
    console.error('Booking Error:', error.message);
    return res.status(409).json({
      error: 'Booking Conflict',
      message: error.message,
    });
  }
});

// 3. Cancel appointment
router.post('/cancel', verifyToken, async (req, res) => {
  try {
    const { appointmentId } = req.body;
    if (!appointmentId) {
      return res.status(400).json({ error: 'appointmentId is required.' });
    }

    const result = await cancelAppointment(appointmentId, req.user.uid);
    return res.json(result);
  } catch (error) {
    console.error('Cancel Error:', error.message);
    return res.status(400).json({ error: error.message });
  }
});

// 4. Fetch all active appointments
router.get('/', verifyToken, async (req, res) => {
  try {
    const q = query(collection(db, 'appointments'), where('status', '==', 'confirmed'));
    const snapshot = await getDocs(q);
    const appointments = [];
    snapshot.forEach((docSnap) => {
      appointments.push({ id: docSnap.id, ...docSnap.data() });
    });
    return res.json({ appointments });
  } catch (error) {
    console.error('Get appointments error:', error);
    return res.status(500).json({ error: 'Failed to fetch appointments.' });
  }
});

// 5. Create a Blocked Slot (Admin / Calendar control)
router.post('/blocked-slots', verifyToken, async (req, res) => {
  try {
    const { title, startTime, endTime } = req.body;
    if (!startTime || !endTime) {
      return res.status(400).json({ error: 'startTime and endTime are required.' });
    }

    const docRef = doc(collection(db, 'blockedSlots'));
    const blockedData = {
      blockedSlotId: docRef.id,
      title: title || 'Blocked Slot',
      startTime,
      endTime,
      status: 'blocked',
      createdBy: req.user.uid,
      createdAt: new Date().toISOString(),
    };

    await setDoc(docRef, blockedData);
    return res.status(201).json({ success: true, blockedSlot: blockedData });
  } catch (error) {
    console.error('Block slot error:', error);
    return res.status(500).json({ error: 'Failed to create blocked slot.' });
  }
});

// 6. Delete Blocked Slot
router.delete('/blocked-slots/:id', verifyToken, async (req, res) => {
  try {
    const slotId = req.params.id;
    await deleteDoc(doc(db, 'blockedSlots', slotId));
    return res.json({ success: true, message: 'Blocked slot removed.' });
  } catch (error) {
    console.error('Delete blocked slot error:', error);
    return res.status(500).json({ error: 'Failed to delete blocked slot.' });
  }
});

export default router;
