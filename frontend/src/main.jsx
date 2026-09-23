import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './application.css';
import './recruiter.css';
import './auth.css';
import './job-details.css';
import './role-tabs.css';
import './enhancements.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
