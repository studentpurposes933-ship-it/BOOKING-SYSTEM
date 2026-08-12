import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Parses user input using Gemini API to extract structured appointment intent and parameters.
 */
export const extractBookingIntent = async ({ userMessage, history = [], userProfile = {}, currentContext = {} }) => {
  const apiKey = process.env.AI_API_KEY;
  const now = new Date();
  const currentDateStr = currentContext.currentDate || now.toISOString().split('T')[0];
  const currentTimeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

  const systemInstruction = `
You are an intelligent booking assistant parser. Your ONLY job is to analyze the user's natural language message and extract structured appointment parameters.
You must NEVER determine availability or check if a time slot is booked.

Current Reference Context:
- Current Date: ${currentDateStr} (${now.toLocaleDateString('en-US', { weekday: 'long' })})
- Current Time: ${currentTimeStr}
- Default User Name: "${userProfile.name || ''}"
- Default User Email: "${userProfile.email || ''}"

Return ONLY a JSON object with this EXACT structure (no markdown wrapper, no extra text):
{
  "intent": "book_appointment" | "ask_question" | "unknown",
  "date": "YYYY-MM-DD" or null,
  "startTime": "HH:MM" (24-hour format) or null,
  "duration": number (in minutes, default 30) or null,
  "purpose": "short summary of purpose" or null,
  "name": "User Name" or null,
  "email": "User Email" or null,
  "missingFields": ["date", "startTime", "purpose", etc.] (array of fields needed for a complete booking),
  "responseMessage": "A friendly conversational response asking for missing details or confirming extraction"
}

Extraction Rules:
1. Handle relative terms like "today", "tomorrow", "next Monday", "this Friday", "Aug 20" accurately relative to Current Date (${currentDateStr}).
2. Handle natural time expressions like "3 PM" (15:00), "3:30 PM" (15:30), "11 AM" (11:00), "morning" (09:00), "afternoon" (14:00), "evening" (16:00).
3. If duration is specified (e.g., "1 hour", "45 mins"), set duration in minutes. Default duration is 30 minutes.
4. Purpose should be extracted from phrases like "for a project review", "consultation", "team sync".
5. If details like time or purpose are missing, list them in missingFields and ask for them in responseMessage.
`;

  if (apiKey) {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

      const prompt = `System Instructions:\n${systemInstruction}\n\nUser Message: "${userMessage}"`;
      const result = await model.generateContent(prompt);
      const responseText = result.response.text().trim();

      // Clean markdown codeblocks if present
      const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      return parsed;
    } catch (err) {
      console.warn('Gemini API call error/fallback:', err.message);
    }
  }

  // Fallback Rule-Based Parser when Gemini API key is not configured or fails
  return fallbackExtractIntent(userMessage, currentDateStr, userProfile);
};

/**
 * Deterministic rule-based fallback parser for natural language parsing
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
    // Check weekday names
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    for (let i = 0; i < days.length; i++) {
      if (text.includes(days[i])) {
        const currentDay = now.getDay();
        let targetDayIndex = i;
        let diff = targetDayIndex - currentDay;
        if (diff <= 0) diff += 7; // Next occurrence
        const d = new Date(now);
        d.setDate(d.getDate() + diff);
        targetDate = d.toISOString().split('T')[0];
        break;
      }
    }
  }

  // Time Parsing (e.g. 3 pm, 3:30 pm, 11 am, 15:00)
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
    startTime = '09:00';
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
  }

  // Missing fields determination
  const missing = [];
  if (!targetDate) missing.push('date');
  if (!startTime) missing.push('startTime');
  if (!purpose) missing.push('purpose');

  let responseMessage = '';
  if (missing.length > 0) {
    if (missing.includes('date') && missing.includes('startTime')) {
      responseMessage = 'Sure! What date and time would you like to book your appointment?';
    } else if (missing.includes('startTime')) {
      responseMessage = `Got it for ${targetDate || 'your requested date'}. What time would you prefer?`;
    } else if (missing.includes('purpose')) {
      responseMessage = `Great! I have ${targetDate} at ${startTime}. What is the purpose of this appointment?`;
    } else {
      responseMessage = `Please provide the missing details: ${missing.join(', ')}.`;
    }
  } else {
    responseMessage = `I found a request for ${targetDate} at ${startTime} (${duration} mins) for "${purpose}". Let me check availability for you.`;
  }

  return {
    intent: 'book_appointment',
    date: targetDate,
    startTime,
    duration,
    purpose: purpose || 'General Meeting',
    name: userProfile.name || 'Valued User',
    email: userProfile.email || '',
    missingFields: missing,
    responseMessage,
  };
}
