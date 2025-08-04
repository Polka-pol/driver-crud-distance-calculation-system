import React, { useState, useEffect } from 'react';
import { apiClient } from '../utils/apiClient';
import { API_BASE_URL } from '../config';
import './AdminPanel.css';
import './SessionManagement.css'; // Keep specific styles for session management
import UserModal from './UserModal';

const SessionManagement = () => {
    const [sessionData, setSessionData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const [sortBy, setSortBy] = useState('last_activity'); // 'username', 'last_activity'
    const [sortOrder, setSortOrder] = useState('desc');
    const [logoutLoading, setLogoutLoading] = useState({});
    
    // User Management states
    const [isUserModalOpen, setIsUserModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [userActionLoading, setUserActionLoading] = useState({});

    useEffect(() => {
        fetchSessionData();
    }, []);

    const fetchSessionData = async () => {
        try {
            setIsLoading(true);
            const response = await apiClient(`${API_BASE_URL}/dashboard/session-management`);
            if (!response.ok) {
                throw new Error('Failed to fetch session data');
            }
            const data = await response.json();
            setSessionData(data);
            setError(null);
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const getStatusBadgeClass = (status) => {
        switch (status) {
            case 'active': return 'session-status-badge active';
            case 'idle': return 'session-status-badge idle';
            case 'offline': return 'session-status-badge offline';
            default: return 'session-status-badge';
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



    const filteredAndSortedSessions = () => {
        if (!sessionData || !sessionData.sessions) return [];
        
        let filtered = sessionData.sessions;
        
        // Sort
        filtered.sort((a, b) => {
            let aVal, bVal;
            
            switch (sortBy) {
                case 'username':
                    aVal = a.username?.toLowerCase() || '';
                    bVal = b.username?.toLowerCase() || '';
                    break;
                case 'last_activity':
                    aVal = a.last_activity ? new Date(a.last_activity).getTime() : 0;
                    bVal = b.last_activity ? new Date(b.last_activity).getTime() : 0;
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

    const handleLogoutUser = async (userId, username) => {
        if (!window.confirm(`Are you sure you want to logout user "${username}"?`)) {
            return;
        }

        setLogoutLoading(prev => ({ ...prev, [userId]: true }));

        try {
            const currentUser = JSON.parse(localStorage.getItem('user'));
            const response = await apiClient(`${API_BASE_URL}/dashboard/logout-user`, {
                method: 'POST',
                body: JSON.stringify({
                    user_id: userId,
                    admin_user_id: currentUser.id
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to logout user');
            }

            const result = await response.json();
            
            if (result.success) {
                // Refresh session data to show updated status
                await fetchSessionData();
                // Show success message
                alert(`User "${username}" has been logged out successfully.`);
            } else {
                throw new Error(result.message || 'Failed to logout user');
            }
        } catch (err) {
            alert(`Error logging out user: ${err.message}`);
        } finally {
            setLogoutLoading(prev => ({ ...prev, [userId]: false }));
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
                response = await apiClient(`${API_BASE_URL}/users/${userId}`, {
                    method: 'PUT',
                    body: JSON.stringify(userData),
                });
            } else {
                // Create user
                response = await apiClient(`${API_BASE_URL}/users`, {
                    method: 'POST',
                    body: JSON.stringify(userData),
                });
            }

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to save user.');
            }

            setIsUserModalOpen(false);
            await fetchSessionData(); // Refresh the session data to show new/updated user
            alert(`User ${userId ? 'updated' : 'created'} successfully!`);
        } catch (err) {
            console.error("Failed to save user:", err);
            alert(`Error saving user: ${err.message}`);
        }
    };

    const handleDeleteUser = async (userId, username) => {
        const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
        
        if (userId === currentUser.id) {
            alert('You cannot delete yourself!');
            return;
        }

        if (!window.confirm(`Are you sure you want to delete user "${username}"?`)) {
            return;
        }

        setUserActionLoading(prev => ({ ...prev, [userId]: true }));

        try {
            const response = await apiClient(`${API_BASE_URL}/users/${userId}`, { 
                method: 'DELETE' 
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to delete user.');
            }
            
            await fetchSessionData(); // Refresh the session data
            alert(`User "${username}" deleted successfully!`);
        } catch (err) {
            console.error("Failed to delete user:", err);
            alert(`Error deleting user: ${err.message}`);
        } finally {
            setUserActionLoading(prev => ({ ...prev, [userId]: false }));
        }
    };

    if (isLoading) return <div className="session-management-container"><p>Loading session data...</p></div>;
    if (error) return <div className="session-management-container"><p className="error-message">Error: {error}</p></div>;
    if (!sessionData) return <div className="session-management-container"><p>No session data available.</p></div>;

    const { stats } = sessionData;
    const filteredSessions = filteredAndSortedSessions();

    return (
        <div className="admin-container">
            <UserModal 
                isOpen={isUserModalOpen}
                onClose={() => setIsUserModalOpen(false)}
                onSave={handleSaveUser}
                user={editingUser}
            />
            <div className="admin-header">
                <h3>User & Session Management</h3>
                <div className="admin-header-actions">
                    <button onClick={handleAddUser} className="admin-btn primary">
                        👤 Add User
                    </button>
                    <button onClick={fetchSessionData} className="admin-btn" disabled={isLoading}>
                        🔄 Refresh
                    </button>
                </div>
            </div>

            {/* Session Statistics */}
            <div className="admin-stats">
                <div className="admin-stat-card primary">
                    <h4>Active Sessions</h4>
                    <p>{stats.active_sessions}</p>
                </div>
                <div className="admin-stat-card secondary">
                    <h4>Idle Sessions</h4>
                    <p>{stats.idle_sessions}</p>
                </div>
                <div className="admin-stat-card danger">
                    <h4>Offline Users</h4>
                    <p>{stats.offline_sessions}</p>
                </div>
                <div className="admin-stat-card info">
                    <h4>Active Today</h4>
                    <p>{stats.unique_users_today}</p>
                </div>
            </div>



            {/* Sessions Table */}
            <div className="admin-table-container">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th onClick={() => handleSort('username')} className="sortable">
                                User {sortBy === 'username' && (sortOrder === 'asc' ? '↑' : '↓')}
                            </th>
                            <th>Role</th>
                            <th>Status</th>
                            <th onClick={() => handleSort('last_activity')} className="sortable">
                                Last Activity {sortBy === 'last_activity' && (sortOrder === 'asc' ? '↑' : '↓')}
                            </th>
                            <th>Session Duration</th>
                            <th>Contact</th>
                            <th>Edit</th>
                            <th>Delete</th>
                            <th>Logout</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredSessions.map((session) => (
                            <tr key={session.id} className={`session-row ${session.status}`}>
                                <td className="username">{session.full_name || session.username}</td>
                                <td>
                                    <span className={getRoleBadgeClass(session.role)}>
                                        {session.role}
                                    </span>
                                </td>
                                <td>
                                    <span className={getStatusBadgeClass(session.status)}>
                                        {session.status}
                                    </span>
                                </td>
                                <td className="last-activity">
                                    {session.last_activity_formatted}
                                </td>
                                <td className="session-duration">
                                    {session.session_duration}
                                </td>
                                <td className="contact">
                                    {session.mobile_number || '-'}
                                </td>
                                <td className="actions">
                                    <button
                                        className="edit-user-btn"
                                        onClick={() => handleEditUser({
                                            id: session.id,
                                            username: session.username,
                                            full_name: session.full_name,
                                            mobile_number: session.mobile_number,
                                            role: session.role
                                        })}
                                        title={`Edit ${session.username}`}
                                    >
                                        ✏️
                                    </button>
                                </td>
                                <td className="actions">
                                    {(() => {
                                        const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
                                        const isCurrentUser = session.id === currentUser.id;
                                        
                                        if (isCurrentUser) {
                                            return <span className="no-action" title="Cannot delete yourself">🔒</span>;
                                        } else {
                                            return (
                                                <button
                                                    className="delete-user-btn"
                                                    onClick={() => handleDeleteUser(session.id, session.username)}
                                                    disabled={userActionLoading[session.id]}
                                                    title={`Delete ${session.username}`}
                                                >
                                                    {userActionLoading[session.id] ? '⏳' : '🗑️'}
                                                </button>
                                            );
                                        }
                                    })()}
                                </td>
                                <td className="actions">
                                    {(() => {
                                        const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
                                        const isCurrentUser = session.id === currentUser.id;
                                        const canLogout = (session.status === 'active' || session.status === 'idle') && !isCurrentUser;
                                        
                                        if (canLogout) {
                                            return (
                                                <button
                                                    className="logout-user-btn"
                                                    onClick={() => handleLogoutUser(session.id, session.username)}
                                                    disabled={logoutLoading[session.id]}
                                                    title={`Logout ${session.username}`}
                                                >
                                                    {logoutLoading[session.id] ? '⏳' : '🚪'}
                                                </button>
                                            );
                                        } else if (isCurrentUser) {
                                            return <span className="no-action" title="Cannot logout yourself">🔒</span>;
                                        } else {
                                            return <span className="no-action">-</span>;
                                        }
                                    })()}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {filteredSessions.length === 0 ? (
                <div className="admin-no-data">No sessions match the current filter.</div>
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