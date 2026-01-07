'use client';

import { AreaChart, Area, ResponsiveContainer } from 'recharts';

export interface DeviceCardData {
  id: string;
  name: string;
  currentW: number;
  avgW60m: number;
  maxW60m: number;
  energy60m: number;
  energy24h: number;
  energyCurrentMonth: number;
  energyLastMonth: number;
  hourData: { timestamp: string; power: number; energy: number }[];
  dayData: { timestamp: string; power: number; energy: number }[];
  monthData: { timestamp: string; power: number; energy: number }[];
}

interface DeviceSummaryCardProps {
  data: DeviceCardData;
  isTotal?: boolean;
}

function fmtEnergy(wh: number, missing: boolean): string {
  if (missing) return '-';
  if (wh >= 1000) return `${(wh / 1000).toFixed(1)}kWh`;
  return `${Math.round(wh)}Wh`;
}

function fmtW(w: number): string {
  if (w >= 1000) return `${(w / 1000).toFixed(1)}kW`;
  return `${w.toFixed(1)}W`;
}

export function DeviceSummaryCard({ data, isTotal = false }: DeviceSummaryCardProps) {
  const chartData = data.hourData.map((d) => ({ v: d.power }));

  return (
    <div className={`bg-gray-900 rounded-xl p-3 flex items-center gap-3 ${isTotal ? 'ring-1 ring-yellow-500/30' : ''}`}>
      {/* Name + Current W */}
      <div className="w-28 flex-shrink-0">
        <div className={`text-lg font-medium truncate ${isTotal ? 'text-yellow-400' : 'text-gray-300'}`}>
          {data.name}
        </div>
        <div className={`text-3xl font-bold font-mono ${isTotal ? 'text-yellow-400' : 'text-green-400'}`}>
          {fmtW(data.currentW)}
        </div>
      </div>

      {/* Mini sparkline - fills middle space */}
      <div className="flex-1 h-14 min-w-0">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
              <defs>
                <linearGradient id={`grad-${data.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="v" stroke="#3b82f6" strokeWidth={1.5} fill={`url(#grad-${data.id})`} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-600 text-sm">-</div>
        )}
      </div>

      {/* Stats row */}
      <div className="flex gap-3 text-base font-mono flex-shrink-0">
        <div className="text-center w-16">
          <div className="text-gray-500 text-sm">60m</div>
          <div className="text-gray-300">{fmtEnergy(data.energy60m, false)}</div>
        </div>
        <div className="text-center w-16">
          <div className="text-gray-500 text-sm">24h</div>
          <div className="text-gray-300">{fmtEnergy(data.energy24h, false)}</div>
        </div>
        <div className="text-center w-16">
          <div className="text-gray-500 text-sm">Month</div>
          <div className={data.energyCurrentMonth > 0 ? 'text-gray-300' : 'text-gray-600'}>
            {fmtEnergy(data.energyCurrentMonth, data.energyCurrentMonth === 0)}
          </div>
        </div>
        <div className="text-center w-16">
          <div className="text-gray-500 text-sm">Last Mo</div>
          <div className={data.energyLastMonth > 0 ? 'text-gray-300' : 'text-gray-600'}>
            {fmtEnergy(data.energyLastMonth, data.energyLastMonth === 0)}
          </div>
        </div>
      </div>
    </div>
  );
}
