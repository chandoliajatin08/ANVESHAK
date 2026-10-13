import {
  Gauge,
  AlertTriangle,
  History,
  Settings as SettingsIcon,
} from 'lucide-react';

export const NAV_ITEMS = [
  { id: 'live', label: 'Live Monitoring', icon: Gauge },
  { id: 'alerts', label: 'Alerts & SOS', icon: AlertTriangle, hasBadge: true },
  { id: 'history', label: 'History', icon: History },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
];
