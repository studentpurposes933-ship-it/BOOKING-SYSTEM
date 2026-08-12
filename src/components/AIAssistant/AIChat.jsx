import React, { useState, useRef, useEffect } from 'react';
import { apiService } from '../../services/apiService.js';
import { createClientAppointmentAtomic } from '../../services/clientBookingService.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { Bot, Send, User, Sparkles, CheckCircle2, Clock, RefreshCw } from 'lucide-react';

// Pool of dynamic prompts that automatically rotate
const DYNAMIC_PROMPT_POOLS = [
  [
    'Book tomorrow at 3:00 PM for a project meeting.',
    'I need a meeting next Monday morning.',
    'Can I book Friday at 4:30 PM for consultation?',
  ],
  [
    'Schedule tomorrow morning at 10:00 AM for code review.',
    'Book next Tuesday at 2:30 PM for strategy sync.',
    'Can I get an appointment Friday afternoon at 3:00 PM?',
  ],
  [
    'I need a 1 hour consultation next Wednesday at 11 AM.',
    'Schedule tomorrow at 4:00 PM for design audit.',
    'Book an appointment next Thursday at 2:00 PM.',
  ],
];

const PLACEHOLDER_LIST = [
  "Type your request (e.g. 'Book tomorrow at 3 PM')...",
  "Type your request (e.g. 'Schedule Friday afternoon for consultation')...",
  "Type your request (e.g. 'I need a 1 hour meeting next Monday')...",
  "Type your request (e.g. 'Book tomorrow morning at 10 AM')...",
];

export const AIChat = ({ onBookingSuccess }) => {
  const { userProfile, currentUser } = useAuth();
  const [messages, setMessages] = useState([
    {
      id: 'init-1',
      sender: 'ai',
      text: `Hi ${userProfile?.name || currentUser?.displayName || 'there'}! I'm your AI Booking Assistant. How can I help you schedule an appointment today?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState(null);
  const [alternatives, setAlternatives] = useState([]);

  // Dynamic Prompt & Placeholder State
  const [promptPoolIndex, setPromptPoolIndex] = useState(0);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);

  // Real-Time Sync Indicator State
  const [lastUpdated, setLastUpdated] = useState(new Date().toLocaleTimeString());
  const [secondsToNextUpdate, setSecondsToNextUpdate] = useState(5);

  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, pendingConfirmation, alternatives]);

  // Rotate prompt pills & placeholder every 8 seconds
  useEffect(() => {
    const promptInterval = setInterval(() => {
      setPromptPoolIndex((prev) => (prev + 1) % DYNAMIC_PROMPT_POOLS.length);
      setPlaceholderIndex((prev) => (prev + 1) % PLACEHOLDER_LIST.length);
    }, 8000);

    return () => clearInterval(promptInterval);
  }, []);

  // Ticking 5-second countdown timer for next sync status
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsToNextUpdate((prev) => {
        if (prev <= 1) {
          setLastUpdated(new Date().toLocaleTimeString());
          return 5;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const activePrompts = DYNAMIC_PROMPT_POOLS[promptPoolIndex];

  const handleSendMessage = async (customText = null) => {
    const textToSend = customText || inputMessage;
    if (!textToSend.trim() || loading) return;

    const userMsgObj = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsgObj]);
    if (!customText) setInputMessage('');
    setLoading(true);
    setAlternatives([]);
    setPendingConfirmation(null);

    // Rotate prompts on send
    setPromptPoolIndex((prev) => (prev + 1) % DYNAMIC_PROMPT_POOLS.length);

    try {
      const chatHistory = messages.map((m) => `${m.sender === 'user' ? 'User' : 'AI'}: ${m.text}`);
      const response = await apiService.sendAIChat(textToSend, chatHistory);

      const aiMsgObj = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: response.message,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, aiMsgObj]);

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
        text: err.response?.data?.message || 'Sorry, I encountered an issue checking your booking request. Please try again.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isError: true,
      };
      setMessages((prev) => [...prev, errorMsgObj]);
    } finally {
      setLoading(false);
      setLastUpdated(new Date().toLocaleTimeString());
    }
  };

  const handleConfirmBooking = async () => {
    if (!pendingConfirmation || loading) return;

    setLoading(true);
    try {
      await createClientAppointmentAtomic({
        name: pendingConfirmation.name || userProfile?.name || currentUser?.displayName || 'Valued User',
        email: pendingConfirmation.email || userProfile?.email || currentUser?.email || '',
        purpose: pendingConfirmation.purpose,
        startTime: pendingConfirmation.startTimeISO,
        endTime: pendingConfirmation.endTimeISO,
      });

      setMessages((prev) => [
        ...prev,
        {
          id: `ai-success-${Date.now()}`,
          sender: 'ai',
          text: `🎉 Success! Your appointment "${pendingConfirmation.purpose}" has been confirmed for ${pendingConfirmation.date} at ${pendingConfirmation.startTime}. Data saved to Firestore!`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isSuccess: true,
        },
      ]);

      setPendingConfirmation(null);
      if (onBookingSuccess) onBookingSuccess();
    } catch (err) {
      console.error('Booking Confirmation Error:', err);
      const errMsg = err.message || 'Failed to confirm booking.';
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-fail-${Date.now()}`,
          sender: 'ai',
          text: `❌ Booking Failed: ${errMsg}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isError: true,
        },
      ]);
      setPendingConfirmation(null);
    } finally {
      setLoading(false);
      setLastUpdated(new Date().toLocaleTimeString());
    }
  };

  const handleSelectAlternative = (altSlot) => {
    const requestPrompt = `Let's book on ${altSlot.formattedDate} at ${altSlot.formattedTime}.`;
    handleSendMessage(requestPrompt);
  };

  return (
    <div className="ai-assistant-container">
      <div className="ai-assistant-header">
        <div className="ai-header-title">
          <Bot size={20} className="bot-icon" />
          <h3>AI Booking Assistant</h3>
        </div>
        <div className="sync-status-indicator" title="Real-time Firestore listener active">
          <span className="pulsing-dot"></span>
          <span className="sync-text">Updated: {lastUpdated}</span>
          <span className="next-sync-badge">Next sync: {secondsToNextUpdate}s</span>
        </div>
      </div>

      <div className="ai-chat-messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`chat-message ${msg.sender}-message ${msg.isError ? 'error-msg' : ''} ${msg.isSuccess ? 'success-msg' : ''}`}>
            <div className="message-avatar">
              {msg.sender === 'user' ? <User size={16} /> : <Bot size={16} />}
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
              <Bot size={16} />
            </div>
            <div className="message-content">
              <div className="typing-dots">
                <span></span><span></span><span></span>
              </div>
            </div>
          </div>
        )}

        {/* Alternative Time Slots suggestions */}
        {alternatives.length > 0 && !loading && (
          <div className="alternatives-card">
            <div className="alt-title">
              <Clock size={16} />
              <span>Suggested Available Slots:</span>
            </div>
            <div className="alt-pills">
              {alternatives.map((alt, idx) => (
                <button key={idx} className="alt-pill" onClick={() => handleSelectAlternative(alt)}>
                  {alt.formattedDate} @ {alt.formattedTime}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Appointment Confirmation Summary Card */}
        {pendingConfirmation && !loading && (
          <div className="confirmation-card">
            <div className="confirmation-header">
              <Sparkles size={18} />
              <h4>Appointment Summary</h4>
            </div>
            <div className="confirmation-body">
              <div className="summary-row">
                <span className="label">Name:</span>
                <span className="value">{pendingConfirmation.name || userProfile?.name}</span>
              </div>
              <div className="summary-row">
                <span className="label">Email:</span>
                <span className="value">{pendingConfirmation.email || userProfile?.email}</span>
              </div>
              <div className="summary-row">
                <span className="label">Date:</span>
                <span className="value">{pendingConfirmation.date}</span>
              </div>
              <div className="summary-row">
                <span className="label">Time:</span>
                <span className="value">{pendingConfirmation.startTime} ({pendingConfirmation.duration || 30} mins)</span>
              </div>
              <div className="summary-row">
                <span className="label">Purpose:</span>
                <span className="value">{pendingConfirmation.purpose}</span>
              </div>
            </div>
            <div className="confirmation-actions">
              <button className="confirm-btn" onClick={handleConfirmBooking} disabled={loading}>
                <CheckCircle2 size={16} /> Confirm Booking
              </button>
              <button className="cancel-btn" onClick={() => setPendingConfirmation(null)} disabled={loading}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Dynamic Rotating Quick Prompts */}
      <div className="quick-prompts-bar">
        {activePrompts.map((p, idx) => (
          <button key={idx} className="prompt-pill dynamic-prompt" onClick={() => handleSendMessage(p)} disabled={loading}>
            "{p}"
          </button>
        ))}
      </div>

      {/* Input box with rotating placeholder */}
      <div className="ai-chat-input-bar">
        <input
          type="text"
          placeholder={PLACEHOLDER_LIST[placeholderIndex]}
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
          disabled={loading}
        />
        <button onClick={() => handleSendMessage()} disabled={loading || !inputMessage.trim()}>
          <Send size={16} />
        </button>
      </div>
    </div>
  );
};

export default AIChat;
