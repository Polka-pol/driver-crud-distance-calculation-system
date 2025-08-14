import React, { useState, useEffect } from 'react';
import { apiClient } from '../utils/apiClient';
import { API_BASE_URL } from '../config';
import { formatTimeInAppTZ, getRelativeTime } from '../utils/timeUtils';
import './AdminPanel.css';
import { usePermissions } from '../context/PermissionsContext';

const ActivityDashboard = ({ serverTimeOffset = 0 }) => {
    const { has } = usePermissions();
    const [analytics, setAnalytics] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isRefreshing, setIsRefreshing] = useState(false);



    useEffect(() => {
        const fetchAnalytics = async () => {
            try {
                setIsLoading(true);
                const response = await apiClient(`${API_BASE_URL}/dashboard/analytics`);
                if (!response.ok) {
                    throw new Error('Failed to fetch analytics data.');
                }
                const data = await response.json();
                setAnalytics(data);
            } catch (err) {
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };

        // Initial fetch
        if (has('dashboard.analytics.view')) {
            fetchAnalytics();
        } else {
            setAnalytics(null);
            setError('You do not have permission to view analytics.');
            setIsLoading(false);
        }
    }, [has]);

    if (isLoading) {
        return <p>Loading dashboard...</p>;
    }

    if (error) {
        return <p className="admin-error-message">Error: {error}</p>;
    }

    if (!analytics) {
        return <p>No analytics data available.</p>;
    }
    
    const { summary, user_daily_stats, db_analytics, recent_activity } = analytics;

    // Use centralized App TZ time formatting
    const formatTime = (dateTimeString) => {
        return formatTimeInAppTZ(dateTimeString);
    };

    const getActionIcon = (action) => {
        switch (action) {
            case 'distance_batch_calculated':
                return '📊';
            case 'truck_updated':
                return '🚛';
            case 'truck_created':
                return '➕';
            case 'truck_deleted':
                return '🗑️';
            case 'truck_location_changed':
                return '📍';
            case 'user_login_success':
                return '🔐';
            case 'statistics_reset':
                return '🗑️';
            case 'test_analytics_created':
                return '🧪';
            default:
                return '📝';
        }
    };

    // Use centralized relative time calculation
    const formatRelativeTime = (dateString) => {
        return getRelativeTime(dateString, serverTimeOffset);
    };



    const handleManualRefresh = async () => {
        if (isRefreshing) return;
        
        try {
            setIsRefreshing(true);
            const response = await apiClient(`${API_BASE_URL}/dashboard/analytics`);
            if (!response.ok) {
                throw new Error('Failed to fetch analytics data.');
            }
            const data = await response.json();
            setAnalytics(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setIsRefreshing(false);
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

    return (
        <div className="admin-container">
            <style>
                {`
                    .live-feed-item:hover {
                        background-color: #f9fafb;
                    }
                    @keyframes rotate {
                        from { transform: rotate(0deg); }
                        to { transform: rotate(360deg); }
                    }
                    .refresh-btn-rotating {
                        animation: rotate 1s linear infinite;
                    }
                    .user-activity-row:hover {
                        background-color: #f9fafb;
                    }
                `}
            </style>
            <div className="admin-header">
                <h3>Activity Dashboard</h3>
            </div>

            <div className="admin-stats">
                <div className="admin-stat-card info">
                    <h4>Distance Calcs (7d)</h4>
                    <p>{summary.distance_calcs_7d}</p>
                </div>
                <div className="admin-stat-card secondary">
                    <h4>Truck Updates (7d)</h4>
                    <p>{summary.truck_updates_7d}</p>
                </div>
            </div>

            {!db_analytics && (
                <div style={{marginTop: '10px', padding: '10px', backgroundColor: '#fffbeb', border: '1px solid #f59e0b', borderRadius: '4px', fontSize: '14px', color: '#92400e'}}>
                    💡 <strong>Note:</strong> Detailed cache statistics will appear here once distance calculations are performed. You can create test data from the Database Analytics section.
                </div>
            )}

            {/* User Activity Today */}
            <div style={{marginTop: '25px'}}>
                <h3 style={{marginBottom: '15px', color: '#374151'}}>📊 User Activity Today</h3>
                <div className="admin-table-container">
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th>User</th>
                                <th>Role</th>
                                <th>First Activity</th>
                                <th>Last Activity</th>
                                <th>Distance Calcs</th>
                                <th>Truck Updates</th>
                                <th>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {user_daily_stats.map((stats, index) => {
                                const total = (stats.distance_calcs_today || 0) + (stats.truck_updates_today || 0);
                                return (
                                    <tr key={index} className="user-activity-row">
                                        <td className="username">
                                            {stats.full_name || stats.username}
                                        </td>
                                        <td>
                                            <span className={getRoleBadgeClass(stats.role)}>
                                                {stats.role}
                                            </span>
                                        </td>
                                        <td className="last-activity">
                                            {formatTime(stats.first_activity_today)}
                                        </td>
                                        <td className="last-activity">
                                            {formatTime(stats.last_activity_today)}
                                        </td>
                                        <td className="activities-count" style={{
                                            color: stats.distance_calcs_today > 0 ? '#059669' : '#9ca3af'
                                        }}>
                                            {stats.distance_calcs_today}
                                        </td>
                                        <td className="activities-count" style={{
                                            color: stats.truck_updates_today > 0 ? '#0369a1' : '#9ca3af'
                                        }}>
                                            {stats.truck_updates_today}
                                        </td>
                                        <td className="activities-count" style={{
                                            color: total > 0 ? '#1f2937' : '#9ca3af'
                                        }}>
                                            {total}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Live Activity Feed */}
            <div style={{marginTop: '25px'}}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '15px'
                }}>
                    <h3 style={{margin: 0, color: '#374151'}}>
                        🔴 Live Activity Feed
                        {recent_activity && recent_activity.length > 0 && (
                            <span style={{
                                fontSize: '14px',
                                fontWeight: 'normal',
                                color: '#6b7280',
                                marginLeft: '8px'
                            }}>
                                ({recent_activity.length} activities)
                            </span>
                        )}
                    </h3>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        fontSize: '12px',
                        color: '#6b7280'
                    }}>

                        <button
                            onClick={handleManualRefresh}
                            disabled={isRefreshing}
                            style={{
                                backgroundColor: '#f3f4f6',
                                border: '1px solid #d1d5db',
                                borderRadius: '6px',
                                padding: '4px 8px',
                                fontSize: '11px',
                                color: '#374151',
                                cursor: isRefreshing ? 'not-allowed' : 'pointer',
                                opacity: isRefreshing ? 0.6 : 1,
                                transition: 'all 0.2s ease',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                            }}
                            onMouseEnter={(e) => {
                                if (!isRefreshing) {
                                    e.target.style.backgroundColor = '#e5e7eb';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!isRefreshing) {
                                    e.target.style.backgroundColor = '#f3f4f6';
                                }
                            }}
                        >
                            <span className={isRefreshing ? 'refresh-btn-rotating' : ''} style={{
                                display: 'inline-block',
                                fontSize: '12px'
                            }}>
                                ↻
                            </span>
                            Refresh
                        </button>
                    </div>
                </div>
                <div className="live-feed-container" style={{
                    backgroundColor: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    maxHeight: '500px',
                    overflowY: 'auto',
                    scrollbarWidth: 'thin',
                    scrollbarColor: '#cbd5e1 #f1f5f9'
                }}>
                    <style>
                        {`
                            .live-feed-container::-webkit-scrollbar {
                                width: 8px;
                            }
                            .live-feed-container::-webkit-scrollbar-track {
                                background: #f1f5f9;
                                border-radius: 4px;
                            }
                            .live-feed-container::-webkit-scrollbar-thumb {
                                background: #cbd5e1;
                                border-radius: 4px;
                            }
                            .live-feed-container::-webkit-scrollbar-thumb:hover {
                                background: #94a3b8;
                            }
                            .live-feed-item {
                                transition: all 0.2s ease;
                            }
                            .live-feed-item:hover {
                                background-color: #f8fafc;
                                transform: translateX(2px);
                            }
                        `}
                    </style>
                    {recent_activity && recent_activity.length > 0 ? (
                        recent_activity.map((activity, index) => (
                            <div key={index} className="live-feed-item" style={{
                                padding: '14px 16px',
                                borderBottom: index < recent_activity.length - 1 ? '1px solid #f3f4f6' : 'none',
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '12px',
                                cursor: 'pointer',
                                position: 'relative'
                            }}>
                                {index === 0 && (
                                    <div style={{
                                        position: 'absolute',
                                        top: '8px',
                                        right: '12px',
                                        width: '8px',
                                        height: '8px',
                                        backgroundColor: '#ef4444',
                                        borderRadius: '50%',
                                        animation: 'pulse 2s infinite'
                                    }} />
                                )}
                                <style>
                                    {`
                                        @keyframes pulse {
                                            0% { opacity: 1; }
                                            50% { opacity: 0.5; }
                                            100% { opacity: 1; }
                                        }
                                    `}
                                </style>
                                <div className="activity-icon" style={{
                                    fontSize: '18px',
                                    minWidth: '24px',
                                    textAlign: 'center'
                                }}>
                                    {getActionIcon(activity.action)}
                                </div>
                                <div className="activity-content" style={{flex: 1, minWidth: 0}}>
                                    <div className="activity-header" style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        marginBottom: '4px'
                                    }}>
                                        <span className="activity-user" style={{
                                            fontWeight: '600',
                                            color: '#1f2937',
                                            fontSize: '14px'
                                        }}>
                                            {activity.full_name || activity.username}
                                            <span className={`role-badge ${getRoleBadgeClass(activity.role)}`} style={{
                                                marginLeft: '8px',
                                                fontSize: '10px',
                                                padding: '2px 6px',
                                                borderRadius: '8px',
                                                fontWeight: '600',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.5px'
                                            }}>
                                                {activity.role}
                                            </span>
                                        </span>
                                        <span className="activity-time" style={{
                                            fontSize: '11px',
                                            color: '#6b7280',
                                            backgroundColor: '#f9fafb',
                                            padding: '2px 6px',
                                            borderRadius: '4px',
                                            fontWeight: '500'
                                        }}>
                                            {formatRelativeTime(activity.created_at)}
                                        </span>
                                    </div>
                                    <div className="activity-summary" style={{
                                        fontSize: '13px',
                                        color: '#4b5563',
                                        lineHeight: '1.4'
                                    }}>
                                        {activity.summary}
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div style={{
                            padding: '40px 20px',
                            textAlign: 'center',
                            color: '#6b7280',
                            fontSize: '14px'
                        }}>
                            No recent activity to display
                        </div>
                    )}
                </div>
            </div>


        </div>
    );
};

export default ActivityDashboard; 