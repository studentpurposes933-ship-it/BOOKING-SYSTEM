import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { Lock, Mail, User, AlertCircle, Eye, EyeOff } from 'lucide-react';

export const AuthModal = () => {
  const { login, register } = useAuth();
  const [isLoginTab, setIsLoginTab] = useState(true);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (isLoginTab) {
      if (!formData.email || !formData.password) {
        setError('Please enter both Email and Password.');
        return;
      }
      try {
        setSubmitting(true);
        await login(formData.email, formData.password);
      } catch (err) {
        console.error('Login error:', err);
        if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
          setError('Invalid email or password. Please try again.');
        } else {
          setError(err.message || 'Failed to login.');
        }
      } finally {
        setSubmitting(false);
      }
    } else {
      // Registration validation
      if (!formData.name.trim()) {
        setError('Full Name is required.');
        return;
      }
      if (!formData.email.trim()) {
        setError('Email address is required.');
        return;
      }
      if (formData.password.length < 6) {
        setError('Password must be at least 6 characters long.');
        return;
      }
      if (formData.password !== formData.confirmPassword) {
        setError('Passwords do not match.');
        return;
      }

      try {
        setSubmitting(true);
        await register({
          name: formData.name.trim(),
          email: formData.email.trim(),
          password: formData.password,
        });
      } catch (err) {
        console.error('Registration error:', err);
        if (err.code === 'auth/email-already-in-use') {
          setError('An account with this email already exists.');
        } else {
          setError(err.message || 'Failed to create account.');
        }
      } finally {
        setSubmitting(false);
      }
    }
  };

  return (
    <div className="auth-overlay">
      <div className="auth-card">
        <div className="auth-header">
          <h2>Welcome to Smart AppointAI</h2>
          <p>Please sign in or register to access real-time appointment booking</p>
          <div className="auth-tabs">
            <button
              className={`auth-tab ${isLoginTab ? 'active' : ''}`}
              onClick={() => {
                setIsLoginTab(true);
                setError('');
              }}
            >
              Login
            </button>
            <button
              className={`auth-tab ${!isLoginTab ? 'active' : ''}`}
              onClick={() => {
                setIsLoginTab(false);
                setError('');
              }}
            >
              Register
            </button>
          </div>
        </div>

        {error && (
          <div className="auth-error-alert">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          {!isLoginTab && (
            <div className="form-group">
              <label>Full Name</label>
              <div className="input-icon-wrapper">
                <User size={18} className="input-icon" />
                <input
                  type="text"
                  name="name"
                  placeholder="Prajesh Patel"
                  value={formData.name}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>
          )}

          <div className="form-group">
            <label>Email Address</label>
            <div className="input-icon-wrapper">
              <Mail size={18} className="input-icon" />
              <input
                type="email"
                name="email"
                placeholder="user@example.com"
                value={formData.email}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label>Password</label>
            <div className="input-icon-wrapper">
              <Lock size={18} className="input-icon" />
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                placeholder="••••••••"
                value={formData.password}
                onChange={handleChange}
                required
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword(!showPassword)}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {!isLoginTab && (
            <div className="form-group">
              <label>Confirm Password</label>
              <div className="input-icon-wrapper">
                <Lock size={18} className="input-icon" />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  name="confirmPassword"
                  placeholder="••••••••"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  required
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  title={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          )}

          <button type="submit" className="auth-submit-btn" disabled={submitting}>
            {submitting ? 'Processing...' : isLoginTab ? 'Login to Dashboard' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AuthModal;
