import React from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { Calendar, LogOut, User, Clock, Sparkles } from 'lucide-react';

export const Navbar = () => {
  const { userProfile, currentUser, logout } = useAuth();

  return (
    <header className="app-navbar">
      <div className="nav-brand">
        <div className="brand-logo">
          <Sparkles size={22} className="sparkle-icon" />
          <Calendar size={22} />
        </div>
        <div className="brand-text">
          <h1>Smart AppointAI</h1>
          <span className="subtitle">AI-Powered Real-Time Booking System</span>
        </div>
      </div>

      <div className="nav-center">
        <div className="working-hours-badge">
          <Clock size={14} />
          <span>Working Hours: Mon - Fri, 09:00 AM - 05:00 PM</span>
        </div>
      </div>

      <div className="nav-user-actions">
        {currentUser && (
          <div className="user-profile-badge">
            <div className="avatar-circle">
              <User size={16} />
            </div>
            <div className="user-info">
              <span className="user-name">{userProfile?.name || currentUser.displayName || 'User'}</span>
              <span className="user-email">{userProfile?.email || currentUser.email}</span>
            </div>
            <button onClick={logout} className="logout-btn" title="Logout">
              <LogOut size={16} />
              <span>Logout</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

export default Navbar;
