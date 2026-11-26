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

/**
 * Readable text / tint per status. STATUS_COLORS are the dashboard dot colors;
 * amber and light green are too light for text on white, so text uses darker shades.
 */
const STATUS_TEXT: Record<string, string> = {
  Operational: '#2e7d32',
  Maintenance: '#8a5e00',
  Outage: '#c62828',
};

/** Chevron drawn as an inline SVG so no native select arrow (or iOS chrome) shows */
const CHEVRON = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`;

interface StatusSelectProps {
  /** Current status value */
  value: string;
  /** Callback when user selects a new status */
  onChange: (value: string) => void;
  /** Optional additional styles for the wrapper */
  style?: CSSProperties;
}

/**
 * Pill-shaped status picker: colored dot + status text on a light tint of the
 * status color. Uses a native <select> underneath (keyboard + mobile pickers
 * still work) with appearance reset so it looks the same on iOS and desktop.
 */
export function StatusSelect({ value, onChange, style }: StatusSelectProps) {
  const dot = STATUS_COLORS[value as keyof typeof STATUS_COLORS] || '#999';
  const text = STATUS_TEXT[value] || '#333';
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', ...style }}>
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: '11px',
          width: '8px',
          height: '8px',
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
          appearance: 'none',
          WebkitAppearance: 'none',
          MozAppearance: 'none',
          width: '100%',
          minWidth: '132px',
          padding: '5px 28px 5px 26px',
          borderRadius: '999px',
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor: `${dot}66`,
          backgroundColor: `${dot}14`,
          backgroundImage: CHEVRON,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 10px center',
          color: text,
          fontSize: '13px',
          fontWeight: 600,
          fontFamily: 'inherit',
          lineHeight: 1.4,
          cursor: 'pointer',
        }}
      >
        <option value="Operational">Operational</option>
        <option value="Maintenance">Maintenance</option>
        <option value="Outage">Outage</option>
      </select>
    </span>
  );
}
