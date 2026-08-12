import { useState, useRef, useEffect } from 'react';
import { apiService } from '../../services/apiService.js';
import { createClientAppointmentAtomic } from '../../services/clientBookingService.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { Bot, Send, User, Calendar, CheckCircle2, X } from 'lucide-react';

// Format 24h string ("10:00" or "14:00") to 12-hour AM/PM ("10:00 AM" or "2:00 PM")
const format12h = (timeStr) => {
  if (!timeStr) return '';
  if (typeof timeStr !== 'string') return '';
  if (timeStr.includes('AM') || timeStr.includes('PM')) return timeStr;

  const parts = timeStr.split('T');
  const target = parts.length > 1 ? parts[1] : timeStr;
  const [hStr, mStr] = target.split(':');
  let h = parseInt(hStr, 10);
  const m = mStr ? mStr.substring(0, 2) : '00';
  if (isNaN(h)) return timeStr;

  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m.padStart(2, '0')} ${ampm}`;
};

// Format YYYY-MM-DD or ISO string to human date ("today", "tomorrow", "Friday, Aug 14")
const formatHumanDate = (dateStr) => {
  if (!dateStr) return '';
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  const tom = new Date(now);
  tom.setDate(tom.getDate() + 1);
  const tomStr = tom.toISOString().split('T')[0];

  const target = dateStr.split('T')[0];
  if (target === todayStr) return 'today';
  if (target === tomStr) return 'tomorrow';

  const d = new Date(target + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;

  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

// Static outside component — stable reference, no useEffect dep needed
const PLACEHOLDER_EXAMPLES = [
  "e.g. Book tomorrow at 10 AM for a meeting",
  "e.g. Friday at 2 PM for a consultation",
  "e.g. Today at 9 AM for an interview",
  "e.g. Monday at 4 PM for a project review",
  "e.g. Book Aug 15 at 11 AM",
];

export const AIChat = ({ onBookingSuccess }) => {
  const { userProfile, currentUser } = useAuth();
  const userName = userProfile?.name || currentUser?.displayName || 'there';
  const userEmail = userProfile?.email || currentUser?.email || '';

  const [messages, setMessages] = useState([
    {
      id: 'init-1',
      sender: 'ai',
      text: `Hi ${userName}! How can I help you schedule an appointment today?`,
      timestamp: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }),
    },
  ]);

  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState(null);
  const [alternatives, setAlternatives] = useState([]);
  const [missingFields, setMissingFields] = useState([]);
  const [confirmedBooking, setConfirmedBooking] = useState(null);

  // Persistent Booking Draft State across turns
  const [bookingDraft, setBookingDraft] = useState({
    date: null,
    startTime: null,
    duration: 30,
    purpose: null,
  });

  // Rotating placeholder examples
  const [placeholderIdx, setPlaceholderIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setPlaceholderIdx((i) => (i + 1) % PLACEHOLDER_EXAMPLES.length);
    }, 3500);
    return () => clearInterval(t);
  }, []); // PLACEHOLDER_EXAMPLES is a stable module-level constant

  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, pendingConfirmation, alternatives, loading, confirmedBooking]);

  const handleSendMessage = async (customText = null) => {
    const textToSend = customText || inputMessage;
    if (!textToSend.trim() || loading) return;

    const userMsgObj = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }),
    };

    setMessages((prev) => [...prev, userMsgObj]);
    if (!customText) setInputMessage('');
    setLoading(true);
    setAlternatives([]);
    setPendingConfirmation(null);
    setConfirmedBooking(null);

    try {
      const chatHistory = messages.map((m) => `${m.sender === 'user' ? 'User' : 'AI'}: ${m.text}`);

      // Pass persistent bookingDraft with every AI chat request
      const response = await apiService.sendAIChat(textToSend, chatHistory, bookingDraft);

      // Update persistent draft with newly merged extracted parameters
      // But ONLY keep date+startTime from extracted if it's NOT a conflict response
      // (conflict means old time, not the new slot user wants)
      if (response.extracted) {
        setBookingDraft((prev) => ({
          ...prev,
          ...response.extracted,
          // On conflict: clear startTime so next request re-parses the chosen alternative's time
          startTime: (response.status === 'conflict' || response.status === 'outside_working_hours')
            ? null
            : (response.extracted.startTime || prev.startTime),
        }));
      }

      const aiMsgObj = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: response.message,
        timestamp: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }),
      };

      setMessages((prev) => [...prev, aiMsgObj]);

      if (response.status === 'need_info') {
        setMissingFields(response.missingFields || []);
      } else {
        setMissingFields([]);
      }

      if (response.status === 'confirm_booking') {
        setPendingConfirmation(response.extracted);
      } else if (response.status === 'conflict' || response.status === 'outside_working_hours') {
        if (response.alternatives && response.alternatives.length > 0) {
          setAlternatives(response.alternatives);
        }
      }
    } catch (err) {
      console.error('AI Chat Error:', err);
      const errorMsgObj = {
        id: `ai-err-${Date.now()}`,
        sender: 'ai',
        text: err.response?.data?.message || 'Sorry, I ran into an error checking availability. Please try again.',
        timestamp: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }),
        isError: true,
      };
      setMessages((prev) => [...prev, errorMsgObj]);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmBooking = async () => {
    if (!pendingConfirmation || loading) return;

    setLoading(true);
    try {
      await createClientAppointmentAtomic({
        name: pendingConfirmation.name || userName,
        email: pendingConfirmation.email || userEmail,
        purpose: pendingConfirmation.purpose || 'Meeting',
        startTime: pendingConfirmation.startTimeISO,
        endTime: pendingConfirmation.endTimeISO,
      });

      const confirmedData = {
        purpose: pendingConfirmation.purpose || 'Meeting',
        humanDate: formatHumanDate(pendingConfirmation.date),
        startTime12h: format12h(pendingConfirmation.startTime),
      };

      setConfirmedBooking(confirmedData);

      setMessages((prev) => [
        ...prev,
        {
          id: `ai-success-${Date.now()}`,
          sender: 'ai',
          text: `Booked! 🎉 ${confirmedData.humanDate} at ${confirmedData.startTime12h}.`,
          timestamp: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }),
          isSuccess: true,
        },
      ]);

      setPendingConfirmation(null);
      setMissingFields([]);
      setAlternatives([]);
      // Reset draft for next booking
      setBookingDraft({ date: null, startTime: null, duration: 30, purpose: null });

      if (onBookingSuccess) onBookingSuccess();
    } catch (err) {
      console.error('Booking Error:', err);
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-fail-${Date.now()}`,
          sender: 'ai',
          text: `❌ ${err.message || 'Booking failed. Slot may be taken.'}`,
          timestamp: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }),
          isError: true,
        },
      ]);
      setPendingConfirmation(null);
    } finally {
      setLoading(false);
    }
  };

  // Reset everything and start fresh for a new booking
  const handleBookAnother = () => {
    const now = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
    setConfirmedBooking(null);
    setMissingFields([]);
    setAlternatives([]);
    setPendingConfirmation(null);
    setBookingDraft({ date: null, startTime: null, duration: 30, purpose: null });
    // Start a totally fresh conversation
    setMessages([
      {
        id: `fresh-${Date.now()}`,
        sender: 'ai',
        text: `Sure! Let's book another one. When would you like to meet?`,
        timestamp: now,
      },
    ]);
  };

  // Done — show thank you, then return to idle
  const handleDone = () => {
    const now = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
    setConfirmedBooking(null);
    setMissingFields([]);
    setAlternatives([]);
    setBookingDraft({ date: null, startTime: null, duration: 30, purpose: null });
    setMessages((prev) => [
      ...prev,
      {
        id: `thankyou-${Date.now()}`,
        sender: 'ai',
        text: `You’re all set! 🎉 See you soon. If you ever need to book again, just ask!`,
        timestamp: now,
        isSuccess: true,
      },
    ]);
  };

  const handleChipClick = (chipText) => {
    handleSendMessage(chipText);
  };

  // When user clicks an alternative slot chip, clear date+time so it re-parses from the chip text
  const handleAlternativeChipClick = (alt) => {
    setBookingDraft((prev) => ({
      ...prev,
      date: null,
      startTime: null,
    }));
    handleSendMessage(`Book on ${alt.formattedDate} at ${alt.formattedTime}`);
  };

  // Render suggestion chips for ALL missing fields simultaneously
  const renderSuggestionChips = () => {
    if (pendingConfirmation) {
      return (
        <div className="chip-group">
          <button className="chip-btn primary-chip" onClick={handleConfirmBooking} disabled={loading}>
            <CheckCircle2 size={14} /> ✓ Confirm Booking
          </button>
          <button className="chip-btn secondary-chip" onClick={() => handleSendMessage('Change time')} disabled={loading}>
            Change Time
          </button>
          <button
            className="chip-btn danger-chip"
            onClick={() => {
              setPendingConfirmation(null);
              setBookingDraft({ date: null, startTime: null, duration: 30, purpose: null });
            }}
            disabled={loading}
          >
            <X size={14} /> Cancel
          </button>
        </div>
      );
    }

    if (alternatives.length > 0) {
      return (
        <div className="chip-group">
          {alternatives.map((alt, idx) => (
            <button
              key={idx}
              className="chip-btn alt-chip"
              onClick={() => handleAlternativeChipClick(alt)}
              disabled={loading}
            >
              {alt.formattedTime} ({alt.formattedDate})
            </button>
          ))}
        </div>
      );
    }

    // Determine missing fields from both server response AND local bookingDraft
    const draftMissing = [];
    if (!bookingDraft.date) draftMissing.push('date');
    if (!bookingDraft.startTime) draftMissing.push('startTime');
    if (!bookingDraft.purpose) draftMissing.push('purpose');
    const activeMissing = missingFields.length > 0 ? missingFields : draftMissing;

    const sections = [];

    if (activeMissing.includes('date')) {
      sections.push(
        <div key="date-section" className="chip-section">
          <span className="chip-section-label">📅 When?</span>
          <div className="chip-row">
            <button className="chip-btn" onClick={() => handleChipClick('Today')} disabled={loading}>Today</button>
            <button className="chip-btn" onClick={() => handleChipClick('Tomorrow')} disabled={loading}>Tomorrow</button>
            <button className="chip-btn" onClick={() => handleChipClick('Friday')} disabled={loading}>Friday</button>
            <button className="chip-btn" onClick={() => handleChipClick('Monday')} disabled={loading}>Monday</button>
          </div>
        </div>
      );
    }

    if (activeMissing.includes('startTime')) {
      sections.push(
        <div key="time-section" className="chip-section">
          <span className="chip-section-label">🕐 What time?</span>
          <div className="chip-row">
            <button className="chip-btn" onClick={() => handleChipClick('9:00 AM')} disabled={loading}>9:00 AM</button>
            <button className="chip-btn" onClick={() => handleChipClick('10:00 AM')} disabled={loading}>10:00 AM</button>
            <button className="chip-btn" onClick={() => handleChipClick('12:00 PM')} disabled={loading}>12:00 PM</button>
            <button className="chip-btn" onClick={() => handleChipClick('2:00 PM')} disabled={loading}>2:00 PM</button>
            <button className="chip-btn" onClick={() => handleChipClick('4:00 PM')} disabled={loading}>4:00 PM</button>
          </div>
        </div>
      );
    }

    if (activeMissing.includes('purpose')) {
      sections.push(
        <div key="purpose-section" className="chip-section">
          <span className="chip-section-label">📌 What for?</span>
          <div className="chip-row">
            <button className="chip-btn" onClick={() => handleChipClick('Meeting with HR')} disabled={loading}>Meeting with HR</button>
            <button className="chip-btn" onClick={() => handleChipClick('Consultation')} disabled={loading}>Consultation</button>
            <button className="chip-btn" onClick={() => handleChipClick('Project Review')} disabled={loading}>Project Review</button>
            <button className="chip-btn" onClick={() => handleChipClick('Interview')} disabled={loading}>Interview</button>
            <button className="chip-btn" onClick={() => handleChipClick('Team Sync')} disabled={loading}>Team Sync</button>
            <button className="chip-btn" onClick={() => handleChipClick('Design Audit')} disabled={loading}>Design Audit</button>
          </div>
        </div>
      );
    }

    if (sections.length > 0) {
      return <div className="chip-sections-container">{sections}</div>;
    }

    // Default quick-book example buttons (shown when no fields missing and no conflict)
    return (
      <div className="chip-sections-container">
        <div className="chip-section">
          <span className="chip-section-label">⚡ Quick book</span>
          <div className="chip-row">
            <button className="chip-btn quick-book-chip" onClick={() => handleChipClick('Today at 10 AM for a meeting')} disabled={loading}>
              Today · 10 AM · Meeting
            </button>
            <button className="chip-btn quick-book-chip" onClick={() => handleChipClick('Tomorrow at 2 PM for a consultation')} disabled={loading}>
              Tomorrow · 2 PM · Consultation
            </button>
            <button className="chip-btn quick-book-chip" onClick={() => handleChipClick('Friday at 4 PM for a project review')} disabled={loading}>
              Friday · 4 PM · Project Review
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="ai-assistant-container">
      {/* Header */}
      <div className="ai-assistant-header">
        <div className="ai-header-title">
          <Bot size={20} className="bot-icon" />
          <h3>AI Booking Assistant</h3>
        </div>
        <span className="online-badge">
          <span className="pulsing-dot"></span> Fast AI
        </span>
      </div>

      {/* Messages */}
      <div className="ai-chat-messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`chat-message ${msg.sender}-message ${msg.isError ? 'error-msg' : ''} ${msg.isSuccess ? 'success-msg' : ''}`}>
            <div className="message-avatar">
              {msg.sender === 'user' ? <User size={14} /> : <Bot size={14} />}
            </div>
            <div className="message-content">
              <div className="message-text">{msg.text}</div>
              <span className="message-timestamp">{msg.timestamp}</span>
            </div>
          </div>
        ))}

        {loading && (
          <div className="chat-message ai-message loading-msg">
            <div className="message-avatar">
              <Bot size={14} />
            </div>
            <div className="message-content">
              <div className="typing-dots">
                <span></span><span></span><span></span>
              </div>
            </div>
          </div>
        )}

        {/* Compact Confirmation Card */}
        {pendingConfirmation && !loading && (
          <div className="confirmation-card-compact">
            <div className="card-compact-header">
              <Calendar size={16} />
              <h4>Appointment Details</h4>
            </div>
            <div className="card-compact-details">
              <div className="detail-row">
                <span className="detail-icon">📅</span>
                <span className="detail-val">{formatHumanDate(pendingConfirmation.date)}</span>
              </div>
              <div className="detail-row">
                <span className="detail-icon">🕐</span>
                <span className="detail-val">{format12h(pendingConfirmation.startTime)} – {pendingConfirmation.endTime12h || format12h(pendingConfirmation.endTime)}</span>
              </div>
              <div className="detail-row">
                <span className="detail-icon">📌</span>
                <span className="detail-val">{pendingConfirmation.purpose || 'Meeting'}</span>
              </div>
              <div className="detail-row">
                <span className="detail-icon">👤</span>
                <span className="detail-val">{pendingConfirmation.name || userName}</span>
              </div>
              <div className="detail-row">
                <span className="detail-icon">✉️</span>
                <span className="detail-val">{pendingConfirmation.email || userEmail}</span>
              </div>
            </div>
            <div className="card-compact-actions">
              <button className="btn-confirm" onClick={handleConfirmBooking} disabled={loading}>
                <CheckCircle2 size={15} /> Confirm Booking
              </button>
              <button className="btn-cancel" onClick={() => setPendingConfirmation(null)} disabled={loading}>
                Change
              </button>
            </div>
          </div>
        )}

        {/* Success Booking Card */}
        {confirmedBooking && !loading && (
          <div className="success-booking-card">
            <div className="success-header">
              <CheckCircle2 size={18} />
              <h4>Booked! 🎉</h4>
            </div>
            <div className="success-body">
              <strong>"{confirmedBooking.purpose}"</strong>
              <p>{confirmedBooking.humanDate} • {confirmedBooking.startTime12h}</p>
            </div>
            <div className="success-actions">
              <button className="btn-book-another" onClick={handleBookAnother}>
                🗓️ Book Another
              </button>
              <button className="btn-done" onClick={handleDone}>
                ✓ Done
              </button>
            </div>
          </div>
        )}

        {/* Book Another prompt is embedded in the success card above */}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggestion Chips Bar */}
      <div className="suggestion-chips-bar">
        {renderSuggestionChips()}
      </div>

      {/* Input Bar */}
      <div className="ai-chat-input-bar">
        <input
          type="text"
          placeholder={PLACEHOLDER_EXAMPLES[placeholderIdx]}
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
          disabled={loading}
        />
        <button onClick={() => handleSendMessage()} disabled={loading || !inputMessage.trim()}>
          <Send size={15} />
        </button>
      </div>
    </div>
  );
};

export default AIChat;
