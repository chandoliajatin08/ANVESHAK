import React, { useState, useMemo, useEffect } from 'react';
import {
  Calendar,
  BarChart2,
  Search,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Brush,
  Legend,
  AreaChart,
  Area,
} from 'recharts';
import { Badge } from '../components/common/Badge';
import {
  initFirebase,
  getStoredFirebaseConfig,
  ref,
  onValue,
  off,
} from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import {
  formatADC,
  formatDateTime,
} from '../utils/formatters';

const normalizeHistoryItem = (item, id) => {
  if (!item || typeof item !== 'object') return null;

  const rawAdc = item.mq2?.rawAdc ?? item.gasAdc ?? item.adc ?? item.gas ?? null;
  const ppm = item.mq2?.ppm ?? item.ppm ?? null;
  const ax = item.mpu6050?.accel?.x ?? item.accelX ?? item.ax ?? null;
  const ay = item.mpu6050?.accel?.y ?? item.accelY ?? item.ay ?? null;
  const az = item.mpu6050?.accel?.z ?? item.accelZ ?? item.az ?? null;
  const gx = item.mpu6050?.gyro?.x ?? item.gyroX ?? item.gx ?? null;
  const gy = item.mpu6050?.gyro?.y ?? item.gyroY ?? item.gy ?? null;
  const gz = item.mpu6050?.gyro?.z ?? item.gyroZ ?? item.gz ?? null;

  let gForce = item.mpu6050?.gForce ?? item.gForce ?? null;
  if (gForce === null && ax !== null && ay !== null && az !== null) {
    gForce = Math.sqrt(ax * ax + ay * ay + az * az);
  }

  const rawTemp = item.mpu6050?.tempC ?? item.tempC ?? item.temp ?? null;
  const tempC = rawTemp !== null && !isNaN(Number(rawTemp)) ? Number(rawTemp) : null;

  return {
    id: id || item.id || `hist_${Date.now()}_${Math.random()}`,
    timestamp: item.timestamp || new Date().toISOString(),
    mq2: {
      rawAdc: rawAdc !== null && !isNaN(Number(rawAdc)) ? Number(rawAdc) : null,
      ppm: ppm !== null && !isNaN(Number(ppm)) ? Number(ppm) : null,
    },
    mpu6050: {
      accel: {
        x: ax !== null && !isNaN(Number(ax)) ? Number(ax) : null,
        y: ay !== null && !isNaN(Number(ay)) ? Number(ay) : null,
        z: az !== null && !isNaN(Number(az)) ? Number(az) : null,
      },
      gyro: {
        x: gx !== null && !isNaN(Number(gx)) ? Number(gx) : null,
        y: gy !== null && !isNaN(Number(gy)) ? Number(gy) : null,
        z: gz !== null && !isNaN(Number(gz)) ? Number(gz) : null,
      },
      gForce: gForce !== null && !isNaN(Number(gForce)) ? Number(Number(gForce).toFixed(2)) : 0,
      tempC,
    },
    alert: item.alert || (item.sosActive ? { type: 'SOS_TRIGGER', message: 'Physical Emergency SOS engaged' } : null),
  };
};

export const HistoricalData = () => {
  const { firebaseUser, authReady } = useAuth();
  // Date range presets
  const [preset, setPreset] = useState('24h'); // '1h' | '6h' | '24h' | '7d' | 'custom'
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 16);
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 16));

  const [activeMetric, setActiveMetric] = useState('gas'); // 'gas' | 'accel' | 'gyro' | 'temp'
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const rowsPerPage = 10;

  // Handle Preset Change
  const handlePresetSelect = (p) => {
    setPreset(p);
    const now = new Date();
    let start = new Date();

    if (p === '1h') {
      start.setHours(now.getHours() - 1);
    } else if (p === '6h') {
      start.setHours(now.getHours() - 6);
    } else if (p === '24h') {
      start.setDate(now.getDate() - 1);
    } else if (p === '7d') {
      start.setDate(now.getDate() - 7);
    }

    if (p !== 'custom') {
      setStartDate(start.toISOString().slice(0, 16));
      setEndDate(now.toISOString().slice(0, 16));
    }
  };

  const [firebaseLogs, setFirebaseLogs] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    if (!authReady || !firebaseUser) {
      setFirebaseLogs([]);
      setHistoryLoading(false);
      return;
    }

    const config = getStoredFirebaseConfig();
    const fb = initFirebase(config);
    if (!fb.success || !fb.db) {
      setFirebaseLogs([]);
      setHistoryLoading(false);
      return;
    }

    setHistoryLoading(true);
    const historyRef = ref(fb.db, 'devices/ANVESHAK-ESP32-01/history');

    const unsubscribe = onValue(
      historyRef,
      (snapshot) => {
        setHistoryLoading(false);
        const data = snapshot.val();
        if (data && typeof data === 'object') {
          const list = Object.keys(data)
            .map((key) => normalizeHistoryItem(data[key], key))
            .filter((item) => {
              if (!item || !item.timestamp) return false;
              const t = new Date(item.timestamp).getTime();
              const s = new Date(startDate).getTime();
              const e = new Date(endDate).getTime();
              return t >= s && t <= e;
            });
          setFirebaseLogs(list);
        } else {
          setFirebaseLogs([]);
        }
      },
      (err) => {
        setHistoryLoading(false);
        console.warn('Could not read /devices/ANVESHAK-ESP32-01/history:', err.message);
        setFirebaseLogs([]);
      }
    );

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
      off(historyRef);
    };
  }, [startDate, endDate, authReady, firebaseUser]);

  // Production hardware logs only - strictly no simulated fallbacks
  const logs = useMemo(() => {
    if (firebaseLogs && firebaseLogs.length > 0) {
      return firebaseLogs;
    }
    return [];
  }, [firebaseLogs]);

  // Compute aggregate statistics safely
  const stats = useMemo(() => {
    if (!logs.length) return { maxGas: 0, avgGas: 0, peakG: 0, maxTemp: 0, alertCount: 0 };
    let maxGas = 0;
    let sumGas = 0;
    let validGasCount = 0;
    let peakG = 0;
    let maxTemp = -99;
    let hasValidTemp = false;
    let alertCount = 0;

    logs.forEach((log) => {
      const g = log.mq2?.rawAdc;
      if (typeof g === 'number' && !isNaN(g)) {
        if (g > maxGas) maxGas = g;
        sumGas += g;
        validGasCount += 1;
      }

      const gf = log.mpu6050?.gForce;
      if (typeof gf === 'number' && !isNaN(gf) && gf > peakG) {
        peakG = gf;
      }

      const tc = log.mpu6050?.tempC;
      if (typeof tc === 'number' && !isNaN(tc)) {
        hasValidTemp = true;
        if (tc > maxTemp) maxTemp = tc;
      }

      if (log.alert) alertCount += 1;
    });

    return {
      maxGas,
      avgGas: validGasCount > 0 ? Math.round(sumGas / validGasCount) : 0,
      peakG: peakG.toFixed(2),
      maxTemp: hasValidTemp ? maxTemp.toFixed(1) : '--',
      alertCount,
    };
  }, [logs]);

  // Chart data
  const chartData = useMemo(() => {
    return logs.map((log) => ({
      time: formatDateTime(log.timestamp),
      gasAdc: log.mq2?.rawAdc ?? null,
      ppm: log.mq2?.ppm ?? null,
      accelX: log.mpu6050?.accel?.x ?? null,
      accelY: log.mpu6050?.accel?.y ?? null,
      accelZ: log.mpu6050?.accel?.z ?? null,
      gForce: log.mpu6050?.gForce ?? null,
      gyroX: log.mpu6050?.gyro?.x ?? null,
      gyroY: log.mpu6050?.gyro?.y ?? null,
      gyroZ: log.mpu6050?.gyro?.z ?? null,
      temp: log.mpu6050?.tempC ?? null,
    }));
  }, [logs]);

  // Table filtering and pagination
  const filteredRows = useMemo(() => {
    if (!searchQuery) return logs;
    const q = searchQuery.toLowerCase();
    return logs.filter(
      (l) =>
        l.timestamp.toLowerCase().includes(q) ||
        (l.alert && l.alert.message.toLowerCase().includes(q))
    );
  }, [logs, searchQuery]);

  const totalPages = Math.ceil(filteredRows.length / rowsPerPage) || 1;
  const pagedRows = filteredRows.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  // CSV Export
  const exportToCSV = () => {
    const headers = [
      'Timestamp',
      'MQ2_ADC',
      'MQ2_PPM',
      'Accel_X',
      'Accel_Y',
      'Accel_Z',
      'G_Force',
      'Gyro_X',
      'Gyro_Y',
      'Gyro_Z',
      'Temp_C',
      'Alert_Event',
    ];

    const rows = logs.map((l) => [
      l.timestamp,
      l.mq2?.rawAdc !== null && l.mq2?.rawAdc !== undefined ? l.mq2.rawAdc : '',
      l.mq2?.ppm !== null && l.mq2?.ppm !== undefined ? l.mq2.ppm : '',
      l.mpu6050?.accel?.x !== null && l.mpu6050?.accel?.x !== undefined ? l.mpu6050.accel.x : '',
      l.mpu6050?.accel?.y !== null && l.mpu6050?.accel?.y !== undefined ? l.mpu6050.accel.y : '',
      l.mpu6050?.accel?.z !== null && l.mpu6050?.accel?.z !== undefined ? l.mpu6050.accel.z : '',
      l.mpu6050?.gForce !== null && l.mpu6050?.gForce !== undefined ? l.mpu6050.gForce : '',
      l.mpu6050?.gyro?.x !== null && l.mpu6050?.gyro?.x !== undefined ? l.mpu6050.gyro.x : '',
      l.mpu6050?.gyro?.y !== null && l.mpu6050?.gyro?.y !== undefined ? l.mpu6050.gyro.y : '',
      l.mpu6050?.gyro?.z !== null && l.mpu6050?.gyro?.z !== undefined ? l.mpu6050.gyro.z : '',
      l.mpu6050?.tempC !== null && l.mpu6050?.tempC !== undefined ? l.mpu6050.tempC : '',
      l.alert ? (l.alert.message || l.alert.type || 'ALERT').replace(/,/g, ';') : 'NONE',
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `ANVESHAK_Telemetry_${startDate}_to_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div className="space-y-6">
      
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl lg:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <span>History</span>
            <Badge variant="cyan" size="sm">
              DATA ARCHIVE
            </Badge>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Historical telemetry readings, date filters, and sensor trend analysis.
          </p>
        </div>

        <button
          onClick={exportToCSV}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold transition-colors shadow-sm"
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>Export CSV Dataset</span>
        </button>
      </div>

      {/* Date Filtering Bar */}
      <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs">
            <Calendar className="w-4 h-4 text-cyan-600" />
            <span className="font-bold text-slate-800">Date Range Filtering:</span>
          </div>

          {/* Quick presets */}
          <div className="flex items-center gap-1.5 font-mono text-xs">
            {[
              { id: '1h', label: 'Last 1 Hour' },
              { id: '6h', label: 'Last 6 Hours' },
              { id: '24h', label: 'Last 24 Hours' },
              { id: '7d', label: 'Last 7 Days' },
              { id: 'custom', label: 'Custom' },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => handlePresetSelect(p.id)}
                className={`px-2.5 py-1 rounded transition-colors ${
                  preset === p.id
                    ? 'bg-cyan-50 text-cyan-700 border border-cyan-300 font-bold shadow-sm'
                    : 'bg-slate-50 text-slate-600 border border-slate-200 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Date Pickers */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200 font-mono text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 w-16">Start Date:</span>
            <input
              type="datetime-local"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPreset('custom');
              }}
              className="w-full px-3 py-1.5 rounded-lg bg-slate-50 text-slate-800 border border-slate-300 focus:outline-none focus:border-cyan-500 focus:bg-white"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500 w-16">End Date:</span>
            <input
              type="datetime-local"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPreset('custom');
              }}
              className="w-full px-3 py-1.5 rounded-lg bg-slate-50 text-slate-800 border border-slate-300 focus:outline-none focus:border-cyan-500 focus:bg-white"
            />
          </div>
        </div>
      </div>

      {/* Aggregate Statistics Summary Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 font-mono">
        <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-sm">
          <span className="text-[10px] text-slate-500 block uppercase font-medium">Peak Gas (ADC)</span>
          <span className="text-xl font-bold text-amber-600">{formatADC(stats.maxGas)}</span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Threshold: 2400</span>
        </div>
        <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-sm">
          <span className="text-[10px] text-slate-500 block uppercase font-medium">Avg Gas (ADC)</span>
          <span className="text-xl font-bold text-slate-800">{formatADC(stats.avgGas)}</span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Baseline Clean</span>
        </div>
        <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-sm">
          <span className="text-[10px] text-slate-500 block uppercase font-medium">Peak G-Force</span>
          <span className="text-xl font-bold text-red-600">{stats.peakG} g</span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Impact Vector</span>
        </div>
        <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-sm">
          <span className="text-[10px] text-slate-500 block uppercase font-medium">Max Temp (°C)</span>
          <span className="text-xl font-bold text-cyan-700">{stats.maxTemp} °C</span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Thermal Baseline</span>
        </div>
        <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-sm col-span-2 sm:col-span-1">
          <span className="text-[10px] text-slate-500 block uppercase font-medium">Safety Alerts</span>
          <span className="text-xl font-bold text-purple-700">{stats.alertCount}</span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Recorded Events</span>
        </div>
      </div>

      {/* Metric Selector & Large Time-Series Graph */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-cyan-600" />
            <h2 className="text-sm font-bold text-slate-900">Historical Time-Series Trend</h2>
          </div>

          {/* Metric Selector Tabs */}
          <div className="flex items-center gap-1.5 font-mono text-xs">
            <button
              onClick={() => setActiveMetric('gas')}
              className={`px-3 py-1 rounded transition-colors ${
                activeMetric === 'gas'
                  ? 'bg-cyan-50 text-cyan-700 border border-cyan-300 font-bold shadow-sm'
                  : 'bg-slate-50 text-slate-600 border border-slate-200 hover:text-slate-900'
              }`}
            >
              Gas & Smoke Sensor
            </button>
            <button
              onClick={() => setActiveMetric('accel')}
              className={`px-3 py-1 rounded transition-colors ${
                activeMetric === 'accel'
                  ? 'bg-cyan-50 text-cyan-700 border border-cyan-300 font-bold shadow-sm'
                  : 'bg-slate-50 text-slate-600 border border-slate-200 hover:text-slate-900'
              }`}
            >
              Motion Sensor (G-Force)
            </button>
            <button
              onClick={() => setActiveMetric('gyro')}
              className={`px-3 py-1 rounded transition-colors ${
                activeMetric === 'gyro'
                  ? 'bg-cyan-50 text-cyan-700 border border-cyan-300 font-bold shadow-sm'
                  : 'bg-slate-50 text-slate-600 border border-slate-200 hover:text-slate-900'
              }`}
            >
              Motion Sensor (Gyro)
            </button>
            <button
              onClick={() => setActiveMetric('temp')}
              className={`px-3 py-1 rounded transition-colors ${
                activeMetric === 'temp'
                  ? 'bg-cyan-50 text-cyan-700 border border-cyan-300 font-bold shadow-sm'
                  : 'bg-slate-50 text-slate-600 border border-slate-200 hover:text-slate-900'
              }`}
            >
              Temperature
            </button>
          </div>
        </div>

        {/* Chart View with Brush Range Slider */}
        <div className="h-80 w-full pt-2">
          {logs.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              {activeMetric === 'gas' ? (
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="histGas" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06B6D4" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#06B6D4" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" opacity={0.8} />
                  <XAxis dataKey="time" stroke="#64748B" fontSize={10} tickLine={false} />
                  <YAxis domain={[400, 4095]} stroke="#64748B" fontSize={10} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#CBD5E1', borderRadius: '8px', color: '#0F172A', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                  <Area type="monotone" dataKey="gasAdc" stroke="#06B6D4" strokeWidth={2} fill="url(#histGas)" name="MQ-2 ADC" />
                  <Brush dataKey="time" height={24} stroke="#06B6D4" fill="#F8FAFC" />
                </AreaChart>
              ) : activeMetric === 'accel' ? (
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" opacity={0.8} />
                  <XAxis dataKey="time" stroke="#64748B" fontSize={10} tickLine={false} />
                  <YAxis domain={[-3, 4]} stroke="#64748B" fontSize={10} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#CBD5E1', borderRadius: '8px', color: '#0F172A', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                  <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'monospace' }} />
                  <Line type="monotone" dataKey="accelX" stroke="#EF4444" strokeWidth={1.5} dot={false} name="Accel X (g)" />
                  <Line type="monotone" dataKey="accelY" stroke="#10B981" strokeWidth={1.5} dot={false} name="Accel Y (g)" />
                  <Line type="monotone" dataKey="accelZ" stroke="#0284C7" strokeWidth={1.5} dot={false} name="Accel Z (g)" />
                  <Line type="monotone" dataKey="gForce" stroke="#D97706" strokeWidth={2} dot={false} name="Resultant G-Force" />
                  <Brush dataKey="time" height={24} stroke="#06B6D4" fill="#F8FAFC" />
                </LineChart>
              ) : activeMetric === 'gyro' ? (
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" opacity={0.8} />
                  <XAxis dataKey="time" stroke="#64748B" fontSize={10} tickLine={false} />
                  <YAxis domain={[-150, 150]} stroke="#64748B" fontSize={10} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#CBD5E1', borderRadius: '8px', color: '#0F172A', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                  <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'monospace' }} />
                  <Line type="monotone" dataKey="gyroX" stroke="#D97706" strokeWidth={1.5} dot={false} name="Gyro X (°/s)" />
                  <Line type="monotone" dataKey="gyroY" stroke="#9333EA" strokeWidth={1.5} dot={false} name="Gyro Y (°/s)" />
                  <Line type="monotone" dataKey="gyroZ" stroke="#06B6D4" strokeWidth={1.5} dot={false} name="Gyro Z (°/s)" />
                  <Brush dataKey="time" height={24} stroke="#06B6D4" fill="#F8FAFC" />
                </LineChart>
              ) : (
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="histTemp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" opacity={0.8} />
                  <XAxis dataKey="time" stroke="#64748B" fontSize={10} tickLine={false} />
                  <YAxis domain={[20, 50]} stroke="#64748B" fontSize={10} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#CBD5E1', borderRadius: '8px', color: '#0F172A', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                  <Area type="monotone" dataKey="temp" stroke="#10B981" strokeWidth={2} fill="url(#histTemp)" name="Temperature (°C)" />
                  <Brush dataKey="time" height={24} stroke="#06B6D4" fill="#F8FAFC" />
                </AreaChart>
              )}
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-xs text-slate-500 font-mono space-y-1 bg-slate-50 rounded-xl border border-slate-200">
              <span className="font-bold text-slate-800">Waiting for hardware data — no readings received yet.</span>
              <span className="text-[11px] text-slate-500">Historical telemetry records from /devices/ANVESHAK-ESP32-01/history will display here once logged.</span>
            </div>
          )}
        </div>
      </div>

      {/* Paginated Historical Log Records Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-900">Telemetry Data Points Log</h2>
            <span className="text-xs font-mono text-slate-500">({filteredRows.length} entries)</span>
          </div>

          {/* Search query box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search timestamp / alert..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="pl-8 pr-3 py-1.5 rounded-lg bg-slate-50 text-xs text-slate-800 border border-slate-300 focus:outline-none focus:border-cyan-500 focus:bg-white font-mono w-56"
            />
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 text-[11px] bg-slate-50/50">
                <th className="py-2.5 px-2">TIMESTAMP</th>
                <th className="py-2.5 px-2">GAS & SMOKE (ADC)</th>
                <th className="py-2.5 px-2">EST. PPM</th>
                <th className="py-2.5 px-2">MOTION ACCEL (g)</th>
                <th className="py-2.5 px-2">G-FORCE</th>
                <th className="py-2.5 px-2">TEMP</th>
                <th className="py-2.5 px-2">SAFETY STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagedRows.length > 0 ? (
                pagedRows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 px-2 text-slate-700">{formatDateTime(row.timestamp)}</td>
                    <td className="py-2.5 px-2 font-bold text-cyan-700">{row.mq2?.rawAdc !== null && row.mq2?.rawAdc !== undefined ? row.mq2.rawAdc : '--'}</td>
                    <td className="py-2.5 px-2 text-slate-600">{row.mq2?.ppm !== null && row.mq2?.ppm !== undefined ? row.mq2.ppm : '--'}</td>
                    <td className="py-2.5 px-2 text-slate-500">
                      {row.mpu6050?.accel?.x !== null && row.mpu6050?.accel?.x !== undefined ? `${row.mpu6050.accel.x}, ${row.mpu6050.accel.y}, ${row.mpu6050.accel.z}` : '--'}
                    </td>
                    <td className="py-2.5 px-2 text-slate-800 font-bold">{row.mpu6050?.gForce !== null && row.mpu6050?.gForce !== undefined ? `${row.mpu6050.gForce} g` : '--'}</td>
                    <td className="py-2.5 px-2 text-slate-700">{row.mpu6050?.tempC !== null && row.mpu6050?.tempC !== undefined ? `${row.mpu6050.tempC}°C` : '--'}</td>
                    <td className="py-2.5 px-2">
                      {row.alert ? (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                          {row.alert.type}
                        </span>
                      ) : (
                        <span className="text-[10px] text-emerald-700 font-semibold">NORMAL</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500 font-mono text-xs">
                    {historyLoading ? 'Connecting to historical log database...' : 'Waiting for hardware data — no readings received yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-200 text-xs font-mono">
          <span className="text-slate-500">
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1 rounded bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 shadow-sm disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1 rounded bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 shadow-sm disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

    </div>
  );
};
