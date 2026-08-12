import React, { useState } from 'react';
import { apiService } from '../../services/apiService.js';
import { X, ShieldBan, AlertCircle } from 'lucide-react';

export const BlockSlotModal = ({ onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    title: 'Team Break / Out of Office',
    date: new Date().toISOString().split('T')[0],
    startTime: '12:00',
    endTime: '13:00',
  });

  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const [startH, startM] = formData.startTime.split(':').map(Number);
    const [endH, endM] = formData.endTime.split(':').map(Number);
    const [year, month, day] = formData.date.split('-').map(Number);

    const startISO = new Date(year, month - 1, day, startH, startM, 0).toISOString();
    const endISO = new Date(year, month - 1, day, endH, endM, 0).toISOString();

    if (new Date(endISO).getTime() <= new Date(startISO).getTime()) {
      setError('End time must be after start time.');
      return;
    }

    setSubmitting(true);
    try {
      await apiService.createBlockedSlot({
        title: formData.title,
        startTime: startISO,
        endTime: endISO,
      });

      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error('Block slot error:', err);
      setError(err.response?.data?.message || err.message || 'Failed to create blocked slot.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <div className="modal-header">
          <div className="modal-title">
            <ShieldBan size={20} color="#dc2626" />
            <h3>Block Time Slot</h3>
          </div>
          <button className="close-btn" onClick={onClose}>
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
          <div className="form-group">
            <label>Reason / Title for Blocked Slot</label>
            <input
              type="text"
              name="title"
              value={formData.title}
              onChange={handleChange}
              placeholder="e.g. Lunch Break, Maintenance"
              required
            />
          </div>

          <div className="form-group">
            <label>Date</label>
            <input type="date" name="date" value={formData.date} onChange={handleChange} required />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Start Time</label>
              <input type="time" name="startTime" value={formData.startTime} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label>End Time</label>
              <input type="time" name="endTime" value={formData.endTime} onChange={handleChange} required />
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="secondary-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="danger-btn" disabled={submitting}>
              {submitting ? 'Blocking...' : 'Block Slot'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BlockSlotModal;
