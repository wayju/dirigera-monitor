import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PeriodSelector } from './PeriodSelector';

describe('PeriodSelector', () => {
  it('renders all period options', () => {
    render(<PeriodSelector selected="day" onChange={() => {}} />);

    expect(screen.getByText('Hour')).toBeInTheDocument();
    expect(screen.getByText('Day')).toBeInTheDocument();
    expect(screen.getByText('Week')).toBeInTheDocument();
    expect(screen.getByText('Month')).toBeInTheDocument();
    expect(screen.getByText('6 Months')).toBeInTheDocument();
  });

  it('highlights the selected period', () => {
    render(<PeriodSelector selected="week" onChange={() => {}} />);

    const weekButton = screen.getByText('Week');
    expect(weekButton).toHaveClass('bg-blue-500');
  });

  it('calls onChange when a period is clicked', () => {
    const onChange = vi.fn();
    render(<PeriodSelector selected="day" onChange={onChange} />);

    fireEvent.click(screen.getByText('Month'));

    expect(onChange).toHaveBeenCalledWith('month');
  });
});
