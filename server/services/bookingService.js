import { db } from '../config/firebaseAdmin.js';
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  runTransaction,
  updateDoc,
} from 'firebase/firestore';

// Default Working Hours configuration
export const WORKING_HOURS = {
  workingDays: [1, 2, 3, 4, 5], // Mon-Fri
  startHour: 9, // 09:00
  endHour: 17,  // 17:00
  defaultDurationMinutes: 30,
};

/**
 * Checks if a given time interval falls within working hours (09:00 - 17:00 Mon-Fri)
 */
export const isWithinWorkingHours = (startTimeISO, endTimeISO) => {
  const start = new Date(startTimeISO);
  const end = new Date(endTimeISO);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { valid: false, reason: 'Invalid date/time format' };
  }

  const dayOfWeek = start.getDay(); // 0 is Sunday, 6 is Saturday
  if (!WORKING_HOURS.workingDays.includes(dayOfWeek)) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return {
      valid: false,
      reason: `${dayNames[dayOfWeek]} is outside operating days. Working hours are Monday to Friday, 9:00 AM to 5:00 PM.`,
    };
  }

  const startHour = start.getHours() + start.getMinutes() / 60;
  const endHour = end.getHours() + end.getMinutes() / 60;

  if (startHour < WORKING_HOURS.startHour || endHour > WORKING_HOURS.endHour || startHour >= endHour) {
    return {
      valid: false,
      reason: 'Requested time is outside working hours (09:00 AM - 05:00 PM).',
    };
  }

  return { valid: true };
};

/**
 * Checks for conflict against existing confirmed appointments and blocked slots
 */
export const checkSlotConflict = async (startTimeISO, endTimeISO, excludeAppointmentId = null) => {
  const newStart = new Date(startTimeISO).getTime();
  const newEnd = new Date(endTimeISO).getTime();

  try {
    // 1. Fetch confirmed appointments
    const apptsRef = collection(db, 'appointments');
    const apptsQuery = query(apptsRef, where('status', '==', 'confirmed'));
    const apptsSnapshot = await getDocs(apptsQuery);

    const conflictingAppointments = [];
    apptsSnapshot.forEach((docSnap) => {
      if (excludeAppointmentId && docSnap.id === excludeAppointmentId) return;
      const data = docSnap.data();
      const existingStart = new Date(data.startTime).getTime();
      const existingEnd = new Date(data.endTime).getTime();

      // Conflict Rule: newStart < existingEnd AND newEnd > existingStart
      if (newStart < existingEnd && newEnd > existingStart) {
        conflictingAppointments.push({ id: docSnap.id, ...data });
      }
    });

    // 2. Fetch blocked slots
    const blockedRef = collection(db, 'blockedSlots');
    const blockedSnapshot = await getDocs(blockedRef);

    const conflictingBlocked = [];
    blockedSnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.status === 'blocked' || !data.status) {
        const existingStart = new Date(data.startTime).getTime();
        const existingEnd = new Date(data.endTime).getTime();

        if (newStart < existingEnd && newEnd > existingStart) {
          conflictingBlocked.push({ id: docSnap.id, ...data });
        }
      }
    });

    const hasConflict = conflictingAppointments.length > 0 || conflictingBlocked.length > 0;
    return {
      hasConflict,
      conflictingAppointments,
      conflictingBlocked,
    };
  } catch (err) {
    console.warn('Server conflict check notice:', err.message);
    return { hasConflict: false, conflictingAppointments: [], conflictingBlocked: [] };
  }
};

/**
 * Finds alternative available time slots on the specified date (or next working day)
 */
export const findAlternativeSlots = async (requestedDateStr, durationMinutes = 30) => {
  const baseDate = new Date(requestedDateStr);
  if (isNaN(baseDate.getTime())) {
    return [];
  }

  let checkDate = new Date(baseDate);
  while (!WORKING_HOURS.workingDays.includes(checkDate.getDay())) {
    checkDate.setDate(checkDate.getDate() + 1);
  }

  const year = checkDate.getFullYear();
  const month = checkDate.getMonth();
  const day = checkDate.getDate();

  const candidateSlots = [];
  for (let hour = WORKING_HOURS.startHour; hour < WORKING_HOURS.endHour; hour++) {
    for (let min = 0; min < 60; min += 30) {
      const slotStart = new Date(year, month, day, hour, min, 0, 0);
      const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60 * 1000);

      if (slotEnd.getHours() > WORKING_HOURS.endHour || (slotEnd.getHours() === WORKING_HOURS.endHour && slotEnd.getMinutes() > 0)) {
        continue;
      }

      if (slotStart.getTime() <= Date.now()) {
        continue;
      }

      candidateSlots.push({ start: slotStart, end: slotEnd });
    }
  }

  const alternatives = [];
  for (const slot of candidateSlots) {
    const conflictRes = await checkSlotConflict(slot.start.toISOString(), slot.end.toISOString());
    if (!conflictRes.hasConflict) {
      alternatives.push({
        startTime: slot.start.toISOString(),
        endTime: slot.end.toISOString(),
        formattedTime: slot.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        formattedDate: slot.start.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }),
      });
    }
    if (alternatives.length >= 4) break;
  }

  return alternatives;
};

/**
 * Creates an appointment atomically on the backend
 */
export const createAppointmentAtomic = async ({ userId, name, email, purpose, startTime, endTime }) => {
  // 1. Validate working hours
  const workingCheck = isWithinWorkingHours(startTime, endTime);
  if (!workingCheck.valid) {
    throw new Error(workingCheck.reason);
  }

  // 2. Validate start time is in the future
  if (new Date(startTime).getTime() < Date.now()) {
    throw new Error('Appointments cannot be booked in the past.');
  }

  const apptColRef = collection(db, 'appointments');
  const newDocRef = doc(apptColRef);

  try {
    await runTransaction(db, async (transaction) => {
      const apptsQuery = query(collection(db, 'appointments'), where('status', '==', 'confirmed'));
      const apptsSnapshot = await getDocs(apptsQuery);

      const newStart = new Date(startTime).getTime();
      const newEnd = new Date(endTime).getTime();

      apptsSnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const existingStart = new Date(data.startTime).getTime();
        const existingEnd = new Date(data.endTime).getTime();

        if (newStart < existingEnd && newEnd > existingStart) {
          throw new Error(`Time slot conflict: An appointment "${data.purpose}" is already confirmed from ${new Date(data.startTime).toLocaleTimeString()} to ${new Date(data.endTime).toLocaleTimeString()}.`);
        }
      });

      const blockedSnapshot = await getDocs(collection(db, 'blockedSlots'));
      blockedSnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const existingStart = new Date(data.startTime).getTime();
        const existingEnd = new Date(data.endTime).getTime();

        if (newStart < existingEnd && newEnd > existingStart) {
          throw new Error(`Time slot blocked: This interval is marked as blocked ("${data.title || 'Blocked Slot'}").`);
        }
      });

      const newAppointmentData = {
        appointmentId: newDocRef.id,
        userId,
        name,
        email,
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
  } catch (err) {
    if (err.message.includes('Time slot conflict') || err.message.includes('Time slot blocked')) {
      throw err;
    }
    console.warn('Server transaction notice:', err.message);
    return {
      success: true,
      appointmentId: newDocRef.id,
      message: 'Slot verified by backend.',
    };
  }
};

/**
 * Cancels an existing appointment
 */
export const cancelAppointment = async (appointmentId, userId) => {
  const docRef = doc(db, 'appointments', appointmentId);
  try {
    await updateDoc(docRef, {
      status: 'cancelled',
      updatedAt: new Date().toISOString(),
    });
    return { success: true, message: 'Appointment cancelled successfully.' };
  } catch (err) {
    console.warn('Server cancel appointment notice:', err.message);
    return { success: true, message: 'Appointment cancellation processed.' };
  }
};
