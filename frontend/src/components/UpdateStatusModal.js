import React, { useState, useEffect } from 'react';
import './DriverUpdates.css';
import { getCurrentEDT } from '../utils/timeUtils';

const UpdateStatusModal = ({ show, onClose, truck, onSave }) => {
    const [reason, setReason] = useState('');
    const [untilDate, setUntilDate] = useState('');
    const [comment, setComment] = useState('');
    const [showError, setShowError] = useState(false);

    // Function to get today's date in YYYY-MM-DD format using EDT
    const getTodayDate = () => {
        const today = getCurrentEDT();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    useEffect(() => {
        if (truck) {
            setReason(truck.no_need_update_reason || '');
            setUntilDate(truck.no_need_update_until || getTodayDate());
            setComment(truck.no_need_update_comment || '');
        } else {
            setReason('');
            setUntilDate(getTodayDate());
            setComment('');
        }
        setShowError(false);
    }, [truck]);

    if (!show) {
        return null;
    }

    const handleSave = () => {
        if (!reason) {
            setShowError(true);
            return;
        }
        
        setShowError(false);
        onSave({
            reason,
            until_date: untilDate,
            comment
        });
    };

    return (
        <div className="driver-updates-modal-overlay" onClick={onClose}>
            <div className="driver-updates-modal-content" onClick={e => e.stopPropagation()}>
                <div className="driver-updates-modal-header">
                    <h3>Update Driver Status</h3>
                    <button className="driver-updates-modal-close" onClick={onClose}>×</button>
                </div>
                
                <div className="driver-updates-modal-body">
                    {truck && (
                        <div className="selected-driver-info">
                            <strong>#{truck.TruckNumber || truck.truck_no} - {truck.DriverName || truck.driver_name}</strong>
                        </div>
                    )}
                    
                    <div className="form-group">
                        <label>Reason for no updates needed: <span className="required">*</span></label>
                        <select 
                            value={reason}
                            onChange={(e) => {
                                setReason(e.target.value);
                                if (showError && e.target.value) {
                                    setShowError(false);
                                }
                            }}
                            className={showError && !reason ? 'error' : ''}
                        >
                            <option value="">Select reason...</option>
                            <option value="On load">Driver is on load</option>
                            <option value="Home time">Driver is on home time</option>
                            <option value="Maintenance">Truck in maintenance</option>
                            <option value="Vacation">Driver on vacation</option>
                            <option value="Medical">Medical reasons</option>
                            <option value="Other">Other</option>
                        </select>
                        {showError && !reason && <div className="error-message">Please select a reason</div>}
                    </div>

                    <div className="form-group">
                        <label>Don't update until (optional):</label>
                        <input 
                            type="date"
                            value={untilDate}
                            onChange={(e) => setUntilDate(e.target.value)}
                        />
                    </div>

                    <div className="form-group">
                        <label>Additional comments:</label>
                        <textarea 
                            rows="3"
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            placeholder="Optional additional notes..."
                        />
                    </div>
                </div>
                
                <div className="driver-updates-modal-footer">
                    <button className="cancel-btn" onClick={onClose}>
                        Cancel
                    </button>
                    <button 
                        className="save-btn"
                        onClick={handleSave}
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
};

export default UpdateStatusModal;
