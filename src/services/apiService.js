import axios from 'axios';
import { auth } from '../config/firebase.js';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

/**
 * Gets current user's Firebase ID token
 */
const getIdToken = async () => {
  const currentUser = auth.currentUser;
  if (!currentUser) return null;
  return await currentUser.getIdToken();
};

/**
 * Creates configured Axios instance with Bearer token
 */
const createApiClient = async () => {
  const token = await getIdToken();
  return axios.create({
    baseURL: API_BASE_URL,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
};

export const apiService = {
  // Send AI Chat message
  async sendAIChat(message, history = []) {
    const client = await createApiClient();
    const response = await client.post('/ai/chat', { message, history });
    return response.data;
  },

  // Check slot availability
  async checkSlot(slotData) {
    const client = await createApiClient();
    const response = await client.post('/appointments/check', slotData);
    return response.data;
  },

  // Book appointment (Atomic backend transaction)
  async bookAppointment(bookingData) {
    const client = await createApiClient();
    const response = await client.post('/appointments/book', bookingData);
    return response.data;
  },

  // Cancel appointment
  async cancelAppointment(appointmentId) {
    const client = await createApiClient();
    const response = await client.post('/appointments/cancel', { appointmentId });
    return response.data;
  },

  // Create blocked slot
  async createBlockedSlot(blockedData) {
    const client = await createApiClient();
    const response = await client.post('/appointments/blocked-slots', blockedData);
    return response.data;
  },

  // Delete blocked slot
  async deleteBlockedSlot(slotId) {
    const client = await createApiClient();
    const response = await client.delete(`/appointments/blocked-slots/${slotId}`);
    return response.data;
  },
};

export default apiService;
