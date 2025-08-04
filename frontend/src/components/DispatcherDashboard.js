import React, { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../utils/apiClient';
import { API_BASE_URL } from '../config';
import './DispatcherDashboard.css'; // Import the new CSS file

const DispatcherDashboard = ({ onBack }) => {
    const [dashboardData, setDashboardData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchDashboardData = useCallback(async () => {
        try {
            setIsLoading(true);
            const url = `${API_BASE_URL}/dispatcher/dashboard?heatmap=true`;
            
            const response = await apiClient(url);
            if (!response.ok) {
                throw new Error('Failed to fetch dispatcher dashboard data.');
            }
            const data = await response.json();
            setDashboardData(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchDashboardData();
    }, [fetchDashboardData]);

    const getGoalStatusColor = (goalStatus) => {
        switch (goalStatus) {
            case 'achieved': return '#22c55e';
            case 'partial': return '#f59e0b';
            case 'weekend': return '#6b7280';
            default: return '#f1f5f9';
        }
    };

    const getGoalStatus = (calculations, updates) => {
        if (calculations >= 50 && updates >= 75) {
            return 'achieved'; // Green
        } else if (calculations >= 25 && updates >= 75) {
            return 'partial'; // Yellow
        } else {
            return 'missed'; // Gray
        }
    };

    if (isLoading) {
        return (
            <div className="dispatcher-dashboard-container">
                <div className="dispatcher-dashboard-loading">
                    <div className="dispatcher-dashboard-spinner"></div>
                    <span>Loading...</span>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="dispatcher-dashboard-container">
                <div className="dispatcher-dashboard-error">
                    <span>⚠️ {error}</span>
                </div>
            </div>
        );
    }

    if (!dashboardData) {
        return (
            <div className="dispatcher-dashboard-container">
                <div className="dispatcher-dashboard-error">
                    <span>No data available</span>
                </div>
            </div>
        );
    }

    const { today_stats, heatmap_data } = dashboardData;

    // Filter only dispatchers
    const dispatchers = today_stats.filter(dispatcher => dispatcher.role === 'dispatcher');

    return (
        <div className="dispatcher-dashboard-container">
            {/* Header */}
            <div className="dispatcher-dashboard-header">
                <h2>Dispatcher Activity</h2>
                <div className="dispatcher-dashboard-controls">
                    <button onClick={onBack} className="back-btn">← Back to Main</button>
                </div>
            </div>

            {/* Today's Performance Summary */}
            <div className="dispatcher-dashboard-section">
                <h2 className="dispatcher-dashboard-section-title">📊 Today's Performance</h2>
                <div className="dispatcher-dashboard-performance-grid">
                    {dispatchers.map((dispatcher, index) => (
                        <div 
                            key={dispatcher.id} 
                            className="dispatcher-dashboard-performance-card"
                            style={{
                                borderLeft: `4px solid ${getGoalStatusColor(dispatcher.goal_status)}`,
                                background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
                            }}
                        >
                            <div className="dispatcher-dashboard-card-header">
                                <span className="dispatcher-dashboard-dispatcher-name">
                                    {dispatcher.full_name || dispatcher.username}
                                </span>
                                <span 
                                    className="dispatcher-dashboard-status-badge"
                                    style={{
                                        backgroundColor: getGoalStatusColor(dispatcher.goal_status),
                                        color: dispatcher.goal_status === 'achieved' || dispatcher.goal_status === 'partial' ? 'white' : '#6b7280'
                                    }}
                                >
                                    {dispatcher.goal_status === 'achieved' ? '🎯 Perfect' : 
                                     dispatcher.goal_status === 'partial' ? '⚡ Good' : '📈 Pending'}
                                </span>
                            </div>
                            <div className="dispatcher-dashboard-card-stats">
                                <div className="dispatcher-dashboard-stat-item" style={{
                                    background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(139, 92, 246, 0.05) 100%)',
                                    border: '1px solid rgba(139, 92, 246, 0.2)'
                                }}>
                                    <span className="dispatcher-dashboard-stat-number" style={{color: '#8b5cf6'}}>{dispatcher.today_calculations}</span>
                                    <span className="dispatcher-dashboard-stat-label">📊 Calculations</span>
                                </div>
                                <div className="dispatcher-dashboard-stat-item" style={{
                                    background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.1) 0%, rgba(6, 182, 212, 0.05) 100%)',
                                    border: '1px solid rgba(6, 182, 212, 0.2)'
                                }}>
                                    <span className="dispatcher-dashboard-stat-number" style={{color: '#06b6d4'}}>{dispatcher.today_updates}</span>
                                    <span className="dispatcher-dashboard-stat-label">🔄 Updates</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Heatmap */}
            {heatmap_data && (
                <div className="dispatcher-dashboard-section">
                    <div className="heatmap-header">
                        <h3 className="dispatcher-dashboard-section-title">
                            🔥 {heatmap_data.month_name} {heatmap_data.year} Activity Heatmap
                        </h3>
                        <div className="heatmap-legend">
                            <div className="heatmap-legend-item">
                                <div className="heatmap-legend-color" style={{backgroundColor: '#22c55e'}}></div>
                                <span>Perfect (50+ calcs, 75+ updates)</span>
                            </div>
                            <div className="heatmap-legend-item">
                                <div className="heatmap-legend-color" style={{backgroundColor: '#f59e0b'}}></div>
                                <span>Good (25+ calcs, 75+ updates)</span>
                            </div>
                            <div className="heatmap-legend-item">
                                <div className="heatmap-legend-color" style={{backgroundColor: '#f1f5f9'}}></div>
                                <span>Needs improvement</span>
                            </div>
                        </div>
                    </div>

                    <div className="heatmap-container">
                        <div className="heatmap-scroll">
                            {/* Header with day numbers */}
                            <div className="heatmap-header-row">
                                <div className="heatmap-dispatcher-name-header">Dispatcher</div>
                                {heatmap_data.month_days.map(day => (
                                    <div 
                                        key={day.date} 
                                        className={`heatmap-day-header ${day.is_today ? 'today' : ''} ${day.is_weekend ? 'weekend' : ''}`}
                                        title={day.date}
                                    >
                                        {day.day}
                                    </div>
                                ))}
                            </div>

                            {/* Heatmap rows for each dispatcher */}
                            {heatmap_data.dispatcher_data
                                .filter(dispatcher => dispatcher.role === 'dispatcher')
                                .map((dispatcher, dispatcherIndex) => (
                                <div key={dispatcher.id} className="heatmap-row">
                                    <div className="heatmap-dispatcher-name">
                                        <span className="heatmap-dispatcher-full-name">
                                            {dispatcher.full_name || dispatcher.username}
                                        </span>
                                    </div>
                                    {heatmap_data.month_days.map(day => {
                                        const dayStats = dispatcher.daily_stats[day.date] || {calculations: 0, updates: 0};
                                        const goalStatus = day.is_weekend ? 'weekend' : getGoalStatus(dayStats.calculations, dayStats.updates);
                                        
                                        return (
                                            <div 
                                                key={day.date}
                                                className={`heatmap-cell ${day.is_today ? 'today' : ''} ${day.is_future ? 'future' : ''}`}
                                                style={{
                                                    backgroundColor: day.is_future ? '#f8fafc' : getGoalStatusColor(goalStatus),
                                                    opacity: day.is_future ? 0.4 : 1
                                                }}
                                                title={`${dispatcher.full_name || dispatcher.username}\n${day.date}\nCalculations: ${dayStats.calculations}\nUpdates: ${dayStats.updates}`}
                                            >
                                                {!day.is_future && !day.is_weekend && (
                                                    <div className="heatmap-cell-content">
                                                        <span className="heatmap-calculations">{dayStats.calculations}</span>
                                                        <span className="heatmap-updates">{dayStats.updates}</span>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DispatcherDashboard; 