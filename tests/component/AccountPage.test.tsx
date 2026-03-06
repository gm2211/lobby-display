import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AccountPage from '../../src/platform/pages/AccountPage';

// ---- Mocks ----

// Mock useAuth
const mockUser = { id: 42, username: 'testuser', role: 'VIEWER' as const };
vi.mock('../../src/contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser }),
}));

// Mock api utility
vi.mock('../../src/utils/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/utils/api')>();
  return {
    ...actual,
    api: {
      get: vi.fn(),
      put: vi.fn(),
      post: vi.fn(),
    },
  };
});

import { api } from '../../src/utils/api';

// ---- Helpers ----

const mockProfile = {
  id: 42,
  username: 'testuser',
  role: 'VIEWER',
  displayName: 'Test User',
  phone: '(555) 000-1234',
  emergencyContact: 'Jane Doe — (555) 999-0000',
  unitNumber: '12B',
  unitFloor: '12',
};

function renderPage() {
  return render(
    <MemoryRouter>
      <AccountPage />
    </MemoryRouter>
  );
}

// ---- Tests ----

describe('AccountPage', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockResolvedValue(mockProfile);
    vi.mocked(api.put).mockResolvedValue({ ok: true });
    vi.mocked(api.post).mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ---- Rendering ----

  it('renders the page title', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Account Settings')).toBeInTheDocument();
    });
  });

  it('renders all four sections', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Profile Information')).toBeInTheDocument();
      // "Change Password" appears as both a heading and a button; use heading role
      expect(screen.getByRole('heading', { name: 'Change Password' })).toBeInTheDocument();
      expect(screen.getByText('Notification Preferences')).toBeInTheDocument();
      expect(screen.getByText('Unit Information')).toBeInTheDocument();
    });
  });

  it('shows loading state initially', () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {})); // never resolves
    renderPage();
    expect(screen.getByText('Loading account information...')).toBeInTheDocument();
  });

  // ---- Profile section ----

  it('loads and displays profile data', async () => {
    renderPage();
    await waitFor(() => {
      const usernameInput = screen.getByLabelText('Username (read-only)') as HTMLInputElement;
      expect(usernameInput.value).toBe('testuser');
      expect(usernameInput.disabled).toBe(true);
    });
    const displayNameInput = screen.getByLabelText('Display Name') as HTMLInputElement;
    expect(displayNameInput.value).toBe('Test User');
    const phoneInput = screen.getByLabelText('Phone Number') as HTMLInputElement;
    expect(phoneInput.value).toBe('(555) 000-1234');
    const emergencyInput = screen.getByLabelText('Emergency Contact') as HTMLInputElement;
    expect(emergencyInput.value).toBe('Jane Doe — (555) 999-0000');
  });

  it('falls back to auth user when profile API fails', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Network error'));
    renderPage();
    await waitFor(() => {
      const usernameInput = screen.getByLabelText('Username (read-only)') as HTMLInputElement;
      expect(usernameInput.value).toBe('testuser');
    });
  });

  it('submits profile form and shows success message', async () => {
    renderPage();
    await waitFor(() => screen.getByLabelText('Display Name'));

    fireEvent.change(screen.getByLabelText('Display Name'), {
      target: { value: 'Updated Name' },
    });

    fireEvent.submit(screen.getAllByRole('button', { name: /save profile/i })[0]);

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/api/platform/profile', expect.objectContaining({
        displayName: 'Updated Name',
      }));
      expect(screen.getByText('Profile updated successfully.')).toBeInTheDocument();
    });
  });

  it('shows error message when profile save fails', async () => {
    const { ApiError } = await import('../../src/utils/api');
    vi.mocked(api.put).mockRejectedValue(new ApiError(500, 'Server error'));
    renderPage();
    await waitFor(() => screen.getByLabelText('Display Name'));

    fireEvent.submit(screen.getAllByRole('button', { name: /save profile/i })[0]);

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument();
    });
  });

  // ---- Password section ----

  it('renders password fields', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByLabelText('Current Password')).toBeInTheDocument();
      expect(screen.getByLabelText('New Password')).toBeInTheDocument();
      expect(screen.getByLabelText('Confirm New Password')).toBeInTheDocument();
    });
  });

  it('validates that current password is required', async () => {
    renderPage();
    await waitFor(() => screen.getByLabelText('Current Password'));

    fireEvent.submit(screen.getByRole('button', { name: /change password/i }));

    await waitFor(() => {
      expect(screen.getByText('Current password is required.')).toBeInTheDocument();
    });
  });

  it('validates new password minimum length', async () => {
    renderPage();
    await waitFor(() => screen.getByLabelText('New Password'));

    fireEvent.change(screen.getByLabelText('Current Password'), {
      target: { value: 'oldpass123' },
    });
    fireEvent.change(screen.getByLabelText('New Password'), {
      target: { value: 'short' },
    });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), {
      target: { value: 'short' },
    });
    fireEvent.submit(screen.getByRole('button', { name: /change password/i }));

    await waitFor(() => {
      expect(screen.getByText('Password must be at least 8 characters.')).toBeInTheDocument();
    });
  });

  it('validates that passwords match', async () => {
    renderPage();
    await waitFor(() => screen.getByLabelText('New Password'));

    fireEvent.change(screen.getByLabelText('Current Password'), {
      target: { value: 'oldpass123' },
    });
    fireEvent.change(screen.getByLabelText('New Password'), {
      target: { value: 'newpassword1' },
    });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), {
      target: { value: 'differentpassword' },
    });
    fireEvent.submit(screen.getByRole('button', { name: /change password/i }));

    await waitFor(() => {
      expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
    });
  });

  it('submits password change and clears form on success', async () => {
    renderPage();
    await waitFor(() => screen.getByLabelText('New Password'));

    const currentInput = screen.getByLabelText('Current Password') as HTMLInputElement;
    const newInput = screen.getByLabelText('New Password') as HTMLInputElement;
    const confirmInput = screen.getByLabelText('Confirm New Password') as HTMLInputElement;

    fireEvent.change(currentInput, { target: { value: 'oldpass123' } });
    fireEvent.change(newInput, { target: { value: 'newpassword1' } });
    fireEvent.change(confirmInput, { target: { value: 'newpassword1' } });
    fireEvent.submit(screen.getByRole('button', { name: /change password/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/platform/change-password', {
        currentPassword: 'oldpass123',
        newPassword: 'newpassword1',
      });
      expect(screen.getByText('Password changed successfully.')).toBeInTheDocument();
    });

    // Form should be cleared
    expect(currentInput.value).toBe('');
    expect(newInput.value).toBe('');
    expect(confirmInput.value).toBe('');
  });

  // ---- Notification preferences ----

  it('renders notification checkboxes', async () => {
    renderPage();
    await waitFor(() => {
      // Each label text appears twice (email + push columns), use getAllByLabelText
      expect(screen.getAllByLabelText('Building events & announcements')).toHaveLength(2);
      expect(screen.getAllByLabelText('Safety advisories & alerts')).toHaveLength(2);
      expect(screen.getAllByLabelText('Maintenance & service updates')).toHaveLength(2);
    });
    // 6 checkboxes total (3 email + 3 push)
    expect(screen.getAllByRole('checkbox')).toHaveLength(6);
  });

  it('toggles notification checkbox', async () => {
    renderPage();
    await waitFor(() => screen.getAllByRole('checkbox'));

    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    // First checkbox (emailEvents) defaults to checked
    expect(checkboxes[0].checked).toBe(true);
    fireEvent.click(checkboxes[0]);
    expect(checkboxes[0].checked).toBe(false);
  });

  it('saves notification preferences on submit', async () => {
    renderPage();
    await waitFor(() => screen.getByRole('button', { name: /save preferences/i }));

    fireEvent.submit(screen.getByRole('button', { name: /save preferences/i }));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/api/platform/notifications', expect.any(Object));
      expect(screen.getByText('Notification preferences saved.')).toBeInTheDocument();
    });
  });

  // ---- Unit information ----

  it('displays unit info from profile', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('12B')).toBeInTheDocument();
      expect(screen.getByText('12')).toBeInTheDocument();
    });
  });

  it('shows dash when unit info is not set', async () => {
    vi.mocked(api.get).mockResolvedValue({
      ...mockProfile,
      unitNumber: '',
      unitFloor: '',
    });
    renderPage();
    await waitFor(() => {
      const dashes = screen.getAllByText('—');
      // Two dashes: unitNumber and unitFloor
      expect(dashes.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('shows unit note about admin management', async () => {
    renderPage();
    await waitFor(() => {
      expect(
        screen.getByText(/Unit information is managed by building administration/i)
      ).toBeInTheDocument();
    });
  });

  it('displays user role in unit info', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('VIEWER')).toBeInTheDocument();
    });
  });
});
