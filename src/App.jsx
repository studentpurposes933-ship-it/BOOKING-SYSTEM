import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import Navbar from './components/Navbar.jsx';
import AuthModal from './components/Auth/AuthModal.jsx';
import AIChat from './components/AIAssistant/AIChat.jsx';
import CalendarView from './components/Calendar/CalendarView.jsx';
import ManualBookingModal from './components/Calendar/ManualBookingModal.jsx';
import BlockSlotModal from './components/Calendar/BlockSlotModal.jsx';
import UpcomingAppointments from './components/Appointments/UpcomingAppointments.jsx';
import EnvWarning from './components/EnvWarning.jsx';

function MainDashboard() {
  const { currentUser, isConfigured } = useAuth();
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [showBlockModal, setShowBlockModal] = useState(false);

  if (!isConfigured) {
    return <EnvWarning />;
  }

  if (!currentUser) {
    return (
      <div className="unauth-container">
        <Navbar />
        <AuthModal />
      </div>
    );
  }

  return (
    <div className="app-layout">
      <Navbar />

      <main className="dashboard-content">
        <div className="dashboard-top-grid">
          <div className="grid-column left-column">
            <AIChat />
          </div>
          <div className="grid-column right-column">
            <CalendarView
              onSelectSlot={(slotInfo) => setSelectedSlot(slotInfo)}
              onOpenBlockModal={() => setShowBlockModal(true)}
            />
          </div>
        </div>

        <div className="dashboard-bottom-section">
          <UpcomingAppointments />
        </div>
      </main>

      {/* Manual Booking Modal triggered by calendar click */}
      {selectedSlot && (
        <ManualBookingModal
          slotInfo={selectedSlot}
          onClose={() => setSelectedSlot(null)}
        />
      )}

      {/* Block Slot Modal triggered by admin button */}
      {showBlockModal && (
        <BlockSlotModal
          onClose={() => setShowBlockModal(false)}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainDashboard />
    </AuthProvider>
  );
}
