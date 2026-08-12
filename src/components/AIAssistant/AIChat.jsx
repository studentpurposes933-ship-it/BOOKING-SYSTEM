import React, { useState, useRef, useEffect } from 'react';
import { apiService } from '../../services/apiService.js';
import { createClientAppointmentAtomic } from '../../services/clientBookingService.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { Bot, Send, User, Calendar, Clock, CheckCircle2, X } from 'lucide-react';

// Format 24h string ("14:00") or ISO date to 12-hour AM/PM ("2:00 PM")
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

// Format YYYY-MM-DD or ISO string to human date ("Tomorrow", "Thursday, Aug 13")
const formatHumanDate = (dateStr) => {
  if (!dateStr) return '';
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  const tom = new Date(now);
  tom.setDate(tom.getDate() + 1);
  const tomStr = tom.toISOString().split('T')[0];

  const target = dateStr.split('T')[0];
  if (target === todayStr) return 'Today';
  if (target === tomStr) return 'Tomorrow';

  const d = new Date(target + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;

  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

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
      const response = await apiService.sendAIChat(textToSend, chatHistory);

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

  const handleChipClick = (chipText) => {
    handleSendMessage(chipText);
  };

  // Determine dynamic suggestion chips based on missing info or confirmation state
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
          <button className="chip-btn danger-chip" onClick={() => setPendingConfirmation(null)} disabled={loading}>
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
              onClick={() => handleSendMessage(`Book on ${alt.formattedDate} at ${alt.formattedTime}`)}
              disabled={loading}
            >
              {alt.formattedTime} ({alt.formattedDate})
            </button>
          ))}
        </div>
      );
    }

    if (missingFields.includes('date')) {
      return (
        <div className="chip-group">
          <button className="chip-btn" onClick={() => handleChipClick('Today')} disabled={loading}>Today</button>
          <button className="chip-btn" onClick={() => handleChipClick('Tomorrow')} disabled={loading}>Tomorrow</button>
          <button className="chip-btn" onClick={() => handleChipClick('Next Monday')} disabled={loading}>Monday</button>
          <button className="chip-btn" onClick={() => handleChipClick('This Friday')} disabled={loading}>Friday</button>
        </div>
      );
    }

    if (missingFields.includes('startTime')) {
      return (
        <div className="chip-group">
          <button className="chip-btn" onClick={() => handleChipClick('10:00 AM')} disabled={loading}>10:00 AM</button>
          <button className="chip-btn" onClick={() => handleChipClick('2:00 PM')} disabled={loading}>2:00 PM</button>
          <button className="chip-btn" onClick={() => handleChipClick('4:00 PM')} disabled={loading}>4:00 PM</button>
        </div>
      );
    }

    if (missingFields.includes('purpose')) {
      return (
        <div className="chip-group">
          <button className="chip-btn" onClick={() => handleChipClick('Meeting')} disabled={loading}>Meeting</button>
          <button className="chip-btn" onClick={() => handleChipClick('Consultation')} disabled={loading}>Consultation</button>
          <button className="chip-btn" onClick={() => handleChipClick('Project Review')} disabled={loading}>Project Review</button>
          <button className="chip-btn" onClick={() => handleChipClick('Interview')} disabled={loading}>Interview</button>
        </div>
      );
    }

    // Default quick starter chips
    return (
      <div className="chip-group">
        <button className="chip-btn" onClick={() => handleChipClick('Book tomorrow at 3 PM for project meeting')} disabled={loading}>
          "Book tomorrow at 3 PM"
        </button>
        <button className="chip-btn" onClick={() => handleChipClick('Book next Monday morning for consultation')} disabled={loading}>
          "Monday morning"
        </button>
        <button className="chip-btn" onClick={() => handleChipClick('Can I book Friday at 4:30 PM?')} disabled={loading}>
          "Friday at 4:30 PM"
        </button>
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

      {/* Messages Scroll Area */}
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

        {/* Compact Confirmation Summary Card */}
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
                <CheckCircle2 size={15} /> Confirm
              </button>
              <button className="btn-cancel" onClick={() => setPendingConfirmation(null)} disabled={loading}>
                Change
              </button>
            </div>
          </div>
        )}

        {/* Success Confirmation Card */}
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
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Dynamic Suggestion Chips */}
      <div className="suggestion-chips-bar">
        {renderSuggestionChips()}
      </div>

      {/* Input Bar */}
      <div className="ai-chat-input-bar">
        <input
          type="text"
          placeholder="Type your request (e.g. 'Book tomorrow at 4 PM')..."
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
