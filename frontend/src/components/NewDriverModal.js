import React, { useState } from 'react';
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { format } from "date-fns";
import { FaRegCalendarAlt } from "react-icons/fa";
import './NewDriverModal.css';
import { apiClient } from '../utils/apiClient';
import { API_BASE_URL } from '../config';
import AddressSearchBar from './AddressSearchBar';

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

const NewDriverModal = ({ user, onClose, onDriverAdded }) => {
  const [newDriver, setNewDriver] = useState({
    truck_no: '',
    driver_name: '',
    status: 'Available',
    cell_phone: '',
    contact_phone: '',
    email: '',
    city_state_zip: '',
    arrival_time: new Date(),
    loads_mark: '',
    dimensions_payload: '',
    comment: ''
  });
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

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

  const handleChange = (field, value) => {
    if (field === 'cell_phone' || field === 'contact_phone') {
      // Format phone numbers
      const formattedValue = formatPhoneNumber(value);
      setNewDriver(prev => ({ ...prev, [field]: formattedValue }));
    } else {
      setNewDriver(prev => ({ ...prev, [field]: value }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    if (!newDriver.truck_no || !newDriver.driver_name || !newDriver.cell_phone) {
      setError('Please fill in all required fields: Truck №, Driver Name, and Cell Phone.');
      setIsLoading(false);
      return;
    }

    const driverData = {
      ...newDriver,
      contactphone: newDriver.contact_phone, // Map contact_phone to contactphone
      arrival_time: newDriver.arrival_time ? format(newDriver.arrival_time, "yyyy-MM-dd HH:mm:ss") : null
    };

    try {
      const response = await apiClient(`${API_BASE_URL}/trucks/create`, {
        method: 'POST',
        body: JSON.stringify(driverData),
      });
      const result = await response.json();

      if (result.success) {
        onDriverAdded(result.truck);
        onClose();
      } else {
        setError(result.message || 'Failed to add new driver.');
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="new-driver-modal-content" onMouseDown={e => e.stopPropagation()}>
        <h2>Add New Driver</h2>
        <form onSubmit={handleSubmit} className="new-driver-form">
          {error && <div className="form-error-message">{error}</div>}
          
          {/* Basic Information */}
          <div className="form-section">
            <h3>Basic Information</h3>
            <div className="form-row">
              <label>Truck № <span className="required">*</span></label>
              <input
                type="text"
                value={newDriver.truck_no}
                onChange={e => handleChange('truck_no', e.target.value)}
                className="edit-input"
                placeholder="Enter truck number"
                required
              />
            </div>
            <div className="form-row">
              <label>Driver Name <span className="required">*</span></label>
              <input
                type="text"
                value={newDriver.driver_name}
                onChange={e => handleChange('driver_name', e.target.value)}
                className="edit-input"
                placeholder="Enter driver name"
                required
              />
            </div>
            <div className="form-row">
              <label>Status</label>
              <select
                value={newDriver.status}
                onChange={e => handleChange('status', e.target.value)}
                className="edit-input"
              >
                <option value="Available">Available</option>
                <option value="Available on">Available on</option>
                <option value="Unavailable">Unavailable</option>
                <option value="Local">Local</option>
                <option value="Out of service">Out of Service</option>
              </select>
            </div>
          </div>

          {/* Contact Information */}
          <div className="form-section">
            <h3>Contact Information</h3>
            <div className="form-row">
              <label>Cell Phone <span className="required">*</span></label>
              <input
                type="text"
                value={newDriver.cell_phone}
                onChange={e => handleChange('cell_phone', e.target.value)}
                className="edit-input"
                placeholder="(000) 000-0000"
                required
                maxLength="14"
              />
            </div>
            <div className="form-row">
              <label>Contact Phone</label>
              <input
                type="text"
                value={newDriver.contact_phone}
                onChange={e => handleChange('contact_phone', e.target.value)}
                className="edit-input"
                placeholder="(000) 000-0000"
                maxLength="14"
              />
            </div>
            <div className="form-row">
              <label>Email</label>
              <input
                type="email"
                value={newDriver.email}
                onChange={e => handleChange('email', e.target.value)}
                className="edit-input"
                placeholder="Enter email address"
              />
            </div>
          </div>

          {/* Location & Schedule */}
          <div className="form-section">
            <h3>Location & Schedule</h3>
            <div className="form-row full-width">
              <label>City, State, Zip</label>
              <AddressSearchBar
                query={newDriver.city_state_zip}
                onQueryChange={(query) => handleChange('city_state_zip', query)}
                onSelect={(address) => handleChange('city_state_zip', address)}
                placeholder="Enter location"
                hideRecentInfo={true}
              />
            </div>
            <div className="form-row full-width">
              <label>Available On</label>
              <div className="date-picker-container">
                <DatePicker
                  selected={newDriver.arrival_time ? new Date(newDriver.arrival_time) : null}
                  onChange={date => handleChange('arrival_time', date)}
                  showTimeSelect
                  dateFormat="Pp"
                  customInput={<CustomDateInput />}
                  placeholderText="Select date and time"
                />
                <button 
                  type="button"
                  className="now-btn"
                  onClick={() => {
                    handleChange('arrival_time', new Date());
                    handleChange('status', 'Available');
                  }}
                >
                  NOW
                </button>
              </div>
            </div>
          </div>

          {/* Additional Details */}
          <div className="form-section">
            <h3>Additional Details</h3>
            <div className="form-row">
              <label>Loads/Mark</label>
              <input
                type="text"
                value={newDriver.loads_mark}
                onChange={e => handleChange('loads_mark', e.target.value)}
                className="edit-input"
                placeholder="Enter loads/mark"
              />
            </div>
            <div className="form-row">
              <label>Dimensions/Payload</label>
              <input
                type="text"
                value={newDriver.dimensions_payload}
                onChange={e => handleChange('dimensions_payload', e.target.value)}
                className="edit-input"
                placeholder="Enter dimensions/payload"
              />
            </div>
            <div className="form-row full-width">
              <label>Comment</label>
              <textarea
                value={newDriver.comment}
                onChange={e => handleChange('comment', e.target.value)}
                className="edit-textarea"
                placeholder="Any additional comments..."
              />
            </div>
          </div>

          <div className="form-actions">
            <button type="button" className="cancel-btn" onClick={onClose} disabled={isLoading}>
              Cancel
            </button>
            <button type="submit" className="save-btn" disabled={isLoading}>
              {isLoading ? 'Saving...' : 'Add Driver'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NewDriverModal; 