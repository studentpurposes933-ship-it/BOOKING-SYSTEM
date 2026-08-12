import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Converts 24-hour time string ("14:00") or raw ISO time to 12-hour AM/PM format ("2:00 PM")
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
 * Converts ISO date string ("2026-08-13") to natural human date ("Tomorrow", "Thursday, Aug 13")
 */
export function formatHumanDate(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  const tom = new Date(now);
  tom.setDate(tom.getDate() + 1);
  const tomStr = tom.toISOString().split('T')[0];

  if (dateStr === todayStr) return 'Today';
  if (dateStr === tomStr) return 'Tomorrow';

  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;

  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/**
 * Parses user input using Gemini API or rule-based fallback to extract structured parameters.
 */
export const extractBookingIntent = async ({ userMessage, history = [], userProfile = {}, currentContext = {} }) => {
  const apiKey = process.env.AI_API_KEY;
  const now = new Date();
  const currentDateStr = currentContext.currentDate || now.toISOString().split('T')[0];

  const systemInstruction = `
You are a fast, intelligent appointment booking assistant.
Your goal is to parse user messages and generate SHORT, SMART conversational responses (1–2 short sentences MAX).

RULES:
1. ALWAYS use 12-HOUR TIME FORMAT with AM/PM (e.g., "10:00 AM", "2:30 PM"). NEVER show 24-hour times like "14:00" or "17:00".
2. ALWAYS use human-friendly relative dates (e.g. "Tomorrow", "Friday, Aug 14"). NEVER show raw ISO dates like "2026-08-14" in conversational messages.
3. Keep responses strictly 1-2 SHORT sentences. Never write long paragraphs.
4. If missing details, ask for ONLY ONE missing item at a time.
5. Use the user's name ("${userProfile.name || ''}") and email ("${userProfile.email || ''}") automatically. Do not ask for name or email if already provided.

Current Reference Context:
- Current Date: ${currentDateStr} (${now.toLocaleDateString('en-US', { weekday: 'long' })})
- Default User Name: "${userProfile.name || ''}"
- Default User Email: "${userProfile.email || ''}"

Return ONLY a JSON object with this structure:
{
  "intent": "book_appointment" | "ask_question" | "unknown",
  "date": "YYYY-MM-DD" or null,
  "startTime": "HH:MM" (24-hour format internally for backend) or null,
  "duration": number (in minutes, default 30) or null,
  "purpose": "short summary" or null,
  "name": "User Name" or "${userProfile.name || 'Valued User'}",
  "email": "User Email" or "${userProfile.email || ''}",
  "missingFields": ["date", "startTime", "purpose"],
  "responseMessage": "SHORT 1-2 sentence AI message using AM/PM and natural dates"
}
`;

  if (apiKey) {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

      const prompt = `System Instructions:\n${systemInstruction}\n\nUser Message: "${userMessage}"`;
      const result = await model.generateContent(prompt);
      const responseText = result.response.text().trim();

      const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      return parsed;
    } catch (err) {
      console.warn('Gemini API notice, using fallback parser:', err.message);
    }
  }

  return fallbackExtractIntent(userMessage, currentDateStr, userProfile);
};

/**
 * Deterministic rule-based fallback parser
 */
function fallbackExtractIntent(userMessage, currentDateStr, userProfile) {
  const text = userMessage.toLowerCase();
  const now = new Date(currentDateStr);

  let targetDate = null;
  let startTime = null;
  let duration = 30;
  let purpose = null;

  // Relative Date Parsing
  if (text.includes('today')) {
    targetDate = currentDateStr;
  } else if (text.includes('tomorrow')) {
    const tom = new Date(now);
    tom.setDate(tom.getDate() + 1);
    targetDate = tom.toISOString().split('T')[0];
  } else {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    for (let i = 0; i < days.length; i++) {
      if (text.includes(days[i])) {
        const currentDay = now.getDay();
        let targetDayIndex = i;
        let diff = targetDayIndex - currentDay;
        if (diff <= 0) diff += 7;
        const d = new Date(now);
        d.setDate(d.getDate() + diff);
        targetDate = d.toISOString().split('T')[0];
        break;
      }
    }
  }

  // Time Parsing (e.g. 3 pm, 3:30 pm, 10 am)
  const timeMatch = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (timeMatch) {
    let hour = parseInt(timeMatch[1], 10);
    const minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const ampm = timeMatch[3] ? timeMatch[3].toLowerCase() : null;

    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;

    if (hour >= 0 && hour <= 23) {
      startTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }
  } else if (text.includes('morning')) {
    startTime = '10:00';
  } else if (text.includes('afternoon')) {
    startTime = '14:00';
  } else if (text.includes('evening')) {
    startTime = '16:00';
  }

  // Duration Parsing
  if (text.includes('1 hour') || text.includes('one hour') || text.includes('60 min')) {
    duration = 60;
  } else if (text.includes('90 min') || text.includes('1.5 hour')) {
    duration = 90;
  }

  // Purpose Parsing
  if (text.includes('for ')) {
    purpose = text.split('for ')[1].split('.')[0].split('at')[0].trim();
  } else if (text.includes('meeting')) {
    purpose = 'Meeting';
  } else if (text.includes('discussion')) {
    purpose = 'Discussion';
  } else if (text.includes('consultation')) {
    purpose = 'Consultation';
  } else if (text.includes('review')) {
    purpose = 'Project Review';
  } else if (text.includes('audit')) {
    purpose = 'Design Audit';
  }

  const missing = [];
  if (!targetDate) missing.push('date');
  if (!startTime) missing.push('startTime');
  if (!purpose) missing.push('purpose');

  const humanDate = targetDate ? formatHumanDate(targetDate) : 'requested date';
  const time12h = startTime ? formatTime12h(startTime) : '';

  let responseMessage = '';
  if (missing.length > 0) {
    if (missing.includes('date') && missing.includes('startTime')) {
      responseMessage = 'What date and time work for you?';
    } else if (missing.includes('startTime')) {
      responseMessage = `What time works for ${humanDate}?`;
    } else if (missing.includes('purpose')) {
      responseMessage = `${time12h} on ${humanDate} is available. What is the appointment for?`;
    } else {
      responseMessage = `Please specify your preferred ${missing.join(' and ')}.`;
    }
  } else {
    responseMessage = `${time12h} ${humanDate} is available. Ready to book?`;
  }

  return {
    intent: 'book_appointment',
    date: targetDate,
    startTime,
    duration,
    purpose: purpose || null,
    name: userProfile.name || 'Valued User',
    email: userProfile.email || '',
    missingFields: missing,
    responseMessage,
  };
}
