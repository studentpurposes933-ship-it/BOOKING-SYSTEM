import React, { useState, useEffect } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../config/firebase.js';
import { Calendar as CalendarIcon, ShieldBan } from 'lucide-react';

export const CalendarView = ({ onSelectSlot, onOpenBlockModal }) => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Real-time Firestore listener for active appointments
    const appointmentsQuery = query(collection(db, 'appointments'), where('status', '==', 'confirmed'));

    const unsubAppointments = onSnapshot(
      appointmentsQuery,
      (snapshot) => {
        const apptEvents = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            title: `🔵 ${data.purpose} (${data.name})`,
            start: data.startTime,
            end: data.endTime,
            backgroundColor: '#2563eb', // Blue for booked
            borderColor: '#1d4ed8',
            textColor: '#ffffff',
            extendedProps: {
              type: 'appointment',
              ...data,
            },
          };
        });

        // Real-time Firestore listener for blocked slots
        const blockedQuery = collection(db, 'blockedSlots');
        const unsubBlocked = onSnapshot(
          blockedQuery,
          (blockedSnapshot) => {
            const blockedEvents = blockedSnapshot.docs.map((docSnap) => {
              const data = docSnap.data();
              return {
                id: docSnap.id,
                title: `🔴 ${data.title || 'Blocked Slot'}`,
                start: data.startTime,
                end: data.endTime,
                backgroundColor: '#dc2626', // Red for blocked
                borderColor: '#b91c1c',
                textColor: '#ffffff',
                extendedProps: {
                  type: 'blocked',
                  ...data,
                },
              };
            });

            setEvents([...apptEvents, ...blockedEvents]);
            setLoading(false);
          },
          (err) => {
            console.warn('Blocked slots listener notice:', err.message);
            setEvents(apptEvents);
            setLoading(false);
          }
        );

        return () => unsubBlocked();
      },
      (err) => {
        console.warn('Appointments listener notice:', err.message);
        setLoading(false);
      }
    );

    return () => unsubAppointments();
  }, []);

  const handleDateSelect = (selectInfo) => {
    if (onSelectSlot) {
      onSelectSlot({
        start: selectInfo.start,
        end: selectInfo.end,
        startStr: selectInfo.startStr,
        endStr: selectInfo.endStr,
      });
    }
  };

  return (
    <div className="calendar-container">
      <div className="calendar-header-bar">
        <div className="calendar-title">
          <CalendarIcon size={20} />
          <h3>Real-Time Schedule Calendar</h3>
        </div>
        <div className="calendar-legend">
          <span className="legend-item"><span className="dot blue"></span> 🔵 Booked</span>
          <span className="legend-item"><span className="dot red"></span> 🔴 Blocked</span>
          <span className="legend-item"><span className="dot green"></span> 🟢 Available Hours (09:00 - 17:00)</span>
          <button className="block-slot-btn" onClick={onOpenBlockModal}>
            <ShieldBan size={14} /> Block Time Slot
          </button>
        </div>
      </div>

      <div className="fullcalendar-wrapper">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay',
          }}
          selectable={true}
          selectMirror={true}
          select={handleDateSelect}
          events={events}
          slotMinTime="08:00:00"
          slotMaxTime="18:00:00"
          allDaySlot={false}
          height="100%"
          businessHours={{
            daysOfWeek: [1, 2, 3, 4, 5], // Monday - Friday
            startTime: '09:00',
            endTime: '17:00',
          }}
          eventTimeFormat={{
            hour: '2-digit',
            minute: '2-digit',
            meridiem: 'short',
          }}
        />
      </div>
    </div>
  );
};

export default CalendarView;
