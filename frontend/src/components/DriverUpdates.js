import React, { useState, useEffect, useCallback } from 'react';
import './DriverUpdates.css';
import { apiClient } from '../utils/apiClient';
import { API_BASE_URL } from '../config';
import UpdateStatusModal from './UpdateStatusModal';
import CopyNumbersModal from './CopyNumbersModal';
import {
  getCurrentTimeInAppTZ,
  formatEDTDate,
  parseAppTzDateTimeToEpochMs,
} from '../utils/timeUtils';

const DriverUpdates = ({ onBack, user, serverTimeOffset = 0 }) => {
    const [activeTab, setActiveTab] = useState('daily');
    const [view, setView] = useState('all'); // Initialize to 'all' instead of null
    const [dispatchers, setDispatchers] = useState([]);
    const [drivers, setDrivers] = useState({
        need_update: [],
        updated: [],
        no_need_update: []
    });
    const [monthlyDrivers, setMonthlyDrivers] = useState([]);
    const [heatmapData, setHeatmapData] = useState(null);
    const [selectedMonth, setSelectedMonth] = useState(
    new Date().toISOString().slice(0, 7)
  );
    const [isLoading, setIsLoading] = useState(true);
    const [isAutoUpdating, setIsAutoUpdating] = useState(false);
    const [autoUpdateResult, setAutoUpdateResult] = useState(null);
    const [error, setError] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [selectedTruck, setSelectedTruck] = useState(null);
    const [showCopyNumbersModal, setShowCopyNumbersModal] = useState(false);
    const [driversToCopy, setDriversToCopy] = useState([]);
    const [isViewInitialized, setIsViewInitialized] = useState(false);

    // Initialize default view based on user role
    useEffect(() => {
        if (user) {
            if (user.role === 'dispatcher') {
                setView(user.id.toString()); // Default to current dispatcher ID for dispatchers
            }
            // For admin and manager roles, keep the default 'all' value
            setIsViewInitialized(true);
        }
    }, [user]);

    // Fetch dispatchers on component mount
    useEffect(() => {
        const fetchDispatchers = async () => {
            try {
                const response = await apiClient(`${API_BASE_URL}/users/dispatchers`);
                const data = await response.json();
                if (Array.isArray(data)) {
                    setDispatchers(data);
                }
            } catch (err) {
                console.error('Error fetching dispatchers:', err);
            }
        };

        fetchDispatchers();
    }, []);

    const autoUpdateDriverStatuses = useCallback(async () => {
        setIsAutoUpdating(true);
        try {
            const url = `${API_BASE_URL}/driver-updates/auto-update?view=${view}`;
            const response = await apiClient(url, {
                method: 'POST'
            });
            const data = await response.json();
            
            if (data.success) {
                console.log(`Auto-updated ${data.updated_status_count} statuses and cleared ${data.cleared_no_need_count} no-need-update records`);
                if (data.updated_status_count > 0 || data.cleared_no_need_count > 0) {
                    setAutoUpdateResult({
                        updatedStatuses: data.updated_status_count,
                        clearedNoNeed: data.cleared_no_need_count
                    });
                    // Clear the result after 5 seconds
                    setTimeout(() => setAutoUpdateResult(null), 5000);
                }
            } else {
                console.error('Auto-update failed:', data.message);
            }
        } catch (err) {
            console.error('Error during auto-update:', err);
        } finally {
            setIsAutoUpdating(false);
        }
    }, [view]);

    const loadDriverStatuses = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        
        try {
            // First, auto-update driver statuses
            await autoUpdateDriverStatuses();
            
            // Then load the updated data
            const response = await apiClient(`${API_BASE_URL}/driver-updates/status?tab=${activeTab}&view=${view}`);
            const data = await response.json();
            
            if (data.success) {
                if (activeTab === 'daily') {
                    setDrivers(data.drivers);
                } else {
                    setMonthlyDrivers(data.drivers);
                }
            } else {
                setError(data.message || 'Failed to load driver statuses');
            }
        } catch (err) {
            console.error('Error loading driver statuses:', err);
            setError('Error loading driver statuses');
        } finally {
            setIsLoading(false);
        }
    }, [activeTab, view, autoUpdateDriverStatuses]);

    const loadHeatmapData = useCallback(async () => {
        try {
            const response = await apiClient(`${API_BASE_URL}/driver-updates/heatmap?view=${view}&month=${selectedMonth}`);
            const data = await response.json();
            
            if (data.success) {
                setHeatmapData(data.heatmap_data);
            } else {
                setError(data.message || 'Failed to load heatmap data');
            }
        } catch (err) {
            console.error('Error loading heatmap data:', err);
            setError('Error loading heatmap data');
        }
    }, [view, selectedMonth]);

    // Load data when component mounts or parameters change
    useEffect(() => {
        // Only load data after view is initialized
        if (!isViewInitialized) return;

        if (activeTab === 'heatmap') {
            // Always reload heatmap when month/view changes
            loadHeatmapData();
        } else {
            loadDriverStatuses();
        }
    }, [activeTab, view, selectedMonth, loadDriverStatuses, loadHeatmapData, isViewInitialized]);

    const openModal = useCallback((truck) => {
        setSelectedTruck(truck);
        setShowModal(true);
    }, []);

    const closeModal = useCallback(() => {
        setShowModal(false);
        setSelectedTruck(null);
    }, []);

    const openCopyNumbersModal = useCallback((drivers) => {
        setDriversToCopy(drivers);
        setShowCopyNumbersModal(true);
    }, []);

    // Check if user has permission to set no update for a specific driver
    const canSetNoUpdate = useCallback((driver) => {
        // Admin, manager, and dispatcher can always set no update
        if (user?.role === 'admin' || user?.role === 'manager' || user?.role === 'dispatcher') {
            return true;
        }
        
        return false;
    }, [user]);

    const closeCopyNumbersModal = useCallback(() => {
        setShowCopyNumbersModal(false);
        setDriversToCopy([]);
    }, []);

    const handleSaveStatus = useCallback(async (modalData) => {
        if (!selectedTruck) return;

        try {
            const response = await apiClient(`${API_BASE_URL}/trucks/${selectedTruck.ID}/update-no-need-status`, {
                method: 'POST',
                body: JSON.stringify(modalData)
            });
            const data = await response.json();
            
            if (data.success) {
                closeModal();
                loadDriverStatuses(); // Refresh data
            } else {
                setError(data.message || 'Failed to update status');
            }
        } catch (err) {
            console.error('Error updating status:', err);
            setError('Error updating status');
        }
    }, [selectedTruck, closeModal, loadDriverStatuses]);

    const handleClearStatus = useCallback(async (truck) => {
        try {
            const response = await apiClient(`${API_BASE_URL}/trucks/${truck.ID}/clear-no-need-status`, {
                method: 'POST'
            });
            const data = await response.json();
            
            if (data.success) {
                loadDriverStatuses(); // Refresh data
            } else {
                setError(data.message || 'Failed to clear status');
            }
        } catch (err) {
            console.error('Error clearing status:', err);
            setError('Error clearing status');
        }
    }, [loadDriverStatuses]);

    const handleDeleteDriver = useCallback(async (driver) => {
        if (!window.confirm(`Are you sure you want to delete driver ${driver.DriverName} (Truck #${driver.TruckNumber})? This action cannot be undone.`)) {
            return;
        }

        try {
            const response = await apiClient(`${API_BASE_URL}/trucks/${driver.ID}`, {
                method: 'DELETE'
            });
            const data = await response.json();
            
            if (data.success) {
                loadDriverStatuses(); // Refresh data
            } else {
                setError(data.message || 'Failed to delete driver');
            }
        } catch (err) {
            console.error('Error deleting driver:', err);
            setError('Error deleting driver');
        }
    }, [loadDriverStatuses]);

    const normalizeUtcString = (s) => {
        if (!s) return s;
        if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) {
            return s.replace(' ', 'T') + 'Z';
        }
        return s;
    };

    const formatUntilDate = useCallback((dateString) => {
        if (!dateString) return 'N/A';
        const normalized = normalizeUtcString(dateString);
        let ms = NaN;
        const hasTz = /Z$/i.test(normalized) || /[+-]\d{2}:?\d{2}$/.test(normalized);
        if (hasTz) {
            ms = Date.parse(normalized);
        } else {
            ms = parseAppTzDateTimeToEpochMs(normalized);
        }
        if (!Number.isFinite(ms)) return 'Invalid date';
        return formatEDTDate(new Date(ms));
    }, []);

    // Removed unused formatWhenWillBeThere (was not referenced by UI)

    const getUpdateStatusColor = useCallback((hasUpdate) => {
        return hasUpdate ? '#22c55e' : '#e5e7eb'; // Green for updated, gray for not updated
    }, []);

    // Handle view change
    const handleViewChange = useCallback((newView) => {
        setView(newView);
    }, []);

    const DriversTable = useCallback(({ drivers, category, showActions = true }) => {
        // Sort drivers for monthly review (oldest first)
        const sortedDrivers = category === 'monthly_review' && drivers.length > 0 && drivers[0].hasOwnProperty('WhenWillBeThere') 
            ? [...drivers].sort((a, b) => {
                const strA = a.WhenWillBeThere || '';
                const strB = b.WhenWillBeThere || '';
                if (strA < strB) return -1;
                if (strA > strB) return 1;
                return 0;
            })
            : drivers;

        const calculateDaysSinceUpdate = (dateString) => {
            if (!dateString) return null;
            const now = getCurrentTimeInAppTZ(serverTimeOffset);

            const tryParse = (s) => {
                // 1) Try robust App TZ parser
                const ms = parseAppTzDateTimeToEpochMs(s);
                if (Number.isFinite(ms)) return new Date(ms);
                // 2) Try to extract common date patterns
                const patterns = [
                    /(\d{4})[-/.](\d{2})[-/.](\d{2})(?:[ T](\d{2}):(\d{2}))?/, // YYYY-MM-DD
                    /(\d{2})[-/.](\d{2})[-/.](\d{4})(?:[ T](\d{2}):(\d{2}))?/, // MM-DD-YYYY or MM/DD/YYYY
                ];
                for (const rx of patterns) {
                    const m = s.match(rx);
                    if (m) {
                        if (rx === patterns[0]) {
                            const Y = m[1];
                            const M = m[2];
                            const D = m[3];
                            const h = m[4] || '00';
                            const mi = m[5] || '00';
                            const iso = `${Y}-${M}-${D}T${h}:${mi}:00`;
                            const ms2 = parseAppTzDateTimeToEpochMs(iso);
                            if (Number.isFinite(ms2)) return new Date(ms2);
                        } else {
                            const M = m[1];
                            const D = m[2];
                            const Y = m[3];
                            const h = m[4] || '00';
                            const mi = m[5] || '00';
                            const iso = `${Y}-${M}-${D}T${h}:${mi}:00`;
                            const ms2 = parseAppTzDateTimeToEpochMs(iso);
                            if (Number.isFinite(ms2)) return new Date(ms2);
                        }
                    }
                }
                return null;
            };

            const parsed = tryParse(String(dateString));
            if (!parsed) return null;

            const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
            const dayStartNow = startOf(now);
            const dayStartUpd = startOf(parsed);
            const diffDays = Math.floor((dayStartNow - dayStartUpd) / (1000 * 60 * 60 * 24));
            return diffDays >= 0 ? diffDays : 0;
        };

        return (
            <div className="drivers-table-container">
                {drivers.length === 0 ? (
                    <div className="empty-table-message">
                        {category === 'need_update' && 'No drivers need updates'}
                        {category === 'updated' && 'No updated drivers'}
                        {category === 'no_need_update' && 'No drivers marked as no update needed'}
                    </div>
                ) : (
                    <table className="drivers-table">
                        <thead>
                            <tr>
                                <th>Truck #</th>
                                <th>Driver Name</th>
                                <th>Phone</th>
                                <th>Status</th>
                                <th>Location</th>
                                <th>{category === 'monthly_review' ? 'Last Updated' : 'Updated'}</th>
                                {category === 'monthly_review' && <th>Days Ago</th>}
                                {category === 'no_need_update' && <th>Reason</th>}
                                {category === 'no_need_update' && <th>Until Date</th>}
                                {showActions && <th>Actions</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {sortedDrivers.map(driver => {
                                const daysSinceUpdate = category === 'monthly_review' ? calculateDaysSinceUpdate(driver.WhenWillBeThere) : null;
                                
                                return (
                                    <tr key={driver.ID}>
                                        <td className="truck-number-cell">#{driver.TruckNumber}</td>
                                        <td className="driver-name-cell">{driver.DriverName || 'No driver assigned'}</td>
                                        <td className="phone-cell">{driver.contactphone || driver.CellPhone || 'N/A'}</td>
                                        <td className="status-cell">{driver.Status || 'N/A'}</td>
                                        <td className="location-cell">{driver.CityStateZip || 'N/A'}</td>
                                        <td className="will-be-there-cell">
                                            {category === 'monthly_review' 
                                                ? (driver.WhenWillBeThere || 'N/A')
                                                : (driver.WhenWillBeThere || 'N/A')
                                            }
                                        </td>
                                        {category === 'monthly_review' && (
                                            <td className="days-ago-cell">
                                                {daysSinceUpdate !== null ? (
                                                    <span className={`days-ago ${daysSinceUpdate > 30 ? 'overdue' : ''}`}>
                                                        {daysSinceUpdate} days
                                                    </span>
                                                ) : (
                                                    <span className="days-ago overdue">Never</span>
                                                )}
                                            </td>
                                        )}
                                        {category === 'no_need_update' && (
                                            <td className="reason-cell">{driver.no_need_update_reason || 'N/A'}</td>
                                        )}
                                        {category === 'no_need_update' && (
                                            <td className="until-date-cell">{formatUntilDate(driver.no_need_update_until)}</td>
                                        )}
                                        {showActions && (
                                            <td className="actions-cell">
                                                {category === 'need_update' && canSetNoUpdate(driver) && (
                                                    <button 
                                                        className="driver-updates-page-btn driver-updates-page-btn-primary"
                                                        onClick={() => openModal(driver)}
                                                    >
                                                        Set No Update
                                                    </button>
                                                )}
                                                {category === 'monthly_review' && (
                                                    <button 
                                                        className="driver-updates-page-btn driver-updates-page-btn-danger"
                                                        onClick={() => handleDeleteDriver(driver)}
                                                    >
                                                        Delete
                                                    </button>
                                                )}
                                                {category === 'no_need_update' && (
                                                    <>
                                                        {canSetNoUpdate(driver) && (
                                                            <>
                                                                <button 
                                                                    className="driver-updates-page-btn driver-updates-page-btn-secondary"
                                                                    onClick={() => handleClearStatus(driver)}
                                                                >
                                                                    Clear
                                                                </button>
                                                                <button 
                                                                    className="driver-updates-page-btn driver-updates-page-btn-primary"
                                                                    onClick={() => openModal(driver)}
                                                                >
                                                                    Edit
                                                                </button>
                                                            </>
                                                        )}
                                                    </>
                                                )}
                                            </td>
                                        )}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        );
    }, [formatUntilDate, openModal, handleClearStatus, handleDeleteDriver, canSetNoUpdate, serverTimeOffset]);

    const DailyUpdatesTab = useCallback(() => (
        <div className="daily-updates">
            <div className="categories-grid">
                <div className="category-section need-update">
                    <div className="category-header">
                        <div className="category-header-content">
                            <h3>Need to Update ({drivers.need_update.length})</h3>
                            {drivers.need_update.length > 0 && (
                                <button 
                                    className="copy-numbers-btn"
                                    onClick={() => openCopyNumbersModal(drivers.need_update)}
                                    title="Copy phone numbers of all drivers in this category"
                                >
                                    Copy numbers
                                </button>
                            )}
                        </div>
                    </div>
                    <DriversTable 
                        drivers={drivers.need_update}
                        category="need_update"
                        showActions={true}
                    />
                </div>

                <div className="category-section updated">
                    <div className="category-header">
                        <h3>Updated ({drivers.updated.length})</h3>
                    </div>
                    <DriversTable 
                        drivers={drivers.updated}
                        category="updated"
                        showActions={false}
                    />
                </div>

                <div className="category-section no-need-update">
                    <div className="category-header">
                        <h3>No Need to Update ({drivers.no_need_update.length})</h3>
                    </div>
                    <DriversTable 
                        drivers={drivers.no_need_update}
                        category="no_need_update"
                        showActions={true}
                    />
                </div>
            </div>
        </div>
    ), [drivers, openCopyNumbersModal]);

    const MonthlyReviewTab = useCallback(() => (
        <div className="monthly-review">
            <div className="monthly-review-header">
                <h3>Drivers Not Updated for Over a Month ({monthlyDrivers.length})</h3>
            </div>
            <DriversTable 
                drivers={monthlyDrivers}
                category="monthly_review"
                showActions={true}
            />
        </div>
    ), [monthlyDrivers]);

    const HeatmapTab = useCallback(() => (
        <div className="driver-heatmap-tab">
            <div className="driver-heatmap-header">
                <div className="driver-heatmap-controls">
                    <label>Month:</label>
                    <input 
                        type="month" 
                        value={selectedMonth} 
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="driver-month-selector"
                    />
                </div>
                <div className="driver-heatmap-legend">
                    <div className="driver-heatmap-legend-item">
                        <div className="driver-heatmap-legend-color" style={{backgroundColor: '#22c55e'}}></div>
                        <span>Updated</span>
                    </div>
                    <div className="driver-heatmap-legend-item">
                        <div className="driver-heatmap-legend-color" style={{backgroundColor: '#e5e7eb'}}></div>
                        <span>Not Updated</span>
                    </div>
                </div>
            </div>

            {heatmapData && (
                <div className="driver-heatmap-container">
                    <div className="driver-heatmap-info">
                        <div className="driver-heatmap-sorting-info">
                            <span className="driver-sorting-indicator">📊 Sorted by total updates (highest to lowest)</span>
                        </div>
                    </div>
                    <div className="driver-heatmap-scroll">
                        {/* Header with day numbers */}
                        <div className="driver-heatmap-header-row">
                            <div className="driver-heatmap-truck-header">Truck #</div>
                            <div className="driver-heatmap-driver-header">Driver</div>
                            {heatmapData.month_days.map(day => (
                                <div 
                                    key={day.date} 
                                    className={`driver-heatmap-day-header ${day.is_today ? 'today' : ''} ${day.is_weekend ? 'weekend' : ''}`}
                                    title={day.date}
                                >
                                    {day.day}
                                </div>
                            ))}
                        </div>

                        {/* Heatmap rows for each truck */}
                        {heatmapData.truck_data.map((truck, truckIndex) => (
                            <div key={truck.id} className="driver-heatmap-row">
                                <div className="driver-heatmap-truck-number">
                                    <span className="driver-heatmap-truck-number-text">
                                        #{truck.truck_number}
                                    </span>
                                    <span className="driver-heatmap-total-updates">
                                        ({truck.total_updates})
                                    </span>
                                </div>
                                <div className="driver-heatmap-driver-name">
                                    <span className="driver-heatmap-driver-name-text">
                                        {truck.driver_name || 'No driver assigned'}
                                    </span>
                                </div>
                                {heatmapData.month_days.map(day => {
                                    const dayStats = truck.daily_stats[day.date] || {updates: 0, has_update: false};
                                    
                                    return (
                                        <div 
                                            key={day.date}
                                            className={`driver-heatmap-cell ${day.is_today ? 'today' : ''} ${day.is_future ? 'future' : ''}`}
                                            style={{
                                                backgroundColor: day.is_future ? '#f8fafc' : getUpdateStatusColor(dayStats.has_update),
                                                opacity: day.is_future ? 0.4 : 1
                                            }}
                                            title={`Truck #${truck.truck_number}\n${truck.driver_name || 'No driver assigned'}\n${day.date}\nUpdates: ${dayStats.updates}`}
                                        >
                                            {!day.is_future && (
                                                <div className="driver-heatmap-cell-content">
                                                    <span className="driver-heatmap-updates">{dayStats.updates}</span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    ), [heatmapData, selectedMonth, getUpdateStatusColor]);

    return (
        <div className="driver-updates-page">
            <div className="page-header">
                <div className="driver-updates-header-left">
                    <h2>Driver Updates</h2>
                </div>
                
                <div className="driver-updates-header-controls">
                    <div className="view-selector">
                        <label>View:</label>
                        <select value={view} onChange={(e) => handleViewChange(e.target.value)}>
                            <option value="all">All Drivers</option>
                            <option value="unassigned">Do Not Assigned</option>
                            {dispatchers.map(dispatcher => (
                                <option key={dispatcher.id} value={dispatcher.id}>
                                    {dispatcher.full_name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <button onClick={onBack} className="back-btn">
                        ← Back to Main
                    </button>
                </div>
            </div>

            <div className="tabs-container">
                <div className="tabs">
                    <button 
                        className={`tab ${activeTab === 'daily' ? 'active' : ''}`}
                        onClick={() => setActiveTab('daily')}
                    >
                        Daily Updates
                    </button>
                    <button 
                        className={`tab ${activeTab === 'monthly' ? 'active' : ''}`}
                        onClick={() => setActiveTab('monthly')}
                    >
                        Monthly Review
                    </button>
                    <button 
                        className={`tab ${activeTab === 'heatmap' ? 'active' : ''}`}
                        onClick={() => setActiveTab('heatmap')}
                    >
                        Heatmap
                    </button>
                </div>
            </div>

            {error && (
                <div className="error-message">
                    {error}
                    <button onClick={() => setError(null)}>×</button>
                </div>
            )}

            {autoUpdateResult && (
                <div className="success-message">
                    <span>✓ Auto-updated {autoUpdateResult.updatedStatuses} driver statuses and cleared {autoUpdateResult.clearedNoNeed} no-need-update records</span>
                    <button onClick={() => setAutoUpdateResult(null)}>×</button>
                </div>
            )}

            <div className="content">
                {isAutoUpdating && (
                    <div className="auto-updating">
                        <div className="auto-updating-spinner"></div>
                        Auto-updating driver statuses...
                    </div>
                )}
                {isLoading ? (
                    <div className="loading">Loading driver statuses...</div>
                ) : (
                    <>
                        {activeTab === 'daily' && <DailyUpdatesTab />}
                        {activeTab === 'monthly' && <MonthlyReviewTab />}
                        {activeTab === 'heatmap' && <HeatmapTab />}
                    </>
                )}
            </div>

            <UpdateStatusModal
                show={showModal}
                onClose={closeModal}
                truck={selectedTruck}
                onSave={handleSaveStatus}
            />
            
            <CopyNumbersModal
                show={showCopyNumbersModal}
                onClose={closeCopyNumbersModal}
                drivers={driversToCopy}
            />
        </div>
    );
};

export default DriverUpdates;
