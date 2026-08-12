import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../config/firebase.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { apiService } from '../../services/apiService.js';
import { Calendar, Clock, XCircle, CheckCircle2, ListFilter } from 'lucide-react';

export const UpcomingAppointments = () => {
  const { currentUser } = useAuth();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState(null);

  useEffect(() => {
    if (!currentUser) return;

    // Real-time listener for current user's confirmed appointments
    const q = query(
      collection(db, 'appointments'),
      where('userId', '==', currentUser.uid),
      where('status', '==', 'confirmed')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const apptList = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));

      // Sort by start time ascending
      apptList.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
      setAppointments(apptList);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser]);

  const handleCancel = async (appointmentId) => {
    if (!window.confirm('Are you sure you want to cancel this appointment?')) return;

    setCancellingId(appointmentId);
    try {
      await apiService.cancelAppointment(appointmentId);
    } catch (err) {
      console.error('Failed to cancel appointment:', err);
      alert(err.response?.data?.message || 'Failed to cancel appointment.');
    } finally {
      setCancellingId(null);
    }
  };

  const formatDateTime = (isoStr) => {
    const d = new Date(isoStr);
    return {
      date: d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
      time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
  };

  return (
    <div className="upcoming-appointments-section">
      <div className="section-header">
        <div className="title-area">
          <ListFilter size={20} />
          <h3>My Upcoming Appointments</h3>
        </div>
        <span className="count-badge">{appointments.length} Confirmed</span>
      </div>

      {loading ? (
        <div className="loading-state">Loading appointments...</div>
      ) : appointments.length === 0 ? (
        <div className="empty-appointments-state">
          <Calendar size={32} className="empty-icon" />
          <p>No upcoming appointments found.</p>
          <span>Use the AI Assistant on the left or click an available slot on the calendar to book!</span>
        </div>
      ) : (
        <div className="appointments-grid">
          {appointments.map((appt) => {
            const startObj = formatDateTime(appt.startTime);
            const endObj = formatDateTime(appt.endTime);

            return (
              <div key={appt.id} className="appointment-card">
                <div className="appt-card-header">
                  <span className="purpose-title">{appt.purpose}</span>
                  <span className="status-pill confirmed">
                    <CheckCircle2 size={12} /> Confirmed
                  </span>
                </div>

                <div className="appt-card-details">
                  <div className="detail-item">
                    <Calendar size={14} />
                    <span>{startObj.date}</span>
                  </div>
                  <div className="detail-item">
                    <Clock size={14} />
                    <span>{startObj.time} - {endObj.time}</span>
                  </div>
                </div>

                <div className="appt-card-footer">
                  <button
                    className="cancel-appt-btn"
                    onClick={() => handleCancel(appt.id)}
                    disabled={cancellingId === appt.id}
                  >
                    <XCircle size={14} />
                    {cancellingId === appt.id ? 'Cancelling...' : 'Cancel Appointment'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default UpcomingAppointments;
