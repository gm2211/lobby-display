/**
 * ImagePicker - Image selection with presets and custom URL/upload support.
 *
 * PURPOSE:
 * Provides a dropdown for selecting from preset images (defined in IMAGE_PRESETS),
 * or allows custom URL entry with optional file upload capability.
 *
 * BEHAVIOR:
 * - "No image" option clears the value
 * - Preset options set the URL directly from IMAGE_PRESETS
 * - "Upload file..." triggers a file picker directly from the dropdown
 * - "Custom URL..." reveals an input field for pasting a URL
 * - File uploads go to /api/upload and return the URL
 *
 * PROPS:
 * - value: Current image URL (empty string = no image)
 * - onChange: Callback when image changes
 * - label: Optional label above the picker
 *
 * GOTCHAS / AI AGENT NOTES:
 * - When adding new presets, update IMAGE_PRESETS in src/constants/status.ts
 * - Uploaded images are stored in public/images/uploads/
 * - The __custom__ and __upload__ values are internal only, never passed to onChange
 *
 * RELATED FILES:
 * - src/constants/status.ts - IMAGE_PRESETS array
 * - server/index.ts - /api/upload endpoint
 */
import { useState, useRef } from 'react';
import type { CSSProperties } from 'react';
import { IMAGE_PRESETS } from '../../constants';
import { api } from '../../utils/api';

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

interface ImagePickerProps {
  /** Current image URL (empty = no image) */
  value: string;
  /** Callback when image selection changes */
  onChange: (url: string) => void;
  /** Optional label displayed above the picker */
  label?: string;
}

export function ImagePicker({ value, onChange, label }: ImagePickerProps) {
  const isPreset = IMAGE_PRESETS.some(p => p.url === value);
  const isCustom = !!value && !isPreset;
  const [showCustom, setShowCustom] = useState(isCustom);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSelect = (v: string) => {
    if (v === '__upload__') {
      fileRef.current?.click();
    } else if (v === '__custom__') {
      setShowCustom(true);
      onChange('');
    } else if (v === '') {
      setShowCustom(false);
      onChange('');
    } else {
      setShowCustom(false);
      onChange(v);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    const data = await api.request<{ url?: string }>('/api/upload', {
      method: 'POST',
      body: fd,
    });
    if (data.url) onChange(data.url);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {label && <span style={{ fontSize: '12px', color: '#888' }}>{label}</span>}
      <div style={{ display: 'flex', gap: '8px', flex: 1 }}>
        <select
          style={inputStyle}
          value={showCustom ? '__custom__' : value}
          onChange={e => handleSelect(e.target.value)}
        >
          <option value="">No image</option>
          {IMAGE_PRESETS.map(p => (
            <option key={p.url} value={p.url}>
              {p.label}
            </option>
          ))}
          <option value="__upload__">Upload file...</option>
          <option value="__custom__">Custom URL...</option>
        </select>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleUpload}
        />
        {showCustom && (
          <input
            style={{ ...inputStyle, flex: 1 }}
            placeholder="https://..."
            value={value}
            onChange={e => onChange(e.target.value)}
          />
        )}
      </div>
    </div>
  );
}
