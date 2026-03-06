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

/** Input style matching the admin light theme */
const inputStyle: CSSProperties = {
  background: '#fff',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: '#ddd',
  borderRadius: '6px',
  padding: '8px 12px',
  color: '#333',
  fontSize: '14px',
};

interface StatusSelectProps {
  /** Current status value */
  value: string;
  /** Callback when user selects a new status */
  onChange: (value: string) => void;
  /** Optional additional styles */
  style?: CSSProperties;
}

export function StatusSelect({ value, onChange, style }: StatusSelectProps) {
  return (
    <select
      style={{
        ...inputStyle,
        color: STATUS_COLORS[value] || '#333',
        fontWeight: 600,
        ...style,
      }}
      value={value}
      onChange={e => onChange(e.target.value)}
    >
      <option value="Operational" style={{ color: STATUS_COLORS.Operational }}>
        Operational
      </option>
      <option value="Maintenance" style={{ color: STATUS_COLORS.Maintenance }}>
        Maintenance
      </option>
      <option value="Outage" style={{ color: STATUS_COLORS.Outage }}>
        Outage
      </option>
    </select>
  );
}
