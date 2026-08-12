import { adminAuth, firebaseConfig } from '../config/firebaseAdmin.js';
import axios from 'axios';

export const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'No authorization token provided. Please log in first.',
    });
  }

  const token = authHeader.split('Bearer ')[1];

  try {
    // 1. Try Firebase Admin verification first if available
    if (adminAuth) {
      try {
        const decodedToken = await adminAuth.verifyIdToken(token);
        req.user = {
          uid: decodedToken.uid,
          email: decodedToken.email || '',
          name: decodedToken.name || '',
        };
        return next();
      } catch (adminErr) {
        console.warn('Admin token verify failed, falling back to REST API:', adminErr.message);
      }
    }

    // 2. Fallback to Firebase REST API lookup using web API key
    const response = await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseConfig.apiKey}`,
      { idToken: token }
    );

    if (response.data && response.data.users && response.data.users.length > 0) {
      const user = response.data.users[0];
      req.user = {
        uid: user.localId,
        email: user.email || '',
        name: user.displayName || '',
      };
      return next();
    }

    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid authentication token.',
    });
  } catch (error) {
    console.error('Token verification error:', error.message);
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication failed. Please log in again.',
    });
  }
};
