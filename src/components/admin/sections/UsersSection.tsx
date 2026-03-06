import { useState, useEffect, useCallback } from 'react';
import type { AuthUser } from '../../../types';
import { api } from '../../../utils/api';
import { useAuth } from '../../../contexts/AuthContext';
import {
  inputStyle, sectionStyle, formGroupStyle, formLabelStyle,
} from '../../../styles';

interface UserWithId extends AuthUser {
  createdAt: string;
}

const ROLE_LEVEL: Record<string, number> = { VIEWER: 0, EDITOR: 1, ADMIN: 2 };

function canManage(actorRole: string, targetRole: string): boolean {
  return (ROLE_LEVEL[actorRole] ?? 0) >= (ROLE_LEVEL[targetRole] ?? 0);
}

function rolesAvailableTo(actorRole: string): string[] {
  const level = ROLE_LEVEL[actorRole] ?? 0;
  return Object.entries(ROLE_LEVEL)
    .filter(([, l]) => l <= level)
    .map(([r]) => r);
}

export function UsersSection() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserWithId[]>([]);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<string>('EDITOR');
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ username: '', password: '', role: '' });

  const load = useCallback(async () => {
    try {
      const data = await api.get<UserWithId[]>('/api/users');
      setUsers(data);
    } catch {
      setUsers([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!currentUser) return null;

  const availableRoles = rolesAvailableTo(currentUser.role);

  const handleCreate = async () => {
    setError('');
    if (!newUsername || !newPassword) {
      setError('Username and password are required');
      return;
    }
    try {
      await api.post('/api/users', { username: newUsername, password: newPassword, role: newRole });
      setNewUsername('');
      setNewPassword('');
      setNewRole('EDITOR');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    }
  };

  const handleDelete = async (id: number, username: string) => {
    if (!confirm(`Delete user "${username}"?`)) return;
    try {
      await api.del(`/api/users/${id}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user');
    }
  };

  const startEdit = (u: UserWithId) => {
    setEditingId(u.id);
    setEditForm({ username: u.username, password: '', role: u.role });
    setError('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ username: '', password: '', role: '' });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setError('');
    const payload: Record<string, string> = {};
    if (editForm.username) payload.username = editForm.username;
    if (editForm.password) payload.password = editForm.password;
    if (editForm.role) payload.role = editForm.role;
    try {
      await api.put(`/api/users/${editingId}`, payload);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user');
    }
  };

  return (
    <section style={sectionStyle}>
      <h2 style={{ margin: '0 0 4px' }}>Users</h2>
      <p style={{ margin: '0 0 12px', color: '#888', fontSize: '13px' }}>Manage admin accounts and roles</p>

      {error && <div style={styles.error}>{error}</div>}

      {/* Existing users */}
      <div style={{ ...formGroupStyle, marginBottom: '16px' }}>
        <span style={formLabelStyle}>Current Users</span>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Username</th>
              <th style={styles.th}>Role</th>
              <th style={{ ...styles.th, width: '140px' }}></th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => {
              const isEditing = editingId === u.id;
              const isSelf = u.id === currentUser.id;
              const canAct = canManage(currentUser.role, u.role) && !isSelf;

              if (isEditing) {
                return (
                  <tr key={u.id}>
                    <td style={styles.td}>
                      <input
                        style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', padding: '4px 8px', fontSize: '13px' }}
                        value={editForm.username}
                        onChange={e => setEditForm({ ...editForm, username: e.target.value })}
                        placeholder="Username"
                      />
                      <input
                        style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', padding: '4px 8px', fontSize: '13px', marginTop: '4px' }}
                        type="password"
                        value={editForm.password}
                        onChange={e => setEditForm({ ...editForm, password: e.target.value })}
                        placeholder="New password (leave blank to keep)"
                      />
                    </td>
                    <td style={styles.td}>
                      <select
                        style={styles.select}
                        value={editForm.role}
                        onChange={e => setEditForm({ ...editForm, role: e.target.value })}
                      >
                        {availableRoles.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td style={styles.td}>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button style={styles.saveBtn} onClick={saveEdit}>Save</button>
                        <button style={styles.cancelBtn} onClick={cancelEdit}>Cancel</button>
                      </div>
                    </td>
                  </tr>
                );
              }

              return (
                <tr key={u.id}>
                  <td style={styles.td}>
                    {u.username}
                    {isSelf && <span style={{ color: '#888', fontSize: '11px', marginLeft: '6px' }}>(you)</span>}
                  </td>
                  <td style={styles.td}>
                    <span style={styles.roleBadge}>{u.role}</span>
                  </td>
                  <td style={styles.td}>
                    {canAct && (
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button style={styles.editBtn} onClick={() => startEdit(u)}>Edit</button>
                        <button style={styles.deleteBtn} onClick={() => handleDelete(u.id, u.username)}>Delete</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add new user */}
      <div style={formGroupStyle}>
        <span style={formLabelStyle}>Add User</span>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <input
            style={{ ...inputStyle, flex: 1, minWidth: '120px' }}
            placeholder="Username"
            value={newUsername}
            onChange={e => setNewUsername(e.target.value)}
          />
          <input
            style={{ ...inputStyle, flex: 1, minWidth: '120px' }}
            type="password"
            placeholder="Password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
          />
          <select
            style={{ ...styles.select, padding: '8px 12px' }}
            value={newRole}
            onChange={e => setNewRole(e.target.value)}
          >
            {availableRoles.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <button style={styles.addBtn} onClick={handleCreate}>Add</button>
        </div>
      </div>
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '8px 12px', color: '#888', fontSize: '12px', textTransform: 'uppercase', borderBottomWidth: '1px', borderBottomStyle: 'solid', borderBottomColor: '#eee' },
  td: { padding: '8px 12px', borderBottomWidth: '1px', borderBottomStyle: 'solid', borderBottomColor: '#f0f0f0', color: '#333', fontSize: '14px', verticalAlign: 'top' },
  roleBadge: {
    display: 'inline-block',
    padding: '2px 10px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 600,
    background: '#f0f0f0',
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  select: {
    background: '#fff',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#ddd',
    borderRadius: '6px',
    color: '#333',
    fontSize: '13px',
    padding: '4px 8px',
  },
  editBtn: {
    background: 'transparent',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'rgba(25,118,210,0.4)',
    borderRadius: '4px',
    color: '#1565c0',
    fontSize: '12px',
    padding: '3px 8px',
    cursor: 'pointer',
  },
  deleteBtn: {
    background: 'transparent',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'rgba(244,67,54,0.4)',
    borderRadius: '4px',
    color: '#c62828',
    fontSize: '12px',
    padding: '3px 8px',
    cursor: 'pointer',
  },
  saveBtn: {
    background: '#1565c0',
    borderWidth: '0px',
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: '4px',
    color: '#fff',
    fontSize: '12px',
    padding: '3px 8px',
    cursor: 'pointer',
    fontWeight: 600,
  },
  cancelBtn: {
    background: 'transparent',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#ccc',
    borderRadius: '4px',
    color: '#666',
    fontSize: '12px',
    padding: '3px 8px',
    cursor: 'pointer',
  },
  addBtn: {
    background: '#1a5c5a',
    borderWidth: '0px',
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '13px',
    fontWeight: 600,
    padding: '9px 16px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  error: {
    padding: '10px',
    background: '#fff5f5',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#ffcdd2',
    borderRadius: '6px',
    color: '#c62828',
    fontSize: '13px',
    marginBottom: '12px',
  },
};
