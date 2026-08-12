/* global process */
import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Converts 24-hour time string ("10:00" or "14:00") to 12-hour AM/PM format ("10:00 AM" or "2:00 PM")
 */
export function formatTime12h(timeStr) {
  if (!timeStr) return '';
  if (typeof timeStr !== 'string') return '';
  if (timeStr.includes('AM') || timeStr.includes('PM')) return timeStr;

  const [hStr, mStr] = timeStr.split(':');
  let h = parseInt(hStr, 10);
  const m = mStr ? mStr.substring(0, 2) : '00';

  if (isNaN(h)) return timeStr;
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m.padStart(2, '0')} ${ampm}`;
}

/**
 * Converts ISO date string ("2026-08-14") to natural human date ("today", "tomorrow", "Friday, Aug 14")
 */
export function formatHumanDate(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  const tom = new Date(now);
  tom.setDate(tom.getDate() + 1);
  const tomStr = tom.toISOString().split('T')[0];

  if (dateStr === todayStr) return 'today';
  if (dateStr === tomStr) return 'tomorrow';

  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;

  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/**
 * Robust natural language parser that merges new details into the existing booking state.
 */
export const extractBookingIntent = async ({ userMessage, userProfile = {}, currentDraft = {} }) => {
  const apiKey = process.env.AI_API_KEY;
  const now = new Date();
  const currentDateStr = now.toISOString().split('T')[0];

  const systemInstruction = `
You are an intelligent booking assistant parser. Extract structured data from the user message and merge it into the existing draft.

Current Existing Booking Draft:
${JSON.stringify(currentDraft, null, 2)}

User Profile:
Name: "${userProfile.name || ''}"
Email: "${userProfile.email || ''}"

CRITICAL RULES:
1. MERGE — never erase previously collected values. Only update fields the user explicitly changed.
2. Parse date from phrases like "14 08 2026", "14/08/2026", "tomorrow", "next Friday". Output as YYYY-MM-DD.
3. Parse time from phrases like "10am" -> "10:00", "4 PM" -> "16:00". NEVER confuse date numbers with time ("14 08 2026 at 10am" = date 2026-08-14, time 10:00).
4. Parse purpose from phrases like "Meeting with HR", "interview", "design audit".
5. The "responseMessage" field MUST be a short friendly 1-2 sentence message. ABSOLUTE PROHIBITION: NEVER use raw field names (startTime, endTime, missingFields, purpose, date) anywhere in responseMessage. Use natural language: "What time works?", "What's the appointment for?", "What date works for you?".

Return ONLY valid JSON:
{
  "intent": "book_appointment",
  "date": "YYYY-MM-DD or null",
  "startTime": "HH:MM in 24h or null",
  "duration": 30,
  "purpose": "string or null",
  "name": "${userProfile.name || currentDraft.name || 'Valued User'}",
  "email": "${userProfile.email || currentDraft.email || ''}",
  "missingFields": ["date", "startTime", "purpose"],
  "responseMessage": "Natural 1-2 sentence message with NO raw field names"
}
`;

  if (apiKey) {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

      const prompt = `System:\n${systemInstruction}\n\nUser Message: "${userMessage}"`;
      const result = await model.generateContent(prompt);
      const responseText = result.response.text().trim();

      const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);

      // Always use mergeBookingDraft to generate a deterministic, human-friendly responseMessage
      // This prevents Gemini from ever leaking raw field names (startTime, purpose, etc.) into chat
      return mergeBookingDraft(parsed, currentDraft, userProfile);
    } catch (err) {
      console.warn('Gemini API notice, using deterministic fallback parser:', err.message);
    }
  }

  return fallbackExtractIntent(userMessage, currentDateStr, userProfile, currentDraft);
};

/**
 * Deterministic Fallback Parser with State Merging & Exact Date/Time Regex Fix
 */
function fallbackExtractIntent(userMessage, currentDateStr, userProfile, currentDraft = {}) {
  let text = userMessage.trim();
  const lower = text.toLowerCase();
  const now = new Date(currentDateStr);

  let newDate = null;
  let newTime = null;
  let newDuration = null;
  let newPurpose = null;

  // 1. EXACT DATE PARSING (Strip explicit date patterns FIRST before time parsing)
  const numericDateMatch = text.match(/\b(\d{1,2})[/\-\s](\d{1,2})[/\-\s](\d{4})\b/);
  if (numericDateMatch) {
    const day = parseInt(numericDateMatch[1], 10);
    const month = parseInt(numericDateMatch[2], 10);
    const year = parseInt(numericDateMatch[3], 10);
    newDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    text = text.replace(numericDateMatch[0], ' ');
  }

  if (!newDate) {
    // Parse "Thu, 13 Aug" / "Mon, 14 Aug 2026" / "13 Aug" formats (used by alternative slot chips)
    const shortDayMonthMatch = text.match(/\b(?:mon|tue|wed|thu|fri|sat|sun)[.,]?\s*(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)(?:\s+(\d{4}))?\b/i);
    if (shortDayMonthMatch) {
      const day = parseInt(shortDayMonthMatch[1], 10);
      const monthStr = shortDayMonthMatch[2];
      const year = shortDayMonthMatch[3] ? parseInt(shortDayMonthMatch[3], 10) : now.getFullYear();
      const d = new Date(`${monthStr} ${day}, ${year}`);
      if (!isNaN(d.getTime())) {
        newDate = d.toISOString().split('T')[0];
        text = text.replace(shortDayMonthMatch[0], ' ');
      }
    }
  }

  if (!newDate) {
    // Parse "13 Aug" / "Aug 13" style (day + month name, no year)
    const dayMonthMatch = text.match(/\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i)
      || text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})\b/i);
    if (dayMonthMatch) {
      let day, monthStr;
      if (/^\d/.test(dayMonthMatch[1])) {
        day = parseInt(dayMonthMatch[1], 10);
        monthStr = dayMonthMatch[2];
      } else {
        monthStr = dayMonthMatch[1];
        day = parseInt(dayMonthMatch[2], 10);
      }
      const d = new Date(`${monthStr} ${day}, ${now.getFullYear()}`);
      if (!isNaN(d.getTime())) {
        newDate = d.toISOString().split('T')[0];
        text = text.replace(dayMonthMatch[0], ' ');
      }
    }
  }

  if (!newDate) {
    const monthNameMatch = text.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?\b/i);
    if (monthNameMatch) {
      const monthStr = monthNameMatch[1];
      const day = parseInt(monthNameMatch[2], 10);
      const year = monthNameMatch[3] ? parseInt(monthNameMatch[3], 10) : now.getFullYear();
      const d = new Date(`${monthStr} ${day}, ${year}`);
      if (!isNaN(d.getTime())) {
        newDate = d.toISOString().split('T')[0];
        text = text.replace(monthNameMatch[0], ' ');
      }
    }
  }

  if (!newDate) {
    if (lower.includes('today')) {
      newDate = currentDateStr;
    } else if (lower.includes('tomorrow')) {
      const tom = new Date(now);
      tom.setDate(tom.getDate() + 1);
      newDate = tom.toISOString().split('T')[0];
    } else {
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      for (let i = 0; i < days.length; i++) {
        if (lower.includes(days[i])) {
          const currentDay = now.getDay();
          let targetDayIndex = i;
          let diff = targetDayIndex - currentDay;
          if (diff <= 0) diff += 7;
          const d = new Date(now);
          d.setDate(d.getDate() + diff);
          newDate = d.toISOString().split('T')[0];
          break;
        }
      }
    }
  }

  // 2. EXACT TIME PARSING
  const timeMatch = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (timeMatch) {
    let hour = parseInt(timeMatch[1], 10);
    const minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const ampm = timeMatch[3] ? timeMatch[3].toLowerCase() : null;

    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;

    if (!ampm && hour >= 1 && hour <= 6) {
      hour += 12;
    }

    if (hour >= 0 && hour <= 23) {
      newTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }
  } else if (lower.includes('morning')) {
    newTime = '10:00';
  } else if (lower.includes('afternoon')) {
    newTime = '14:00';
  } else if (lower.includes('evening')) {
    newTime = '16:00';
  }

  // 3. DURATION PARSING
  if (lower.includes('1 hour') || lower.includes('one hour') || lower.includes('60 min')) {
    newDuration = 60;
  } else if (lower.includes('90 min') || lower.includes('1.5 hour')) {
    newDuration = 90;
  }

  // 4. PURPOSE PARSING
  const purposeKeywords = [
    'design audit', 'meeting with hr', 'hr meeting', 'code review',
    'project review', 'consultation', 'interview', 'strategy session',
    'team sync', 'discussion', 'meeting'
  ];

  for (const kw of purposeKeywords) {
    if (lower.includes(kw)) {
      newPurpose = kw.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      break;
    }
  }

  if (!newPurpose) {
    if (lower.includes('for ')) {
      const splitAfterFor = lower.split('for ')[1];
      const cleaned = splitAfterFor.split('.')[0].split('at')[0].split('on')[0].trim();
      if (cleaned.length > 2 && !cleaned.includes('hour') && !cleaned.includes('min')) {
        newPurpose = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
      }
    }
  }

  return mergeBookingDraft(
    {
      date: newDate,
      startTime: newTime,
      duration: newDuration,
      purpose: newPurpose,
    },
    currentDraft,
    userProfile
  );
}

/**
 * Merges parsed values into currentDraft and formats a natural conversational question
 */
function mergeBookingDraft(parsed, currentDraft = {}, userProfile = {}) {
  const merged = {
    intent: 'book_appointment',
    name: userProfile.name || currentDraft.name || parsed.name || 'Valued User',
    email: userProfile.email || currentDraft.email || parsed.email || '',
    date: parsed.date || currentDraft.date || null,
    startTime: parsed.startTime || currentDraft.startTime || null,
    duration: parsed.duration || currentDraft.duration || 30,
    purpose: parsed.purpose || currentDraft.purpose || null,
  };

  const missing = [];
  if (!merged.date) missing.push('date');
  if (!merged.startTime) missing.push('startTime');
  if (!merged.purpose) missing.push('purpose');

  const humanDate = merged.date ? formatHumanDate(merged.date) : null;
  const time12h = merged.startTime ? formatTime12h(merged.startTime) : null;

  let responseMessage;
  if (missing.length > 0) {
    if (missing.includes('date') && missing.includes('startTime') && missing.includes('purpose')) {
      responseMessage = 'When would you like to meet, and what is the appointment for?';
    } else if (missing.includes('date') && missing.includes('startTime')) {
      responseMessage = 'What date and time work for you?';
    } else if (missing.includes('startTime') && missing.includes('purpose')) {
      responseMessage = `What time works for ${humanDate || 'your appointment'}, and what is it for?`;
    } else if (missing.includes('date') && missing.includes('purpose')) {
      responseMessage = `What date works for ${time12h || 'your slot'}, and what is the appointment for?`;
    } else if (missing.includes('date')) {
      responseMessage = `What date would you like for ${time12h}?`;
    } else if (missing.includes('startTime')) {
      responseMessage = `What time works for ${humanDate}?`;
    } else if (missing.includes('purpose')) {
      responseMessage = `${time12h} on ${humanDate} is free. What's the appointment for?`;
    } else {
      responseMessage = 'All set! Ready to confirm your appointment?';
    }
  } else {
    responseMessage = `${time12h} on ${humanDate} — ${merged.purpose}. Book for ${merged.duration} mins?`;
  }

  return {
    ...merged,
    missingFields: missing,
    responseMessage,
  };
}
