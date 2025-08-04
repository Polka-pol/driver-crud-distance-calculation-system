import React, { useState, useEffect } from 'react';
import { apiClient } from '../utils/apiClient';
import { API_BASE_URL } from '../config';
import { 
    Chart as ChartJS, 
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import './AdminPanel.css';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend
);

const DatabaseAnalytics = () => {
    const [analytics, setAnalytics] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [trendPeriod, setTrendPeriod] = useState('7'); // '7', '30', '365'
    const [summaryPeriod, setSummaryPeriod] = useState('week'); // 'week', 'month', 'year', 'all'
    useEffect(() => {
        const fetchAnalyticsData = async () => {
            try {
                setIsLoading(true);
                const response = await apiClient(`${API_BASE_URL}/dashboard/analytics`);
                if (!response.ok) {
                    throw new Error('Failed to fetch analytics data.');
                }
                const data = await response.json();
                setAnalytics(data.db_analytics);
            } catch (err) {
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };

        fetchAnalyticsData();
    }, []);

    // Get data for selected summary period
    const getDataForPeriod = (period) => {
        if (!analytics) return null;
        
        switch (period) {
            case 'week':
                return analytics.week;
            case 'month':
                return analytics.month || analytics.week; // fallback to week if month not available
            case 'year':
                return analytics.year || analytics.week; // fallback to week if year not available
            case 'all':
                return analytics.all || analytics.week; // fallback to week if all not available
            default:
                return analytics.week;
        }
    };

    const dataForPeriod = getDataForPeriod(summaryPeriod);
    const extendedData = analytics ? analytics.extended : null;

    // Generate trend data based on selected period
    const getTrendData = () => {
        if (!extendedData || !extendedData.daily_trends) return null;
        
        const days = parseInt(trendPeriod);
        const trends = extendedData.daily_trends.slice(-days); // Get last N days
        
        return {
            labels: trends.map(day => {
                const date = new Date(day.date);
                if (days <= 7) {
                    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                } else if (days <= 30) {
                    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                } else {
                    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
                }
            }),
            datasets: [
                {
                    label: 'Drivers Checked',
                    data: trends.map(day => day.total_origins_checked || 0),
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    tension: 0.1,
                    yAxisID: 'y',
                },
                {
                    label: 'Cache Hits',
                    data: trends.map(day => day.cache_hits || 0),
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    tension: 0.1,
                    yAxisID: 'y',
                },
                {
                    label: 'Mapbox Requests',
                    data: trends.map(day => day.mapbox_requests || 0),
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    tension: 0.1,
                    yAxisID: 'y',
                }
            ],
        };
    };

    const trendChartOptions = {
        responsive: true,
        interaction: {
            mode: 'index',
            intersect: false,
        },
        scales: {
            y: {
                type: 'linear',
                display: true,
                position: 'left',
                title: {
                    display: true,
                    text: 'Number of Requests'
                },
                beginAtZero: true
            }
        },
        plugins: {
            legend: {
                position: 'top',
            },
            title: {
                display: true,
                text: `Daily Trends (Last ${trendPeriod} days)`
            }
        },
    };

    const trendData = getTrendData();

    const getRoleBadgeClass = (role) => {
        switch (role) {
            case 'admin': return 'admin-role-badge admin';
            case 'manager': return 'admin-role-badge manager';
            case 'dispatcher': return 'admin-role-badge dispatcher';
            default: return 'admin-role-badge';
        }
    };

    if (isLoading) return <div className="admin-container"><p>Loading database analytics...</p></div>;
    if (error) return <div className="admin-container"><p className="admin-error-message">Error: {error}</p></div>;
    if (!analytics) return <div className="admin-container"><p>No data available.</p></div>;

    return (
        <div className="admin-container">
            <div className="admin-header">
                <h3>Database Analytics</h3>
                <div className="admin-period-selector">
                    <button 
                        onClick={() => setSummaryPeriod('week')} 
                        className={`admin-period-btn ${summaryPeriod === 'week' ? 'active' : ''}`}
                    >
                        Week
                    </button>
                    <button 
                        onClick={() => setSummaryPeriod('month')} 
                        className={`admin-period-btn ${summaryPeriod === 'month' ? 'active' : ''}`}
                    >
                        Month
                    </button>
                    <button 
                        onClick={() => setSummaryPeriod('year')} 
                        className={`admin-period-btn ${summaryPeriod === 'year' ? 'active' : ''}`}
                    >
                        Year
                    </button>
                    <button 
                        onClick={() => setSummaryPeriod('all')} 
                        className={`admin-period-btn ${summaryPeriod === 'all' ? 'active' : ''}`}
                    >
                        All Time
                    </button>
                </div>
            </div>

            {dataForPeriod ? (
                <>
                    {/* Summary Cards */}
                    <div className="admin-stats">
                        <div className="admin-stat-card success">
                            <h4>⚡ Cache Efficiency</h4>
                            <p>
                                {dataForPeriod.cache_hits + dataForPeriod.mapbox_requests > 0 
                                    ? Math.round((dataForPeriod.cache_hits / (dataForPeriod.cache_hits + dataForPeriod.mapbox_requests)) * 100)
                                    : 0
                                }%
                            </p>
                            <small className="period-indicator">
                                {summaryPeriod === 'week' ? 'Last 7 days' : 
                                 summaryPeriod === 'month' ? 'Last 30 days' : 
                                 summaryPeriod === 'year' ? 'Last 365 days' : 
                                 'All time'}
                            </small>
                        </div>
                        <div className="admin-stat-card secondary">
                            <h4>🚚 Drivers Checked</h4>
                            <p>{dataForPeriod.total_origins_checked || 0}</p>
                            <small className="period-indicator">
                                {summaryPeriod === 'week' ? 'Last 7 days' : 
                                 summaryPeriod === 'month' ? 'Last 30 days' : 
                                 summaryPeriod === 'year' ? 'Last 365 days' : 
                                 'All time'}
                            </small>
                        </div>
                        <div className="admin-stat-card primary">
                            <h4>💾 Cache Hits</h4>
                            <p>{dataForPeriod.cache_hits || 0}</p>
                            <small className="period-indicator">
                                {summaryPeriod === 'week' ? 'Last 7 days' : 
                                 summaryPeriod === 'month' ? 'Last 30 days' : 
                                 summaryPeriod === 'year' ? 'Last 365 days' : 
                                 'All time'}
                            </small>
                        </div>
                        <div className="admin-stat-card danger">
                            <h4>🌍 Mapbox Requests</h4>
                            <p>{dataForPeriod.mapbox_requests || 0}</p>
                            <small className="period-indicator">
                                {summaryPeriod === 'week' ? 'Last 7 days' : 
                                 summaryPeriod === 'month' ? 'Last 30 days' : 
                                 summaryPeriod === 'year' ? 'Last 365 days' : 
                                 'All time'}
                            </small>
                        </div>
                    </div>

                    {/* Cache Statistics */}
                    <div className="admin-stats" style={{marginTop: '20px'}}>
                        <div className="admin-stat-card primary">
                            <h4>🗺️ Cached Distances</h4>
                            <p>{extendedData?.total_cached_distances || 0}</p>
                        </div>
                        <div className="admin-stat-card primary">
                            <h4>📍 Cached Geocoding</h4>
                            <p>{extendedData?.total_cached_geocoding || 0}</p>
                        </div>
                        <div className="admin-stat-card primary">
                            <h4>🔍 Cached Autofill</h4>
                            <p>{extendedData?.total_cached_autofill || 0}</p>
                        </div>
                        <div className="admin-stat-card info">
                            <h4>💾 Total Cache Size</h4>
                            <p>{((extendedData?.total_cached_distances || 0) + (extendedData?.total_cached_geocoding || 0) + (extendedData?.total_cached_autofill || 0)).toLocaleString()}</p>
                        </div>
                    </div>

                    {/* Daily Trends Chart */}
                    <div style={{marginTop: '25px'}}>
                        <div className="admin-header" style={{marginBottom: '15px', paddingBottom: '10px', borderBottom: '1px solid #e5e7eb'}}>
                            <h3 style={{margin: 0, color: '#374151', fontSize: '18px'}}>Daily Trends</h3>
                            <div className="admin-period-selector">
                                <button 
                                    onClick={() => setTrendPeriod('7')} 
                                    className={`admin-period-btn ${trendPeriod === '7' ? 'active' : ''}`}
                                >
                                    7 Days
                                </button>
                                <button 
                                    onClick={() => setTrendPeriod('30')} 
                                    className={`admin-period-btn ${trendPeriod === '30' ? 'active' : ''}`}
                                >
                                    30 Days
                                </button>
                                <button 
                                    onClick={() => setTrendPeriod('365')} 
                                    className={`admin-period-btn ${trendPeriod === '365' ? 'active' : ''}`}
                                >
                                    1 Year
                                </button>
                            </div>
                        </div>
                        
                        {trendData && (
                            <div className="admin-chart-container">
                                <Line data={trendData} options={trendChartOptions} />
                            </div>
                        )}
                    </div>

                    {/* User Stats Table */}
                    {extendedData && extendedData.user_stats && (
                        <div className="admin-table-container">
                            <h3 style={{marginBottom: '15px', color: '#374151'}}>User Usage Statistics (Last 7 Days)</h3>
                            <table className="admin-table">
                                <thead>
                                    <tr>
                                        <th>User</th>
                                        <th>Role</th>
                                        <th>Queries Made</th>
                                        <th>Cache Hits Used</th>
                                        <th>Mapbox Requests Used</th>
                                        <th>Cache Efficiency</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {extendedData.user_stats.map((user, index) => {
                                        return (
                                            <tr key={index}>
                                                <td className="username">{user.username}</td>
                                                <td><span className={getRoleBadgeClass(user.role)}>{user.role}</span></td>
                                                <td className="admin-cell-center">{user.queries_made}</td>
                                                <td className="admin-cell-center">{user.cache_hits_used}</td>
                                                <td className="admin-cell-center">{user.mapbox_requests_used}</td>
                                                <td className="admin-cell-center">
                                                    <span className={`admin-status-badge ${user.avg_cache_efficiency >= 80 ? 'high' : user.avg_cache_efficiency >= 50 ? 'medium' : 'low'}`}>
                                                        {user.avg_cache_efficiency || 0}%
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            ) : (
                <div className="admin-no-data">
                    <p>No data available for the selected period.</p>
                </div>
            )}
        </div>
    );
};

export default DatabaseAnalytics; 