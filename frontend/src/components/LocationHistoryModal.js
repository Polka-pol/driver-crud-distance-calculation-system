import React, { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../utils/apiClient';
import { API_BASE_URL } from '../config';
import { useModalScrollLock } from '../utils/modalScrollLock';
import './LocationHistoryModal.css';

const LocationHistoryModal = ({ isOpen, onClose, truckId, truckNumber, driverName }) => {
    const [history, setHistory] = useState([]);
    const [error, setError] = useState(null);
    const [pagination, setPagination] = useState({
        current_page: 1,
        total_pages: 0,
        total_records: 0,
        per_page: 10
    });

    const fetchActivityHistory = useCallback(async (page) => {
        try {
            setError(null);
            
            const response = await apiClient(`${API_BASE_URL}/trucks/${truckId}/location-history?page=${page}`);
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
            fetchActivityHistory(1);
        }
    }, [isOpen, truckId, fetchActivityHistory]);

    // Prevent body scroll when modal is open
    useModalScrollLock(isOpen);

    const handlePageChange = (page) => {
        fetchActivityHistory(page);
    };

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${month}.${day} ${hours}:${minutes}`;
    };

    const formatDateTime = (dateString) => {
        if (!dateString) return 'Not set';
        const date = new Date(dateString);
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const year = date.getFullYear();
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${month}/${day}/${year} ${hours}:${minutes}`;
    };

    const renderChangeField = (label, oldValue, newValue, emoji, isHighlighted = false) => {
        const hasChanged = oldValue !== newValue;
        const displayValue = newValue || oldValue || 'Not set';
        
        if (hasChanged && isHighlighted) {
            return (
                <div className="field-change-multiline">
                    <div className="field-label-line">
                        {emoji} <strong>{label}:</strong>
                    </div>
                    <div className="field-change-line">
                        <span className="old-value-inline">{oldValue || 'Not set'}</span>
                        <span className="arrow-inline"> → </span>
                        <span className="new-value-inline">{newValue || 'Not set'}</span>
                    </div>
                </div>
            );
        } else {
            return (
                <div className="field-unchanged-multiline">
                    <div className="field-label-line">
                        {emoji} <strong>{label}:</strong>
                    </div>
                    <div className="field-value-line">
                        {displayValue}
                    </div>
                </div>
            );
        }
    };

    const getChangedFields = (record) => {
        const changes = [];
        
        // Check location change
        if (record.old_location !== record.new_location) {
            changes.push('location');
        }
        
        // Check whenwillbethere change
        if (record.old_whenwillbethere !== record.new_whenwillbethere) {
            changes.push('whenwillbethere');
        }
        
        // Check status change
        if (record.old_status !== record.new_status) {
            changes.push('status');
        }
        
        return changes;
    };

    const handleClose = () => {
        setHistory([]);
        setError(null);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={handleClose}>
            <div className="modal-content" onClick={(e) => {
          if (e && e.stopPropagation) e.stopPropagation();
          if (e && e.preventDefault) e.preventDefault();
        }}>
                <div className="modal-header">
                    <h3>Activity History - {driverName || truckNumber}</h3>
                    <button className="modal-close" onClick={handleClose}>×</button>
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
                            {history.map((record, index) => {
                                const changedFields = getChangedFields(record);
                                const hasChanges = changedFields.length > 0;
                                
                                return (
                                    <div key={record.id} className="timeline-item-compact">
                                        <div className="timeline-header-compact">
                                            <span className="timeline-date">📅 {formatDate(record.created_at)}</span>
                                            <span className="timeline-user">👤 {record.changed_by_username}</span>
                                            {hasChanges && (
                                                <span className="activity-badge">
                                                    ⚡ {changedFields.length} change{changedFields.length > 1 ? 's' : ''}
                                                </span>
                                            )}
                                        </div>
                                        
                                        <div className="timeline-content-compact">
                                            {/* Location */}
                                            <div className="field-row">
                                                {renderChangeField(
                                                    'Location',
                                                    record.old_location,
                                                    record.new_location,
                                                    '📍',
                                                    changedFields.includes('location')
                                                )}
                                            </div>
                                            
                                            {/* When Will Be There */}
                                            <div className="field-row">
                                                {renderChangeField(
                                                    'When Will Be There',
                                                    formatDateTime(record.old_whenwillbethere),
                                                    formatDateTime(record.new_whenwillbethere),
                                                    '⏰',
                                                    changedFields.includes('whenwillbethere')
                                                )}
                                            </div>
                                            
                                            {/* Status */}
                                            <div className="field-row">
                                                {renderChangeField(
                                                    'Status',
                                                    record.old_status,
                                                    record.new_status,
                                                    '📊',
                                                    changedFields.includes('status')
                                                )}
                                            </div>
                                        </div>
                                        
                                        {index < history.length - 1 && <div className="timeline-divider-compact"></div>}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
                
                {!error && pagination.total_pages > 1 && (
                    <div className="modal-footer">
                        <div className="pagination">
                            <button 
                                className="pagination-btn"
                                disabled={pagination.current_page === 1}
                                onClick={() => handlePageChange(pagination.current_page - 1)}
                            >
                                Previous
                            </button>
                            
                            <span className="pagination-info">
                                Page {pagination.current_page} of {pagination.total_pages}
                            </span>
                            
                            <button 
                                className="pagination-btn"
                                disabled={pagination.current_page === pagination.total_pages}
                                onClick={() => handlePageChange(pagination.current_page + 1)}
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