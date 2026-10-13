import React, { useState } from 'react';
import { AuthProvider } from './context/AuthContext';
import { TelemetryProvider } from './context/TelemetryContext';
import { Banner } from './components/layout/Banner';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { MobileNav } from './components/layout/MobileNav';

// Pages
import { LiveSensors } from './pages/LiveSensors';
import { AlertsSos } from './pages/AlertsSos';
import { HistoricalData } from './pages/HistoricalData';
import { Settings } from './pages/Settings';

export function AppContent() {
  const [activePage, setActivePage] = useState('live');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const renderActivePage = () => {
    switch (activePage) {
      case 'live':
      case 'overview':
        return <LiveSensors onNavigate={setActivePage} />;
      case 'alerts':
        return <AlertsSos />;
      case 'history':
        return <HistoricalData />;
      case 'device':
        return <Settings initialTab="diagnostics" onNavigate={setActivePage} />;
      case 'settings':
        return <Settings initialTab="general" onNavigate={setActivePage} />;
      default:
        return <LiveSensors onNavigate={setActivePage} />;
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col font-sans selection:bg-cyan-500 selection:text-white">
      {/* Top Simulation / Hardware Status Banner */}
      <Banner />

      {/* Main Top Header */}
      <Header onToggleMobileMenu={() => setMobileMenuOpen(true)} />

      {/* Main Body with Sidebar + Page Viewport */}
      <div className="flex flex-1">
        {/* Desktop Sidebar */}
        <Sidebar activePage={activePage} onSelectPage={setActivePage} />

        {/* Mobile Navigation Drawer */}
        <MobileNav
          isOpen={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
          activePage={activePage}
          onSelectPage={setActivePage}
        />

        {/* Dynamic Page Container */}
        <main className="flex-1 p-4 lg:p-7 max-w-7xl mx-auto w-full overflow-x-hidden">
          {renderActivePage()}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <TelemetryProvider>
        <AppContent />
      </TelemetryProvider>
    </AuthProvider>
  );
}
