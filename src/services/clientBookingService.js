import { db, auth } from '../config/firebase.js';
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  runTransaction,
} from 'firebase/firestore';

/**
 * Creates an appointment atomically on the client side using Firestore Transaction.
 * Enforces non-overlapping invariant: newStart < existingEnd AND newEnd > existingStart
 */
export const createClientAppointmentAtomic = async ({ name, email, purpose, startTime, endTime }) => {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('User must be logged in to book an appointment.');
  }

  // 1. Validate working hours (Mon-Fri 09:00 - 17:00)
  const start = new Date(startTime);
  const end = new Date(endTime);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error('Invalid start or end time format.');
  }

  const dayOfWeek = start.getDay(); // 0: Sun, 6: Sat
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    throw new Error('Bookings are only available Monday to Friday.');
  }

  const startHour = start.getHours() + start.getMinutes() / 60;
  const endHour = end.getHours() + end.getMinutes() / 60;

  if (startHour < 9 || endHour > 17 || startHour >= endHour) {
    throw new Error('Requested time is outside working hours (09:00 AM - 05:00 PM).');
  }

  if (start.getTime() < Date.now()) {
    throw new Error('Appointments cannot be booked in the past.');
  }

  // 2. Execute Atomic Firestore Transaction
  const apptColRef = collection(db, 'appointments');
  const newDocRef = doc(apptColRef);

  await runTransaction(db, async (transaction) => {
    // Query existing confirmed appointments
    const apptsQuery = query(collection(db, 'appointments'), where('status', '==', 'confirmed'));
    const apptsSnapshot = await getDocs(apptsQuery);

    const newStart = start.getTime();
    const newEnd = end.getTime();

    apptsSnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const existingStart = new Date(data.startTime).getTime();
      const existingEnd = new Date(data.endTime).getTime();

      if (newStart < existingEnd && newEnd > existingStart) {
        throw new Error(`Time slot conflict: Slot already booked ("${data.purpose}") from ${new Date(data.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} to ${new Date(data.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`);
      }
    });

    // Query blocked slots
    const blockedSnapshot = await getDocs(collection(db, 'blockedSlots'));
    blockedSnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.status === 'blocked' || !data.status) {
        const existingStart = new Date(data.startTime).getTime();
        const existingEnd = new Date(data.endTime).getTime();

        if (newStart < existingEnd && newEnd > existingStart) {
          throw new Error(`Time slot blocked: This interval is marked as blocked ("${data.title || 'Blocked Slot'}").`);
        }
      }
    });

    // Create appointment document inside transaction
    const newAppointmentData = {
      appointmentId: newDocRef.id,
      userId: currentUser.uid,
      name: name || currentUser.displayName || 'Valued User',
      email: email || currentUser.email || '',
      purpose,
      startTime,
      endTime,
      status: 'confirmed',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    transaction.set(newDocRef, newAppointmentData);
  });

  return {
    success: true,
    appointmentId: newDocRef.id,
    message: 'Appointment successfully confirmed and booked in Firestore.',
  };
};
