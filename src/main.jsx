import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
 
// Ensure app runs on 'localhost' (matching Firebase Authorized Domains) rather than '127.0.0.1'
if (typeof window !== 'undefined' && window.location.hostname === '127.0.0.1') {
  const newUrl = `${window.location.protocol}//localhost:${window.location.port}${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.replace(newUrl);
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
