'use client';

import { Period } from '@/lib/api';

interface PeriodSelectorProps {
  selected: Period;
  onChange: (period: Period) => void;
}

const periods: { value: Period; label: string }[] = [
  { value: 'hour', label: 'Hour' },
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: '6months', label: '6 Months' },
];

export function PeriodSelector({ selected, onChange }: PeriodSelectorProps) {
  return (
    <div className="flex gap-2">
      {periods.map((period) => (
        <button
          key={period.value}
          onClick={() => onChange(period.value)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            selected === period.value
              ? 'bg-blue-500 text-white'
              : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
          }`}
        >
          {period.label}
        </button>
      ))}
    </div>
  );
}
