import React, { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../utils/apiClient';
import { API_BASE_URL } from '../config';
import { useModalScrollLock } from '../utils/modalScrollLock';
import './LocationHistoryModal.css';
import { formatEDTTimeForModal } from '../utils/timeUtils';
import { usePermissions } from '../context/PermissionsContext';

const LocationHistoryModal = ({ isOpen, onClose, truckId, truckNumber, driverName }) => {
    const { has } = usePermissions();
    const [history, setHistory] = useState([]);
    const [error, setError] = useState(null);
    const [pagination, setPagination] = useState({
        current_page: 1,
        total_pages: 0,
        total_records: 0,
        per_page: 5 // Fixed to 5 items per page
    });

    const fetchActivityHistory = useCallback(async (page) => {
        try {
            setError(null);
            
            const response = await apiClient(`${API_BASE_URL}/trucks/${truckId}/location-history?page=${page}&limit=5`);
            if (!response.ok) {
                throw new Error('Failed to fetch location history.');
            }
            
            const data = await response.json();
            setHistory(data.data);
            setPagination(data.pagination);
        } catch (err) {
            setError(err.message);
        }
    }, [truckId]);

    useEffect(() => {
        if (isOpen && truckId) {
            if (has('trucks.history.read')) {
                fetchActivityHistory(1);
            } else {
                setError('You do not have permission to view location history.');
            }
        }
    }, [isOpen, truckId, fetchActivityHistory, has]);

    // Prevent body scroll when modal is open
    useModalScrollLock(isOpen);

    const handlePageChange = useCallback((page) => {
        fetchActivityHistory(page);
    }, [fetchActivityHistory]);

    const handlePreviousPage = useCallback(() => {
        if (pagination.current_page > 1) {
            handlePageChange(pagination.current_page - 1);
        }
    }, [handlePageChange, pagination.current_page]);

    const handleNextPage = useCallback(() => {
        if (pagination.current_page < pagination.total_pages) {
            handlePageChange(pagination.current_page + 1);
        }
    }, [handlePageChange, pagination.current_page, pagination.total_pages]);

    const formatDate = useCallback((dateString) => {
        if (!dateString) return 'N/A';
        // Simple date formatting - no need for complex UTC conversion for display
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return dateString; // Return original if invalid
            return formatEDTTimeForModal(dateString);
        } catch (e) {
            return dateString; // Return original if error
        }
    }, []);

    // Show WhenWillBeThere values as-is (no formatting)

    const TimelineItem = React.memo(({
        id,
        created_at,
        changed_by_username,
        old_location,
        new_location,
        old_whenwillbethere,
        new_whenwillbethere,
        old_status,
        new_status,
        showDivider
    }) => {
        // Simple calculations - no need for complex memoization for simple text
        const locationChanged = old_location !== new_location;
        const whenChanged = old_whenwillbethere !== new_whenwillbethere;
        const statusChanged = old_status !== new_status;
        const hasChanges = locationChanged || whenChanged || statusChanged;
        const changeCount = [locationChanged, whenChanged, statusChanged].filter(Boolean).length;

        return (
            <div className="timeline-item-compact">
                <div className="timeline-header-compact">
                    <span className="timeline-date">📅 {formatDate(created_at)}</span>
                    <span className="timeline-user">👤 {changed_by_username}</span>
                    {hasChanges && (
                        <span className="activity-badge">
                            ⚡ {changeCount} change{changeCount > 1 ? 's' : ''}
                        </span>
                    )}
                </div>
                
                <div className="timeline-content-compact">
                    {/* Location */}
                    <div className="field-row">
                        {locationChanged ? (
                            <div className="field-change-multiline">
                                <div className="field-label-line">📍 <strong>Location:</strong></div>
                                <div className="field-change-line">
                                    <span className="old-value-inline">{old_location || 'Not set'}</span>
                                    <span className="arrow-inline"> → </span>
                                    <span className="new-value-inline">{new_location || 'Not set'}</span>
                                </div>
                            </div>
                        ) : (
                            <div className="field-unchanged-multiline">
                                <div className="field-label-line">📍 <strong>Location:</strong></div>
                                <div className="field-value-line">{new_location || old_location || 'Not set'}</div>
                            </div>
                        )}
                    </div>
                    
                    {/* When Will Be There */}
                    <div className="field-row">
                        {whenChanged ? (
                            <div className="field-change-multiline">
                                <div className="field-label-line">⏰ <strong>When Will Be There:</strong></div>
                                <div className="field-change-line">
                                    <span className="old-value-inline">{old_whenwillbethere || 'Not set'}</span>
                                    <span className="arrow-inline"> → </span>
                                    <span className="new-value-inline">{new_whenwillbethere || 'Not set'}</span>
                                </div>
                            </div>
                        ) : (
                            <div className="field-unchanged-multiline">
                                <div className="field-label-line">⏰ <strong>When Will Be There:</strong></div>
                                <div className="field-value-line">{new_whenwillbethere || old_whenwillbethere || 'Not set'}</div>
                            </div>
                        )}
                    </div>
                    
                    {/* Status */}
                    <div className="field-row">
                        {statusChanged ? (
                            <div className="field-change-multiline">
                                <div className="field-label-line">📊 <strong>Status:</strong></div>
                                <div className="field-change-line">
                                    <span className="old-value-inline">{old_status || 'Not set'}</span>
                                    <span className="arrow-inline"> → </span>
                                    <span className="new-value-inline">{new_status || 'Not set'}</span>
                                </div>
                            </div>
                        ) : (
                            <div className="field-unchanged-multiline">
                                <div className="field-label-line">📊 <strong>Status:</strong></div>
                                <div className="field-value-line">{new_status || old_status || 'Not set'}</div>
                            </div>
                        )}
                    </div>
                </div>

                {showDivider && <div className="timeline-divider-compact"></div>}
            </div>
        );
    });

    // Removed unused getChangedFields; logic moved into memoized TimelineItem

    const handleClose = useCallback(() => {
        setHistory([]);
        setError(null);
        onClose();
    }, [onClose]);

    const handleModalClick = useCallback((e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        if (e && e.preventDefault) e.preventDefault();
    }, []);

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={handleClose}>
            <div className="modal-content" onClick={handleModalClick}>
                <div className="modal-header">
                    <h3>Activity History - {driverName || truckNumber}</h3>
                    <div className="modal-header-info">
                        <button className="modal-close" onClick={handleClose}>×</button>
                    </div>
                </div>
                
                <div className="modal-body">
                    {error && (
                        <div className="error-message">
                            <p>Error: {error}</p>
                        </div>
                    )}
                    
                    {!error && history.length === 0 && (
                        <div className="empty-state">
                            <p>No activity history available</p>
                        </div>
                    )}
                    
                    {!error && history.length > 0 && (
                        <div className="location-timeline">
                            {history.map((record, index) => (
                                <TimelineItem
                                    key={`${record.id}-${record.created_at}`}
                                    id={record.id}
                                    created_at={record.created_at}
                                    changed_by_username={record.changed_by_username}
                                    old_location={record.old_location}
                                    new_location={record.new_location}
                                    old_whenwillbethere={record.old_whenwillbethere || null}
                                    new_whenwillbethere={record.new_whenwillbethere || null}
                                    old_status={record.old_status}
                                    new_status={record.new_status}
                                    showDivider={index < history.length - 1}
                                />
                            ))}
                        </div>
                    )}
                </div>
                
                {!error && pagination.total_pages > 1 && (
                    <div className="modal-footer">
                        <div className="pagination">
                            <button 
                                className="pagination-btn"
                                disabled={pagination.current_page === 1}
                                onClick={handlePreviousPage}
                            >
                                Previous
                            </button>
                            
                            <span className="pagination-info">
                                Page {pagination.current_page} of {pagination.total_pages}
                            </span>
                            
                            <button 
                                className="pagination-btn"
                                disabled={pagination.current_page === pagination.total_pages}
                                onClick={handleNextPage}
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default LocationHistoryModal; 