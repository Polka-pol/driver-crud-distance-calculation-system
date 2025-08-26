import React, { useState, useEffect } from 'react';
import { apiClient } from '../utils/apiClient';
import { API_BASE_URL } from '../config';
import './AdminPanel.css';
import './SessionManagement.css';
import UserModal from './UserModal';
import { useAuth } from '../context/HybridAuthContext';

const SessionManagement = () => {
    const { user: currentUser } = useAuth();
    const [users, setUsers] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const [sortBy, setSortBy] = useState('email');
    const [sortOrder, setSortOrder] = useState('asc');
    
    // User Management states
    const [isUserModalOpen, setIsUserModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [userActionLoading, setUserActionLoading] = useState({});
    const [passwordResetLoading, setPasswordResetLoading] = useState({});

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            setIsLoading(true);
            
            const response = await apiClient(`${API_BASE_URL}/admin/users`);
            
            if (!response.ok) {
                throw new Error('Failed to fetch users');
            }
            
            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.message || 'Failed to fetch users');
            }
            
            setUsers(data.users || []);
            setError(null);
        } catch (err) {
            console.error('Error fetching users:', err);
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const getRoleBadgeClass = (role) => {
        switch (role) {
            case 'admin': return 'admin-role-badge admin';
            case 'manager': return 'admin-role-badge manager';
            case 'dispatcher': return 'admin-role-badge dispatcher';
            default: return 'admin-role-badge';
        }
    };

    const filteredAndSortedUsers = () => {
        if (!users) return [];
        
        let filtered = [...users];
        
        // Sort
        filtered.sort((a, b) => {
            let aVal, bVal;
            
            switch (sortBy) {
                case 'email':
                    aVal = a.email?.toLowerCase() || '';
                    bVal = b.email?.toLowerCase() || '';
                    break;
                case 'created_at':
                    aVal = new Date(a.created_at).getTime();
                    bVal = new Date(b.created_at).getTime();
                    break;
                default:
                    return 0;
            }
            
            if (sortOrder === 'asc') {
                return aVal > bVal ? 1 : -1;
            } else {
                return aVal < bVal ? 1 : -1;
            }
        });
        
        return filtered;
    };

    const handleSort = (field) => {
        if (sortBy === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(field);
            setSortOrder('desc');
        }
    };


    const handleChangePassword = async (userId, email) => {
        const newPassword = prompt(`Enter new password for ${email}:`);
        if (!newPassword || newPassword.length < 6) {
            alert('Password must be at least 6 characters long');
            return;
        }

        setPasswordResetLoading(prev => ({ ...prev, [userId]: true }));

        try {
            const response = await apiClient(`${API_BASE_URL}/admin/users/${userId}/password`, {
                method: 'PUT',
                body: JSON.stringify({ password: newPassword })
            });

            if (!response.ok) {
                throw new Error('Failed to change password');
            }

            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.message || 'Failed to change password');
            }

            alert(`Password changed successfully for ${email}`);
        } catch (err) {
            console.error('Error changing password:', err);
            alert(`Error changing password: ${err.message}`);
        } finally {
            setPasswordResetLoading(prev => ({ ...prev, [userId]: false }));
        }
    };

    // User Management functions
    const handleAddUser = () => {
        setEditingUser(null);
        setIsUserModalOpen(true);
    };

    const handleEditUser = (user) => {
        setEditingUser(user);
        setIsUserModalOpen(true);
    };

    const handleSaveUser = async (userData, userId) => {
        try {
            let response;
            
            if (userId) {
                // Update user
                response = await apiClient(`${API_BASE_URL}/admin/users/${userId}`, {
                    method: 'PUT',
                    body: JSON.stringify(userData)
                });
            } else {
                // Create user
                response = await apiClient(`${API_BASE_URL}/admin/users`, {
                    method: 'POST',
                    body: JSON.stringify(userData)
                });
            }

            if (!response.ok) {
                throw new Error('Failed to save user');
            }

            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.message || 'Failed to save user');
            }

            setIsUserModalOpen(false);
            await fetchUsers();
            alert(`User ${userId ? 'updated' : 'created'} successfully!`);
        } catch (err) {
            console.error("Failed to save user:", err);
            alert(`Error saving user: ${err.message}`);
        }
    };

    const handleDeleteUser = async (userId, email) => {
        if (userId === currentUser?.id) {
            alert('You cannot delete yourself!');
            return;
        }

        if (!window.confirm(`Are you sure you want to delete user "${email}"?`)) {
            return;
        }

        setUserActionLoading(prev => ({ ...prev, [userId]: true }));

        try {
            const response = await apiClient(`${API_BASE_URL}/admin/users/${userId}`, {
                method: 'DELETE'
            });
            
            if (!response.ok) {
                throw new Error('Failed to delete user');
            }

            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.message || 'Failed to delete user');
            }
            
            await fetchUsers();
            alert(`User "${email}" deleted successfully!`);
        } catch (err) {
            console.error("Failed to delete user:", err);
            alert(`Error deleting user: ${err.message}`);
        } finally {
            setUserActionLoading(prev => ({ ...prev, [userId]: false }));
        }
    };

    if (isLoading) return <div className="session-management-container"><p>Loading users...</p></div>;
    if (error) return <div className="session-management-container"><p className="error-message">Error: {error}</p></div>;

    const filteredUsers = filteredAndSortedUsers();

    return (
        <div className="admin-container">
            <UserModal 
                isOpen={isUserModalOpen}
                onClose={() => setIsUserModalOpen(false)}
                onSave={handleSaveUser}
                user={editingUser}
            />
            <div className="admin-header">
                <h3>User Management</h3>
                <div className="admin-header-actions">
                    <button onClick={handleAddUser} className="admin-btn primary">
                        👤 Add User
                    </button>
                    <button onClick={fetchUsers} className="admin-btn" disabled={isLoading}>
                        🔄 Refresh
                    </button>
                </div>
            </div>

            {/* User Statistics */}
            <div className="admin-stats">
                <div className="admin-stat-card primary">
                    <h4>Total Users</h4>
                    <p>{users.length}</p>
                </div>
                <div className="admin-stat-card secondary">
                    <h4>Confirmed Users</h4>
                    <p>{users.filter(u => u.email_confirmed_at).length}</p>
                </div>
                <div className="admin-stat-card info">
                    <h4>Recent Users</h4>
                    <p>{users.filter(u => new Date(u.created_at) > new Date(Date.now() - 7*24*60*60*1000)).length}</p>
                </div>
            </div>

            {/* Users Table */}
            <div className="admin-table-container">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th onClick={() => handleSort('email')} className="sortable">
                                Email {sortBy === 'email' && (sortOrder === 'asc' ? '↑' : '↓')}
                            </th>
                            <th>Full Name</th>
                            <th>Username</th>
                            <th>Role</th>
                            <th>Mobile</th>
                            <th onClick={() => handleSort('created_at')} className="sortable">
                                Created {sortBy === 'created_at' && (sortOrder === 'asc' ? '↑' : '↓')}
                            </th>
                            <th>Status</th>
                            <th>Edit</th>
                            <th>Password</th>
                            <th>Delete</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredUsers.map((user) => (
                            <tr key={user.id}>
                                <td className="email">{user.email}</td>
                                <td>{user.user_metadata?.full_name || '-'}</td>
                                <td>{user.user_metadata?.username || '-'}</td>
                                <td>
                                    <span className={getRoleBadgeClass(user.user_metadata?.role)}>
                                        {user.user_metadata?.role || 'dispatcher'}
                                    </span>
                                </td>
                                <td>{user.user_metadata?.mobile_number || '-'}</td>
                                <td>{new Date(user.created_at).toLocaleDateString()}</td>
                                <td>
                                    <span className={user.email_confirmed_at ? 'session-status-badge active' : 'session-status-badge offline'}>
                                        {user.email_confirmed_at ? 'Confirmed' : 'Pending'}
                                    </span>
                                </td>
                                <td className="actions">
                                    <button
                                        className="edit-user-btn"
                                        onClick={() => handleEditUser({
                                            id: user.id,
                                            email: user.email,
                                            username: user.user_metadata?.username,
                                            full_name: user.user_metadata?.full_name,
                                            mobile_number: user.user_metadata?.mobile_number,
                                            role: user.user_metadata?.role || 'dispatcher'
                                        })}
                                        title={`Edit ${user.email}`}
                                    >
                                        ✏️
                                    </button>
                                </td>
                                <td className="actions">
                                    <button
                                        className="admin-btn secondary"
                                        onClick={() => handleChangePassword(user.id, user.email)}
                                        disabled={passwordResetLoading[user.id]}
                                        title={`Change password for ${user.email}`}
                                    >
                                        {passwordResetLoading[user.id] ? '⏳' : '🔑'}
                                    </button>
                                </td>
                                <td className="actions">
                                    {user.id === currentUser?.id ? (
                                        <span className="no-action" title="Cannot delete yourself">🔒</span>
                                    ) : (
                                        <button
                                            className="delete-user-btn"
                                            onClick={() => handleDeleteUser(user.id, user.email)}
                                            disabled={userActionLoading[user.id]}
                                            title={`Delete ${user.email}`}
                                        >
                                            {userActionLoading[user.id] ? '⏳' : '🗑️'}
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {filteredUsers.length === 0 ? (
                <div className="admin-no-data">No users found.</div>
            ) : null}

            <div className="admin-footer">
                <p>
                    <span role="img" aria-label="info">ℹ️</span> Click the refresh button for an instant update.
                </p>
            </div>
        </div>
    );
};

export default SessionManagement; 