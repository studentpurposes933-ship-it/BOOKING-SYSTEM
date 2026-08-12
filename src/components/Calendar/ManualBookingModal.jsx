import React, { useState, useEffect } from 'react';
import { createClientAppointmentAtomic } from '../../services/clientBookingService.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { X, Calendar, AlertCircle } from 'lucide-react';

export const ManualBookingModal = ({ slotInfo, onClose, onSuccess }) => {
  const { userProfile, currentUser } = useAuth();

  const [formData, setFormData] = useState({
    name: userProfile?.name || currentUser?.displayName || '',
    email: userProfile?.email || currentUser?.email || '',
    purpose: '',
    date: '',
    startTime: '09:00',
    endTime: '09:30',
  });

  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (slotInfo?.start) {
      const startDate = new Date(slotInfo.start);
      const endDate = slotInfo.end ? new Date(slotInfo.end) : new Date(startDate.getTime() + 30 * 60 * 1000);

      const dateStr = startDate.toISOString().split('T')[0];
      const startStr = `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`;
      const endStr = `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`;

      setFormData((prev) => ({
        ...prev,
        date: dateStr,
        startTime: startStr,
        endTime: endStr,
      }));
    }
  }, [slotInfo]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    setError('');

    if (!formData.name.trim() || !formData.email.trim() || !formData.purpose.trim() || !formData.date) {
      setError('Please fill in all required fields.');
      return;
    }

    const [startH, startM] = formData.startTime.split(':').map(Number);
    const [endH, endM] = formData.endTime.split(':').map(Number);
    const [year, month, day] = formData.date.split('-').map(Number);

    const startISO = new Date(year, month - 1, day, startH, startM, 0).toISOString();
    const endISO = new Date(year, month - 1, day, endH, endM, 0).toISOString();

    if (new Date(endISO).getTime() <= new Date(startISO).getTime()) {
      setError('End time must be strictly after start time.');
      return;
    }

    setSubmitting(true);
    try {
      // Execute single atomic Firestore Transaction
      await createClientAppointmentAtomic({
        name: formData.name,
        email: formData.email,
        purpose: formData.purpose,
        startTime: startISO,
        endTime: endISO,
      });

      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error('Manual Booking Error:', err);
      setError(err.message || 'Failed to book appointment due to conflict or validation error.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <div className="modal-header">
          <div className="modal-title">
            <Calendar size={20} />
            <h3>Manual Calendar Booking</h3>
          </div>
          <button className="close-btn" onClick={onClose} disabled={submitting}>
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="modal-error-alert">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-row">
            <div className="form-group">
              <label>Full Name</label>
              <input type="text" name="name" value={formData.name} onChange={handleChange} required disabled={submitting} />
            </div>
            <div className="form-group">
              <label>Email Address</label>
              <input type="email" name="email" value={formData.email} onChange={handleChange} required disabled={submitting} />
            </div>
          </div>

          <div className="form-group">
            <label>Meeting Purpose / Title</label>
            <input
              type="text"
              name="purpose"
              placeholder="e.g. Project Strategy Session"
              value={formData.purpose}
              onChange={handleChange}
              required
              disabled={submitting}
            />
          </div>

          <div className="form-group">
            <label>Date</label>
            <input type="date" name="date" value={formData.date} onChange={handleChange} required disabled={submitting} />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Start Time</label>
              <input type="time" name="startTime" value={formData.startTime} onChange={handleChange} required disabled={submitting} />
            </div>
            <div className="form-group">
              <label>End Time</label>
              <input type="time" name="endTime" value={formData.endTime} onChange={handleChange} required disabled={submitting} />
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="secondary-btn" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="primary-btn" disabled={submitting}>
              {submitting ? 'Booking...' : 'Confirm Appointment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ManualBookingModal;
