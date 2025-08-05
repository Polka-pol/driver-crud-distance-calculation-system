import React, { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../utils/apiClient';
import { API_BASE_URL } from '../config';
import './LocationHistoryModal.css';

const LocationHistoryModal = ({ isOpen, onClose, truckId, truckNumber, driverName }) => {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [pagination, setPagination] = useState({
        current_page: 1,
        total_pages: 0,
        total_records: 0,
        per_page: 10
    });

    const fetchLocationHistory = useCallback(async (page) => {
        try {
            setLoading(true);
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
        } finally {
            setLoading(false);
        }
    }, [truckId]);

    useEffect(() => {
        if (isOpen && truckId) {
            fetchLocationHistory(1);
        }
    }, [isOpen, truckId, fetchLocationHistory]);

    // Prevent body scroll when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.classList.add('modal-open');
        } else {
            document.body.classList.remove('modal-open');
        }

        // Cleanup on unmount
        return () => {
            document.body.classList.remove('modal-open');
        };
    }, [isOpen]);

    const handlePageChange = (page) => {
        fetchLocationHistory(page);
    };

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const year = date.getFullYear().toString().slice(-2);
        return `${month}.${day}.${year}`;
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
                    <h3>Location History - {driverName || truckNumber}</h3>
                    <button className="modal-close" onClick={handleClose}>×</button>
                </div>
                
                <div className="modal-body">
                    {loading && (
                        <div className="loading-spinner">
                            <div className="spinner"></div>
                            <p>Loading history...</p>
                        </div>
                    )}
                    
                    {error && (
                        <div className="error-message">
                            <p>Error: {error}</p>
                        </div>
                    )}
                    
                    {!loading && !error && history.length === 0 && (
                        <div className="empty-state">
                            <p>No location change history available</p>
                        </div>
                    )}
                    
                    {!loading && !error && history.length > 0 && (
                        <div className="location-timeline">
                            {history.map((record, index) => (
                                <div key={record.id} className="timeline-item">
                                    <div className="timeline-text">
                                        📅 {formatDate(record.created_at)} | 👤 {record.changed_by_username}
                                    </div>
                                    <div className="timeline-location-change">
                                        📍 {record.old_location} → {record.new_location}
                                    </div>
                                    {index < history.length - 1 && <div className="timeline-divider"></div>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                
                {!loading && !error && pagination.total_pages > 1 && (
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