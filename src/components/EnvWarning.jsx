import React from 'react';
import { AlertTriangle, Key, ShieldAlert } from 'lucide-react';

export const EnvWarning = () => {
  return (
    <div className="env-warning-overlay">
      <div className="env-warning-card">
        <div className="warning-icon">
          <ShieldAlert size={48} color="#ef4444" />
        </div>
        <h2>Configuration Error Required</h2>
        <p>
          Firebase environment variables are not configured in <code>.env</code>.
        </p>
        <div className="instructions-box">
          <p><strong>To enable real authentication and Firestore database:</strong></p>
          <ol>
            <li>Copy environment template: <code>cp .env.example .env</code></li>
            <li>Fill in your project credentials in <code>.env</code>:
              <pre>
{`VITE_FIREBASE_API_KEY=your_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id`}
              </pre>
            </li>
            <li>Restart Vite server (<code>npm run dev</code>).</li>
          </ol>
        </div>
      </div>
    </div>
  );
};

export default EnvWarning;
