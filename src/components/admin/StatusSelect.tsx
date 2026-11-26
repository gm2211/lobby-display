/**
 * StatusSelect - Dropdown for selecting service operational status.
 *
 * PURPOSE:
 * Provides a styled select dropdown for choosing between Operational,
 * Maintenance, and Outage states. Each option is color-coded to match
 * the status colors used throughout the dashboard.
 *
 * PROPS:
 * - value: Current status value
 * - onChange: Callback when status changes
 * - style: Optional additional styles to merge
 *
 * USAGE:
 * ```tsx
 * <StatusSelect
 *   value={service.status}
 *   onChange={(newStatus) => updateService(service.id, { status: newStatus })}
 * />
 * ```
 *
 * RELATED FILES:
 * - src/constants/status.ts - STATUS_COLORS mapping
 * - src/components/admin/sections/ServicesSection.tsx - Primary consumer
 */
import type { CSSProperties } from 'react';
import { STATUS_COLORS } from '../../constants';
import { ChevronDown } from 'lucide-react';
import { smallBtn, smallBtnInfo, actionBarButtonStyle } from '../../styles';

/** Chevron drawn as an inline SVG so no native select arrow (or iOS chrome) shows */
const CHEVRON = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`;

interface StatusSelectProps {
  /** Current status value */
  value: string;
  /** Callback when user selects a new status */
  onChange: (value: string) => void;
  /** Optional additional styles for the wrapper */
  style?: CSSProperties;
  /**
   * "pill" (default): small outlined button. "bar": fills a cell of a card's
   * action bar (actionBarButtonStyle); the native select is laid invisibly
   * over the whole cell so the full 44px target opens the picker.
   */
  variant?: 'pill' | 'bar';
}

/**
 * Status picker styled exactly like the admin's small outlined buttons
 * (smallBtn + smallBtnInfo, e.g. the Events "Preview" button). The status
 * colour is only a small dot; text stays neutral. Native <select> underneath
 * (keyboard + mobile pickers still work) with appearance reset for iOS.
 */
export function StatusSelect({ value, onChange, style, variant = 'pill' }: StatusSelectProps) {
  const dot = STATUS_COLORS[value as keyof typeof STATUS_COLORS] || '#999';
  if (variant === 'bar') {
    return (
      <span style={{ ...actionBarButtonStyle, position: 'relative', ...style }}>
        <span aria-hidden="true" style={{ width: '8px', height: '8px', borderRadius: '50%', background: dot, flexShrink: 0 }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>
        <ChevronDown size={14} aria-hidden="true" style={{ flexShrink: 0, color: '#888' }} />
        <select
          aria-label="Status"
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', fontSize: '16px' }}
        >
          <option value="Operational">Operational</option>
          <option value="Maintenance">Maintenance</option>
          <option value="Outage">Outage</option>
        </select>
      </span>
    );
  }
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', ...style }}>
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: '9px',
          width: '7px',
          height: '7px',
          borderRadius: '50%',
          background: dot,
          pointerEvents: 'none',
        }}
      />
      <select
        aria-label="Status"
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          ...smallBtn,
          ...smallBtnInfo,
          color: '#444',
          marginLeft: 0,
          width: '100%',
          appearance: 'none',
          WebkitAppearance: 'none',
          MozAppearance: 'none',
          padding: '4px 24px 4px 21px',
          backgroundImage: CHEVRON,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 8px center',
          fontFamily: 'inherit',
          lineHeight: 'normal',
        }}
      >
        <option value="Operational">Operational</option>
        <option value="Maintenance">Maintenance</option>
        <option value="Outage">Outage</option>
      </select>
    </span>
  );
}
