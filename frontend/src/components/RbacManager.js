import React, { useEffect, useMemo, useState } from 'react';
import { apiClient } from '../utils/apiClient';
import { API_BASE_URL } from '../config';
import { usePermissions } from '../context/PermissionsContext';

// Component for creating a new role
const CreateRoleForm = ({ onCreateRole, isCreating }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (name.trim()) {
      onCreateRole(name.trim(), description.trim());
      setName('');
      setDescription('');
    }
  };

  return (
    <div style={{ marginBottom: '16px', padding: '12px', border: '1px solid #ddd', borderRadius: '4px' }}>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Role name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ width: '100%', marginBottom: '8px', padding: '8px' }}
          required
        />
        <input
          type="text"
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={{ width: '100%', marginBottom: '8px', padding: '8px' }}
        />
        <button 
          type="submit" 
          className="btn btn-primary"
          disabled={isCreating || !name.trim()}
        >
          {isCreating ? 'Creating...' : 'Create role'}
        </button>
      </form>
    </div>
  );
};

// Component for displaying a role
const RoleItem = ({ role, onSelect, onRename, onToggleActive, onDelete, isSelected, isRenaming, isToggling }) => {
  const [newName, setNewName] = useState(role.name);

  const handleRename = () => {
    if (newName.trim() && newName !== role.name) {
      onRename(role.id, newName.trim());
    }
  };

  const getRoleStatus = () => {
    const badges = [];
    if (role.is_system) badges.push('system');
    if (!role.is_active) badges.push('inactive');
    return badges.length > 0 ? ` (${badges.join(', ')})` : '';
  };

  return (
    <div style={{ 
      padding: '8px', 
      border: '1px solid #eee', 
      borderRadius: '4px', 
      marginBottom: '4px',
      backgroundColor: isSelected ? '#f0f8ff' : 'white',
      cursor: 'pointer'
    }}>
      <div onClick={() => onSelect(role.id)} style={{ marginBottom: '8px' }}>
        {isRenaming ? (
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={handleRename}
            onKeyPress={(e) => e.key === 'Enter' && handleRename()}
            style={{ padding: '4px', width: '100%' }}
            autoFocus
          />
        ) : (
          <strong>{role.name}{getRoleStatus()}</strong>
        )}
      </div>
      
      {!role.is_system && (
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          <button 
            className="btn"
            onClick={() => onRename(role.id, role.name)}
            disabled={isRenaming}
            style={{ fontSize: '12px', padding: '4px 8px' }}
          >
            Rename
          </button>
          <button 
            className="btn"
            onClick={() => onToggleActive(role)}
            disabled={isToggling}
            style={{ fontSize: '12px', padding: '4px 8px' }}
          >
            {role.is_active ? 'Deactivate' : 'Activate'}
          </button>
          <button 
            className="delete-btn"
            onClick={() => onDelete(role.id)}
            style={{ fontSize: '12px', padding: '4px 8px' }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
};

const RbacManager = () => {
  const { has } = usePermissions();
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [selectedRoleId, setSelectedRoleId] = useState(null);
  const [rolePerms, setRolePerms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [togglingActiveId, setTogglingActiveId] = useState(null);
  const [rbacLogs, setRbacLogs] = useState([]);

  const canManageRoles = has('rbac.roles.manage');
  const canManagePerms = has('rbac.permissions.manage');

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        if (canManagePerms) {
          const p = await apiClient(`${API_BASE_URL}/rbac/permissions`);
          const pdata = await p.json();
          setPermissions(pdata.data || []);
        }
        if (canManageRoles) {
          const r = await apiClient(`${API_BASE_URL}/rbac/roles`);
          const rdata = await r.json();
          setRoles(rdata.data || []);
        }
      } catch (e) {
        setError('Failed to load RBAC data');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [canManagePerms, canManageRoles]);

  useEffect(() => {
    const loadLogs = async () => {
      if (!canManageRoles) return;
      try {
        const res = await apiClient(`${API_BASE_URL}/dashboard/rbac-logs`);
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) setRbacLogs(data.data);
      } catch (e) {
        // ignore
      }
    };
    loadLogs();
  }, [canManageRoles]);

  const selectedRole = useMemo(() => roles.find(r => r.id === selectedRoleId) || null, [roles, selectedRoleId]);

  useEffect(() => {
    const loadRolePerms = async () => {
      if (!selectedRoleId || !canManagePerms) return;
      try {
        const res = await apiClient(`${API_BASE_URL}/rbac/roles/${selectedRoleId}/permissions`);
        const data = await res.json();
        setRolePerms(data.data || []);
      } catch (e) {
        setRolePerms([]);
      }
    };
    loadRolePerms();
  }, [selectedRoleId, canManagePerms]);

  const togglePermission = (key) => {
    if (!canManagePerms) return;
    setRolePerms(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const saveRolePerms = async () => {
    if (!canManagePerms || !selectedRoleId) return;
    try {
      const res = await apiClient(`${API_BASE_URL}/rbac/roles/${selectedRoleId}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({ permissions: rolePerms })
      });
      if (!res.ok) throw new Error('Failed to save permissions');
    } catch (e) {
      setError('Failed to save permissions');
    }
  };

  const handleCreateRole = async (name, description) => {
    if (!canManageRoles) return;
    try {
      setCreating(true);
      setError('');
      const res = await apiClient(`${API_BASE_URL}/rbac/roles`, {
        method: 'POST',
        body: JSON.stringify({ name, description })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setRoles(prev => [...prev, { id: data.id, name, description, is_active: 1, is_system: 0 }]);
      } else {
        setError(data.message || 'Error creating role');
      }
    } catch (e) {
      setError('Error creating role');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteRole = async (roleId) => {
    if (!canManageRoles || !window.confirm('Are you sure you want to delete this role?')) return;
    try {
      const res = await apiClient(`${API_BASE_URL}/rbac/roles/${roleId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
      setRoles(prev => prev.filter(r => r.id !== roleId));
      if (selectedRoleId === roleId) {
        setSelectedRoleId(null);
        setRolePerms([]);
      }
    } catch (e) {
      setError('Error deleting role');
    }
  };

  const handleRenameRole = async (roleId, newName) => {
    if (!canManageRoles || !newName.trim()) return;
    try {
      setRenamingId(roleId);
      const res = await apiClient(`${API_BASE_URL}/rbac/roles/${roleId}`, {
        method: 'PUT',
        body: JSON.stringify({ name: newName })
      });
      if (!res.ok) throw new Error('Failed');
      setRoles(prev => prev.map(r => r.id === roleId ? { ...r, name: newName } : r));
    } catch (e) {
      setError('Error renaming role');
    } finally {
      setRenamingId(null);
    }
  };

  const handleToggleActive = async (role) => {
    if (!canManageRoles) return;
    try {
      setTogglingActiveId(role.id);
      const res = await apiClient(`${API_BASE_URL}/rbac/roles/${role.id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_active: role.is_active ? 0 : 1 })
      });
      if (!res.ok) throw new Error('Failed');
      setRoles(prev => prev.map(r => r.id === role.id ? { ...r, is_active: role.is_active ? 0 : 1 } : r));
    } catch (e) {
      setError('Error changing role status');
    } finally {
      setTogglingActiveId(null);
    }
  };

  if (!canManageRoles && !canManagePerms) {
    return (
      <div style={{ padding: '16px', textAlign: 'center' }}>
        <p>You do not have permission to manage roles or permissions.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: '16px', textAlign: 'center' }}>
        <p>Завантаження RBAC...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px', maxWidth: '1200px', margin: '0 auto' }}>
      {error && (
        <div style={{ 
          color: '#d32f2f', 
          backgroundColor: '#ffebee', 
          padding: '12px', 
          borderRadius: '4px', 
          marginBottom: '16px',
          border: '1px solid #ffcdd2'
        }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', minHeight: '500px' }}>
        {/* Roles section */}
        <div>
          <h3 style={{ marginBottom: '16px', color: '#1976d2' }}>Roles</h3>
          {canManageRoles && (
            <CreateRoleForm onCreateRole={handleCreateRole} isCreating={creating} />
          )}
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {roles.map(role => (
              <RoleItem
                key={role.id}
                role={role}
                onSelect={setSelectedRoleId}
                onRename={handleRenameRole}
                onToggleActive={handleToggleActive}
                onDelete={handleDeleteRole}
                isSelected={role.id === selectedRoleId}
                isRenaming={renamingId === role.id}
                isToggling={togglingActiveId === role.id}
              />
            ))}
          </div>
        </div>

        {/* Permissions section */}
        <div>
          <h3 style={{ marginBottom: '16px', color: '#1976d2' }}>Permissions</h3>
          {!selectedRole ? (
            <div style={{ 
              padding: '20px', 
              textAlign: 'center', 
              color: '#666',
              border: '2px dashed #ddd',
              borderRadius: '4px'
            }}>
              Select a role to edit permissions
            </div>
          ) : (
            <div>
              <div style={{ 
                marginBottom: '12px', 
                padding: '8px', 
                backgroundColor: '#f5f5f5', 
                borderRadius: '4px' 
              }}>
                Editing permissions for: <strong>{selectedRole.name}</strong>
              </div>
              <div style={{ 
                maxHeight: '300px', 
                overflowY: 'auto', 
                border: '1px solid #ddd', 
                borderRadius: '4px',
                padding: '8px'
              }}>
                {permissions.map(p => (
                  <label key={p.key} style={{ 
                    display: 'flex', 
                    alignItems: 'flex-start', 
                    gap: '8px', 
                    padding: '6px 0',
                    borderBottom: '1px solid #f0f0f0'
                  }}>
                    <input
                      type="checkbox"
                      checked={rolePerms.includes(p.key)}
                      onChange={() => togglePermission(p.key)}
                      disabled={!canManagePerms}
                      style={{ marginTop: '2px' }}
                    />
                    <div>
                      <code style={{ 
                        fontSize: '12px', 
                        backgroundColor: '#f8f8f8', 
                        padding: '2px 4px',
                        borderRadius: '2px'
                      }}>
                        {p.key}
                      </code>
                      <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
                        {p.description}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
              {canManagePerms && (
                <button 
                  className="btn btn-primary" 
                  onClick={saveRolePerms}
                  style={{ marginTop: '12px', width: '100%' }}
                >
                  Save permissions
                </button>
              )}
            </div>
          )}
        </div>

        {/* Audit log section */}
        <div>
          <h3 style={{ marginBottom: '16px', color: '#1976d2' }}>Audit log</h3>
          {!canManageRoles ? (
            <div style={{ 
              padding: '20px', 
              textAlign: 'center', 
              color: '#666',
              border: '2px dashed #ddd',
              borderRadius: '4px'
            }}>
              You do not have permission to view the audit log
            </div>
          ) : (
            <div style={{ 
              maxHeight: '400px', 
              overflowY: 'auto', 
              border: '1px solid #ddd', 
              borderRadius: '4px',
              padding: '8px'
            }}>
              {rbacLogs.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#666' }}>
                  No recent RBAC events
                </p>
              ) : (
                rbacLogs.map((log, idx) => (
                  <div key={idx} style={{ 
                    borderBottom: '1px solid #f0f0f0', 
                    padding: '8px 0',
                    fontSize: '12px'
                  }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                      {log.action}
                    </div>
                    <div style={{ color: '#666', marginBottom: '4px' }}>
                      {log.actor_full_name || log.actor_username} • {new Date(log.created_at).toLocaleString()}
                    </div>
                    {log.details && Object.keys(log.details).length > 0 && (
                      <pre style={{ 
                        background: '#f8f8f8', 
                        padding: '4px', 
                        borderRadius: '2px', 
                        fontSize: '10px',
                        overflow: 'auto'
                      }}>
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RbacManager;


