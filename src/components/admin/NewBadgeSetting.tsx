/**
 * NewBadgeSetting - Controls when event cards show the "NEW" badge on the dashboard.
 * Lives under the Events section. Saves to BuildingConfig (newBadgeMode/newBadgeDays),
 * which goes live on the next publish like every other setting.
 *
 * RELATED FILES:
 * - shared/newBadge.ts - Badge rules shared with the dashboard
 * - src/components/EventCard.tsx - Renders the badge
 */
import { useEffect, useState } from 'react';
import type { BuildingConfig } from '../../types';
import { api } from '../../utils/api';
import { NEW_BADGE_DEFAULTS, NEW_BADGE_MODES } from '../../../shared/newBadge';
import { inputStyle } from '../../styles';

interface Props {
  config: BuildingConfig | null;
  onSave: (optimistic?: Record<string, unknown>) => void;
}

export function NewBadgeSetting({ config, onSave }: Props) {
  const mode = config?.newBadgeMode || NEW_BADGE_DEFAULTS.mode;
  const days = config?.newBadgeDays ?? NEW_BADGE_DEFAULTS.days;
  const [localDays, setLocalDays] = useState(String(days));

  useEffect(() => { setLocalDays(String(days)); }, [days]);

  const save = (patch: { newBadgeMode?: string; newBadgeDays?: number }) => {
    api.put('/api/config', patch);
    onSave({ config: config ? { ...config, ...patch } : null });
  };

  const commitDays = () => {
    const n = parseInt(localDays, 10);
    if (Number.isInteger(n) && n >= 1 && n <= 365) {
      if (n !== days) save({ newBadgeDays: n });
    } else {
      setLocalDays(String(days));
    }
  };

  return (
    <div style={styles.row} data-testid="new-badge-setting">
      <span style={styles.label}>Show “NEW” badge</span>
      <select
        aria-label="NEW badge mode"
        style={{ ...inputStyle, padding: '4px 8px', fontSize: '13px' }}
        value={mode}
        onChange={e => save({ newBadgeMode: e.target.value })}
      >
        {NEW_BADGE_MODES.map(m => (
          <option key={m.value} value={m.value}>{m.label}</option>
        ))}
      </select>
      {mode === 'days' && (
        <label style={styles.days}>
          <input
            aria-label="NEW badge days"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={localDays}
            onChange={e => { if (e.target.value === '' || /^\d+$/.test(e.target.value)) setLocalDays(e.target.value); }}
            onBlur={commitDays}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            style={{ ...inputStyle, width: '48px', padding: '4px 6px', fontSize: '13px', textAlign: 'center' }}
          />
          days
        </label>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  row: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginTop: '12px', fontSize: '13px', color: '#666' },
  label: { fontWeight: 600 },
  days: { display: 'inline-flex', alignItems: 'center', gap: '6px' },
};
