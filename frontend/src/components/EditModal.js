import React, { useState, useEffect } from 'react';
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import AddressSearchBar from './AddressSearchBar';
import { useModalScrollLock } from '../utils/modalScrollLock';
import UpdateStatusModal from './UpdateStatusModal';
import { apiClient } from '../utils/apiClient';
import { API_BASE_URL } from '../config';
import {
  formatEDTTimeForModal,
  getCurrentTimeInAppTZ,
  parseAppTzDateTimeToEpochMs,
  formatDateTimeInAppTZ,
} from '../utils/timeUtils';
import './EditModal.css';
import { usePermissions } from '../context/PermissionsContext';

const CustomDateInput = React.forwardRef(({ value, onClick }, ref) => (
  <div style={{ position: "relative", width: "100%" }}>
    <input
      className="edit-input"
      onClick={onClick}
      value={value}
      readOnly
      ref={ref}
      placeholder="Select date"
    />
  </div>
));

const EditModal = ({ 
  editedTruck, 
  userRole,
  user,
  onClose, 
  onSave, 
  onDelete, 
  onSetNoUpdate,
  serverTimeOffset = 0
}) => {
  const { has } = usePermissions();
  const [showAdditionalInfo, setShowAdditionalInfo] = useState(false);
  const [showNoUpdateModal, setShowNoUpdateModal] = useState(false);
  const [dispatchers, setDispatchers] = useState([]);
  const [isLoadingDispatchers, setIsLoadingDispatchers] = useState(false);
  const [form, setForm] = useState(null);

  // Prevent body scroll when modal is open
  useModalScrollLock(!!editedTruck);

  // Initialize local form state and fetch dispatchers when modal opens
  useEffect(() => {
    if (editedTruck) {
      setForm({ ...editedTruck });
      fetchDispatchers();
    }
  }, [editedTruck]);

  const fetchDispatchers = async () => {
    try {
      setIsLoadingDispatchers(true);
      const response = await apiClient(`${API_BASE_URL}/users/dispatchers`);
      if (!response.ok) {
        throw new Error('Failed to fetch dispatchers');
      }
      const data = await response.json();
      setDispatchers(data);
    } catch (error) {
      console.error('Error fetching dispatchers:', error);
    } finally {
      setIsLoadingDispatchers(false);
    }
  };

  // Phone number formatting function
  const formatPhoneNumber = (value) => {
    // Remove all non-digit characters
    const numbers = value.replace(/\D/g, '');
    
    // Limit to 10 digits
    const limitedNumbers = numbers.slice(0, 10);
    
    // Apply formatting
    if (limitedNumbers.length <= 3) {
      return limitedNumbers;
    } else if (limitedNumbers.length <= 6) {
      return `(${limitedNumbers.slice(0, 3)}) ${limitedNumbers.slice(3)}`;
    } else {
      return `(${limitedNumbers.slice(0, 3)}) ${limitedNumbers.slice(3, 6)}-${limitedNumbers.slice(6)}`;
    }
  };

  const handlePhoneChange = (field, value) => {
    const formattedValue = formatPhoneNumber(value);
    setForm(prev => ({ ...prev, [field]: formattedValue }));
  };

  const handleSetNoUpdate = (modalData) => {
    if (onSetNoUpdate) {
      onSetNoUpdate((form?.id || form?.ID), modalData);
    }
    setShowNoUpdateModal(false);
  };

  const handleDeleteNoUpdate = () => {
    if (onSetNoUpdate) {
      onSetNoUpdate((form?.id || form?.ID), null); // null means delete
    }
    setShowNoUpdateModal(false);
  };

  const openNoUpdateModal = () => {
    setShowNoUpdateModal(true);
  };

  // Check if user has permission to set no update
  const canSetNoUpdate = () => has('driver.updates.modify');

  if (!editedTruck || !form) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="edit-modal-content" onClick={e => {
        if (e && e.stopPropagation) e.stopPropagation();
        if (e && e.preventDefault) e.preventDefault();
      }}>
        <div className="modal-header">
          <h2>Edit Driver Information</h2>
          
          {/* Assigned Dispatcher Dropdown */}
          <div className="assigned-dispatcher-section">
            <label>Assigned Dispatcher:</label>
            <select
              value={String(form.assigned_dispatcher_id || '')}
              onChange={e => setForm(prev => ({ ...prev, assigned_dispatcher_id: e.target.value }))}
              className="dispatcher-select"
              disabled={isLoadingDispatchers}
            >
              <option value="">Select Dispatcher</option>
              {dispatchers.map(dispatcher => (
                <option key={dispatcher.id} value={dispatcher.id}>
                  {dispatcher.full_name || dispatcher.username}
                </option>
              ))}
            </select>
          </div>
          
          {/* Last Modified Information - Compact */}
          {(form.updated_by || form.updated_at) && (
            <div className="last-modified-compact">
              <div className="modified-by">{form.updated_by || 'Unknown User'}</div>
              <div className="modified-date">
                {(() => {
                  if (!form.updated_at) return 'Unknown Date';
                  const ms = parseAppTzDateTimeToEpochMs(form.updated_at);
                  return Number.isFinite(ms)
                    ? formatEDTTimeForModal(new Date(ms))
                    : formatEDTTimeForModal(form.updated_at);
                })()}
              </div>
            </div>
          )}
        </div>
        
        <div className="edit-form">
          {/* Basic Information Section */}
          <div className="edit-form-row">
            <label>Truck №</label>
            <input
              type="text"
              value={form.truck_no || ''}
              onChange={e => setForm(prev => ({ ...prev, truck_no: e.target.value }))}
              className="edit-input"
              placeholder="Enter truck number"
              onFocus={(e) => e.target.select()}
            />
          </div>
          <div className="edit-form-row">
            <label>Status</label>
            <select
              value={form.status?.toLowerCase() || ''}
              onChange={e => setForm(prev => ({ ...prev, status: e.target.value }))}
              className="edit-input"
            >
              <option value={form.status?.toLowerCase() || ''} disabled hidden>
                {form.status || 'Select status'}
              </option>
              <option value="Available">Available</option>
              <option value="Available on">Available on</option>
              <option value="Unavailable">Unavailable</option>
              <option value="Local">Local</option>
              <option value="Out of service">Out of Service</option>
              <option value="Updated">Updated</option>
            </select>
          </div>
          <div className="edit-form-row">
            <label>Driver name</label>
            <input
              type="text"
              value={form.driver_name || ''}
              onChange={e => setForm(prev => ({ ...prev, driver_name: e.target.value }))}
              className="edit-input"
              placeholder="Enter driver name"
              onFocus={(e) => e.target.select()}
            />
          </div>
          <div className="edit-form-row">
            <label>City, State zipCode</label>
            <AddressSearchBar
              query={form.city_state_zip || ''}
              onQueryChange={(newQuery) => setForm(prev => ({ ...prev, city_state_zip: newQuery }))}
              onSelect={(selectedAddress) => setForm(prev => ({ ...prev, city_state_zip: selectedAddress }))}
              placeholder="Enter city, state and zip code"
              hideRecentInfo={true}
            />
          </div>

          {/* Full-width fields */}
          <div className="edit-form-row full-width">
            <label>When will be there</label>
            <div className="date-picker-container">
              <DatePicker
                selected={form.arrival_time ? (function(){
                  const str = String(form.arrival_time);
                  const iso = str.includes('T') ? str + ':00' : str.replace(' ', 'T') + ':00';
                  const ms = parseAppTzDateTimeToEpochMs(iso);
                  return Number.isFinite(ms) ? new Date(ms) : null;
                })() : null}
                onChange={date => setForm(prev => ({ ...prev, arrival_time: date ? formatDateTimeInAppTZ(date) : '' }))}
                showTimeSelect
                dateFormat="Pp"
                customInput={<CustomDateInput />}
                placeholderText="Select date and time"
              />
              <button 
                className="now-btn"
                onClick={() => {
                  const now = getCurrentTimeInAppTZ(serverTimeOffset);
                  setForm((prev) => ({
                    ...prev,
                    arrival_time: formatDateTimeInAppTZ(now),
                    status: 'Available',
                  }));
                }}
              >
                NOW
              </button>
            </div>
          </div>
          <div className="edit-form-row full-width">
            <label>Comment</label>
            <textarea
              value={form.comment || ''}
              onChange={e => setForm(prev => ({ ...prev, comment: e.target.value }))}
              className="edit-textarea"
              placeholder="Enter any additional comments"
            />
          </div>

          {/* Toggle button for additional information */}
          <div className="edit-form-row full-width">
            <button 
              className="toggle-additional-btn"
              onClick={() => setShowAdditionalInfo(!showAdditionalInfo)}
            >
              {showAdditionalInfo ? 'Hide Additional Information' : 'Show Additional Information'}
            </button>
          </div>

          {/* Additional Information Section - Hidden by default */}
          {showAdditionalInfo && (
            <>
              <div className="edit-form-row">
                <label>Loads/Mark</label>
                <input
                  type="text"
                  value={form.loads_mark || ''}
                  onChange={e => setForm(prev => ({ ...prev, loads_mark: e.target.value }))}
                  className="edit-input"
                  placeholder="Enter loads/mark"
                  onFocus={(e) => e.target.select()}
                />
              </div>
              <div className="edit-form-row">
                <label>E-mail</label>
                <input
                  type="email"
                  value={form.email || ''}
                  onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
                  className="edit-input"
                  placeholder="Enter email address"
                  onFocus={(e) => e.target.select()}
                />
              </div>
              <div className="edit-form-row">
                <label>Contact phone</label>
                <input
                  type="text"
                  value={form.contactphone || ''}
                  onChange={e => handlePhoneChange('contactphone', e.target.value)}
                  className="edit-input"
                  placeholder="(000) 000-0000"
                  onFocus={(e) => e.target.select()}
                  maxLength="14"
                />
              </div>
              <div className="edit-form-row">
                <label>Cell phone</label>
                <input
                  type="text"
                  value={form.cell_phone || ''}
                  onChange={e => handlePhoneChange('cell_phone', e.target.value)}
                  className="edit-input"
                  placeholder="(000) 000-0000"
                  onFocus={(e) => e.target.select()}
                  maxLength="14"
                />
              </div>
              <div className="edit-form-row">
                <label>Dimensions /Payload</label>
                <input
                  type="text"
                  value={form.dimensions_payload || ''}
                  onChange={e => setForm(prev => ({ ...prev, dimensions_payload: e.target.value }))}
                  className="edit-input"
                  placeholder="Enter dimensions/payload"
                  onFocus={(e) => e.target.select()}
                />
              </div>
            </>
          )}

          {/* Action Buttons */}
          <div className="edit-form-actions">
            <div className="left-actions">
              <button onClick={() => onDelete(form.id)} className="delete-btn" disabled={!has('trucks.delete')}>Delete</button>
              {canSetNoUpdate() && (
                <button onClick={openNoUpdateModal} className="btn btn-primary">Set No Update</button>
              )}
            </div>
            <div className="right-actions">
              <button onClick={onClose} className="cancel-btn">Cancel</button>
              <button onClick={() => onSave(form)} className="save-btn" disabled={!has('trucks.update')}>Save Changes</button>
            </div>
          </div>
        </div>
      </div>

      <UpdateStatusModal
        show={showNoUpdateModal}
        onClose={() => setShowNoUpdateModal(false)}
        truck={{
          ...form,
          ID: form.id,
          TruckNumber: form.truck_no,
          DriverName: form.driver_name,
          no_need_update_reason: form.no_need_update_reason,
          no_need_update_until: form.no_need_update_until,
          no_need_update_comment: form.no_need_update_comment
        }}
        onSave={handleSetNoUpdate}
        onDelete={handleDeleteNoUpdate}
      />
    </div>
  );
};

export default EditModal; 