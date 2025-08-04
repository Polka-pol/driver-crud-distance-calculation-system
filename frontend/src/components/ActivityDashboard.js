import React, { useState, useEffect } from 'react';
import { apiClient } from '../utils/apiClient';
import { API_BASE_URL } from '../config';
import './AdminPanel.css';

const ActivityDashboard = () => {
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
        fetchAnalytics();
    }, []);

    if (isLoading) {
        return <p>Loading dashboard...</p>;
    }

    if (error) {
        return <p className="admin-error-message">Error: {error}</p>;
    }

    if (!analytics) {
        return <p>No analytics data available.</p>;
    }
    
    const { summary, user_daily_stats, db_analytics, recent_activity, user_heatmaps } = analytics;

    const formatTime = (dateTimeString) => {
        if (!dateTimeString) return 'N/A';
        return new Date(dateTimeString).toLocaleTimeString();
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

    const formatRelativeTime = (dateString) => {
        const now = new Date();
        const activityTime = new Date(dateString);
        const diffMs = now - activityTime;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        return `${diffDays}d ago`;
    };

    const getDayName = (dayOfWeek) => {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        return days[dayOfWeek - 1] || 'Unknown';
    };

    const getDistanceCalcColor = (value) => {
        if (value === 0) return '#f3f4f6'; // No activity - light gray
        if (value === 1) return '#dbeafe'; // 1 activity - light blue
        if (value <= 3) return '#bfdbfe'; // 2-3 activities
        if (value <= 6) return '#93c5fd'; // 4-6 activities
        if (value <= 10) return '#60a5fa'; // 7-10 activities - medium blue
        if (value <= 15) return '#3b82f6'; // 11-15 activities - blue
        if (value < 20) return '#2563eb'; // 16-19 activities - darker blue
        return '#1d4ed8'; // 20+ activities - dark blue
    };

    const getTruckUpdateColor = (value) => {
        if (value === 0) return '#f3f4f6'; // No activity - light gray
        if (value === 1) return '#d1fae5'; // 1 activity - light green
        if (value <= 5) return '#a7f3d0'; // 2-5 activities
        if (value <= 10) return '#6ee7b7'; // 6-10 activities
        if (value <= 20) return '#34d399'; // 11-20 activities - medium green
        if (value <= 30) return '#10b981'; // 21-30 activities - green
        if (value < 40) return '#059669'; // 31-39 activities - darker green
        return '#047857'; // 40+ activities - dark green
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
                    <h3 style={{margin: 0, color: '#374151'}}>🔴 Live Activity Feed</h3>
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
                    maxHeight: '400px',
                    overflowY: 'auto'
                }}>
                    {recent_activity && recent_activity.length > 0 ? (
                        recent_activity.map((activity, index) => (
                            <div key={index} className="live-feed-item" style={{
                                padding: '12px 16px',
                                borderBottom: index < recent_activity.length - 1 ? '1px solid #f3f4f6' : 'none',
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '12px',
                                transition: 'background-color 0.2s ease',
                                cursor: 'pointer'
                            }}>
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
                                                fontSize: '11px',
                                                padding: '2px 6px',
                                                borderRadius: '12px'
                                            }}>
                                                {activity.role}
                                            </span>
                                        </span>
                                        <span className="activity-time" style={{
                                            fontSize: '12px',
                                            color: '#6b7280'
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

            {/* User Activity Heatmap */}
            {user_heatmaps && user_heatmaps.length > 0 && (
                <div style={{marginTop: '25px'}}>
                    <h3 style={{marginBottom: '15px', color: '#374151'}}>🔥 User Activity Heatmap (Last 7 Days)</h3>
                    <div className="heatmap-container" style={{
                        backgroundColor: '#fff',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        padding: '20px',
                        overflowX: 'auto',
                        maxWidth: '100%'
                    }}>
                        <style>
                            {`
                                .user-activity-row:hover {
                                    background-color: #f9fafb !important;
                                }
                                .dual-heatmap-cell:hover {
                                    transform: scale(1.15);
                                    z-index: 10;
                                    position: relative;
                                    border: 2px solid #374151;
                                    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                                }
                                .dual-heatmap-cell {
                                    transition: all 0.2s ease;
                                }
                                .heatmap-container {
                                    scroll-behavior: smooth;
                                }
                                .heatmap-container::-webkit-scrollbar {
                                    height: 8px;
                                }
                                .heatmap-container::-webkit-scrollbar-track {
                                    background: #f1f5f9;
                                    border-radius: 4px;
                                }
                                .heatmap-container::-webkit-scrollbar-thumb {
                                    background: #cbd5e1;
                                    border-radius: 4px;
                                }
                                .heatmap-container::-webkit-scrollbar-thumb:hover {
                                    background: #94a3b8;
                                }
                            `}
                        </style>
                        {user_heatmaps.map((userHeatmap, userIndex) => {
                            return (
                                <div key={userIndex} className="user-heatmap" style={{
                                    marginBottom: userIndex < user_heatmaps.length - 1 ? '25px' : '0'
                                }}>
                                    <div className="heatmap-header" style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        marginBottom: '12px',
                                        gap: '10px'
                                    }}>
                                        <span style={{
                                            fontWeight: '600',
                                            fontSize: '16px',
                                            color: '#1f2937'
                                        }}>
                                            {userHeatmap.full_name || userHeatmap.username}
                                        </span>
                                        <span className={getRoleBadgeClass(userHeatmap.role)} style={{
                                            fontSize: '12px',
                                            padding: '2px 8px',
                                            borderRadius: '12px'
                                        }}>
                                            {userHeatmap.role}
                                        </span>
                                    </div>
                                    
                                    <div className="heatmap-grid" style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'auto repeat(24, 1fr)',
                                        gap: '3px',
                                        fontSize: '11px',
                                        minWidth: '650px',
                                        
                                    }}>
                                        {/* Hour headers */}
                                        <div></div>
                                        {Array.from({length: 24}, (_, hour) => (
                                            <div key={hour} style={{
                                                textAlign: 'center',
                                                color: '#6b7280',
                                                fontSize: '10px',
                                                padding: '3px'
                                            }}>
                                                {hour.toString().padStart(2, '0')}
                                            </div>
                                        ))}
                                        
                                        {/* Days and activity grid */}
                                        {[2, 3, 4, 5, 6, 7, 1].map(dayOfWeek => ( // Monday to Sunday
                                            <React.Fragment key={dayOfWeek}>
                                                <div style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    color: '#6b7280',
                                                    fontSize: '10px',
                                                    fontWeight: '500',
                                                    padding: '3px 8px 3px 0',
                                                    justifyContent: 'flex-end'
                                                }}>
                                                    {getDayName(dayOfWeek)}
                                                </div>
                                                {Array.from({length: 24}, (_, hour) => {
                                                    const data = userHeatmap.heatmap[dayOfWeek]?.[hour] || {
                                                        distance_calcs: 0,
                                                        truck_updates: 0,
                                                        total: 0
                                                    };
                                                    return (
                                                        <div
                                                            key={`${dayOfWeek}-${hour}`}
                                                            className="dual-heatmap-cell"
                                                            style={{
                                                                width: '24px',
                                                                height: '24px',
                                                                borderRadius: '3px',
                                                                cursor: data.total > 0 ? 'pointer' : 'default',
                                                                position: 'relative',
                                                                display: 'flex',
                                                                flexDirection: 'column'
                                                            }}
                                                            title={`${getDayName(dayOfWeek)} ${hour}:00\n📊 Distance Calcs: ${data.distance_calcs}\n🚛 Truck Updates: ${data.truck_updates}\n📈 Total: ${data.total}`}
                                                        >
                                                            {/* Upper half - Distance Calculations */}
                                                            <div style={{
                                                                backgroundColor: getDistanceCalcColor(data.distance_calcs),
                                                                height: '12px',
                                                                width: '100%',
                                                                borderTopLeftRadius: '3px',
                                                                borderTopRightRadius: '3px',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                fontSize: '8px',
                                                                color: data.distance_calcs >= 10 ? '#fff' : '#374151',
                                                                fontWeight: '600'
                                                            }}>
                                                                {data.distance_calcs > 0 ? data.distance_calcs : ''}
                                                            </div>
                                                            {/* Lower half - Truck Updates */}
                                                            <div style={{
                                                                backgroundColor: getTruckUpdateColor(data.truck_updates),
                                                                height: '12px',
                                                                width: '100%',
                                                                borderBottomLeftRadius: '3px',
                                                                borderBottomRightRadius: '3px',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                fontSize: '8px',
                                                                color: data.truck_updates >= 20 ? '#fff' : '#374151',
                                                                fontWeight: '600'
                                                            }}>
                                                                {data.truck_updates > 0 ? data.truck_updates : ''}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </React.Fragment>
                                        ))}
                                    </div>
                                    
                                    {/* Dual Legend */}
                                    <div className="heatmap-dual-legend" style={{
                                        marginTop: '12px',
                                        fontSize: '11px',
                                        color: '#6b7280'
                                    }}>
                                        {/* Distance Calculations Legend */}
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'flex-end',
                                            gap: '8px',
                                            marginBottom: '8px'
                                        }}>
                                            <span style={{fontWeight: '600'}}>📊 Distance Calcs:</span>
                                            <span>0</span>
                                            {[0, 1, 3, 6, 10, 15, 20].map((value, index) => (
                                                <div
                                                    key={index}
                                                    style={{
                                                        width: '16px',
                                                        height: '8px',
                                                        backgroundColor: getDistanceCalcColor(value),
                                                        borderRadius: '2px'
                                                    }}
                                                    title={`${value}${value === 20 ? '+' : ''} distance calculations`}
                                                />
                                            ))}
                                            <span>20+</span>
                                        </div>
                                        {/* Truck Updates Legend */}
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'flex-end',
                                            gap: '8px'
                                        }}>
                                            <span style={{fontWeight: '600'}}>🚛 Truck Updates:</span>
                                            <span>0</span>
                                            {[0, 1, 5, 10, 20, 30, 40].map((value, index) => (
                                                <div
                                                    key={index}
                                                    style={{
                                                        width: '16px',
                                                        height: '8px',
                                                        backgroundColor: getTruckUpdateColor(value),
                                                        borderRadius: '2px'
                                                    }}
                                                    title={`${value}${value === 40 ? '+' : ''} truck updates`}
                                                />
                                            ))}
                                            <span>40+</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ActivityDashboard; 