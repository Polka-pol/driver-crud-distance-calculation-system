import React, { useState } from 'react';
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { format } from "date-fns";
import { FaRegCalendarAlt } from "react-icons/fa";
import AddressSearchBar from './AddressSearchBar';
import { useModalScrollLock } from '../utils/modalScrollLock';
import './EditModal.css';

const CustomDateInput = React.forwardRef(({ value, onClick }, ref) => (
  <div style={{ position: "relative", width: "100%" }}>
    <input
      className="edit-input"
      style={{ paddingRight: "36px" }}
      onClick={onClick}
      value={value}
      readOnly
      ref={ref}
      placeholder="Select date"
    />
    <FaRegCalendarAlt
      style={{
        position: "absolute",
        right: "12px",
        top: "50%",
        transform: "translateY(-50%)",
        color: "#2980b9",
        pointerEvents: "none"
      }}
      size={20}
    />
  </div>
));

const EditModal = ({ 
  editedTruck, 
  userRole,
  onClose, 
  onSave, 
  onDelete, 
  onChange 
}) => {
  const [showAdditionalInfo, setShowAdditionalInfo] = useState(false);

  // Prevent body scroll when modal is open
  useModalScrollLock(!!editedTruck);

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
    onChange(field, formattedValue);
  };

  if (!editedTruck) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="edit-modal-content" onClick={e => {
        if (e && e.stopPropagation) e.stopPropagation();
        if (e && e.preventDefault) e.preventDefault();
      }}>
        <div className="modal-header">
          <h2>Edit Driver Information</h2>
          
          {/* Last Modified Information - Compact */}
          {(editedTruck.updated_by || editedTruck.updated_at) && (
            <div className="last-modified-compact">
              <div className="modified-by">{editedTruck.updated_by || 'Unknown User'}</div>
              <div className="modified-date">
                {editedTruck.updated_at 
                  ? new Date(editedTruck.updated_at).toLocaleString('en-US', {
                      month: '2-digit', 
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false
                    })
                  : 'Unknown Date'
                }
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
              value={editedTruck.truck_no || ''}
              onChange={e => onChange('truck_no', e.target.value)}
              className="edit-input"
              placeholder="Enter truck number"
              onFocus={(e) => e.target.select()}
            />
          </div>
          <div className="edit-form-row">
            <label>Status</label>
            <select
              value={editedTruck.status?.toLowerCase() || ''}
              onChange={e => onChange('status', e.target.value)}
              className="edit-input"
            >
              <option value={editedTruck.status?.toLowerCase() || ''} disabled hidden>
                {editedTruck.status || 'Select status'}
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
              value={editedTruck.driver_name || ''}
              onChange={e => onChange('driver_name', e.target.value)}
              className="edit-input"
              placeholder="Enter driver name"
              onFocus={(e) => e.target.select()}
            />
          </div>
          <div className="edit-form-row">
            <label>City, State zipCode</label>
            <AddressSearchBar
              query={editedTruck.city_state_zip || ''}
              onQueryChange={(newQuery) => onChange('city_state_zip', newQuery)}
              onSelect={(selectedAddress) => onChange('city_state_zip', selectedAddress)}
              placeholder="Enter city, state and zip code"
              hideRecentInfo={true}
            />
          </div>

          {/* Full-width fields */}
          <div className="edit-form-row full-width">
            <label>When will be there</label>
            <div className="date-picker-container">
              <DatePicker
                selected={editedTruck.arrival_time ? new Date(editedTruck.arrival_time) : null}
                onChange={date => onChange('arrival_time', date ? format(date, "yyyy-MM-dd HH:mm") : '')}
                showTimeSelect
                dateFormat="Pp"
                customInput={<CustomDateInput />}
                placeholderText="Select date and time"
              />
              <button 
                className="now-btn"
                onClick={() => {
                  const now = new Date();
                  const year = now.getFullYear();
                  const month = String(now.getMonth() + 1).padStart(2, '0');
                  const day = String(now.getDate()).padStart(2, '0');
                  const hours = String(now.getHours()).padStart(2, '0');
                  const minutes = String(now.getMinutes()).padStart(2, '0');
                  const localDate = `${year}-${month}-${day} ${hours}:${minutes}`;
                  onChange('arrival_time', localDate);
                  onChange('status', 'Available');
                }}
              >
                NOW
              </button>
            </div>
          </div>
          <div className="edit-form-row full-width">
            <label>Comment</label>
            <textarea
              value={editedTruck.comment || ''}
              onChange={e => onChange('comment', e.target.value)}
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
                  value={editedTruck.loads_mark || ''}
                  onChange={e => onChange('loads_mark', e.target.value)}
                  className="edit-input"
                  placeholder="Enter loads/mark"
                  onFocus={(e) => e.target.select()}
                />
              </div>
              <div className="edit-form-row">
                <label>E-mail</label>
                <input
                  type="email"
                  value={editedTruck.email || ''}
                  onChange={e => onChange('email', e.target.value)}
                  className="edit-input"
                  placeholder="Enter email address"
                  onFocus={(e) => e.target.select()}
                />
              </div>
              <div className="edit-form-row">
                <label>Contact phone</label>
                <input
                  type="text"
                  value={editedTruck.contactphone || ''}
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
                  value={editedTruck.cell_phone || ''}
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
                  value={editedTruck.dimensions_payload || ''}
                  onChange={e => onChange('dimensions_payload', e.target.value)}
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
              <button onClick={() => onDelete(editedTruck.id)} className="delete-btn">Delete</button>
            </div>
            <div className="right-actions">
              <button onClick={onClose} className="cancel-btn">Cancel</button>
              <button onClick={onSave} className="save-btn">Save Changes</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditModal; 