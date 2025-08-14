import React, { useState, useEffect } from 'react';
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import './NewDriverModal.css';
import { apiClient } from '../utils/apiClient';
import { API_BASE_URL } from '../config';
import AddressSearchBar from './AddressSearchBar';
import { useModalScrollLock } from '../utils/modalScrollLock';
import { validateEDTDate, getCurrentTimeInAppTZ, formatDateTimeInAppTZ } from '../utils/timeUtils';
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

const NewDriverModal = ({ user, trucks, onClose, onDriverAdded }) => {
  const { has } = usePermissions();
  const [newDriver, setNewDriver] = useState({
    truck_no: '',
    driver_name: '',
    status: 'Available',
    cell_phone: '',
    contact_phone: '',
    email: '',
    city_state_zip: '',
    arrival_time: formatDateTimeInAppTZ(getCurrentTimeInAppTZ()),
    loads_mark: '',
    dimensions_payload: '',
    comment: '',
    assigned_dispatcher_id: ''
  });
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [dispatchers, setDispatchers] = useState([]);
  const [isLoadingDispatchers, setIsLoadingDispatchers] = useState(false);

  // Prevent body scroll when modal is open
  useModalScrollLock(true);

  // Fetch dispatchers when modal opens
  useEffect(() => {
    fetchDispatchers();
  }, []);

  // Cleanup messages when modal closes
  const handleClose = () => {
    setError(null);
    onClose();
  };

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

  const handleChange = (field, value) => {
    if (field === 'cell_phone' || field === 'contact_phone') {
      // Format phone numbers
      const formattedValue = formatPhoneNumber(value);
      setNewDriver(prev => ({ ...prev, [field]: formattedValue }));
    } else if (field === 'arrival_time') {
      // Format arrival_time to App TZ string immediately
      setNewDriver(prev => ({ ...prev, [field]: value ? formatDateTimeInAppTZ(value) : null }));
    } else {
      setNewDriver(prev => ({ ...prev, [field]: value }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!has('trucks.create')) {
      setError('You do not have permission to add drivers.');
      return;
    }
    setIsLoading(true);
    setError(null);

    // Comprehensive validation with specific error messages
    const validationErrors = [];

    // Check if trucks array is available for duplicate checking
    if (!trucks || !Array.isArray(trucks)) {
      console.warn('Trucks array not available for duplicate checking');
    }

    if (!newDriver.truck_no || newDriver.truck_no.trim() === '') {
      validationErrors.push('Truck № is required');
    } else if (newDriver.truck_no.trim().length < 2) {
      validationErrors.push('Truck № must be at least 2 characters');
    }

    if (!newDriver.driver_name || newDriver.driver_name.trim() === '') {
      validationErrors.push('Driver Name is required');
    } else if (newDriver.driver_name.trim().length < 2) {
      validationErrors.push('Driver Name must be at least 2 characters');
    }

    if (!newDriver.cell_phone || newDriver.cell_phone.trim() === '') {
      validationErrors.push('Cell Phone is required');
    } else {
      // Validate phone number format (should have at least 10 digits)
      const phoneDigits = newDriver.cell_phone.replace(/\D/g, '');
      if (phoneDigits.length < 10) {
        validationErrors.push('Cell Phone must have at least 10 digits');
      } else if (phoneDigits.length > 15) {
        validationErrors.push('Cell Phone cannot have more than 15 digits');
      }
    }

    // Validate email format if provided
    if (newDriver.email && newDriver.email.trim() !== '') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(newDriver.email)) {
        validationErrors.push('Please enter a valid email address (e.g., user@example.com)');
      } else if (newDriver.email.length > 255) {
        validationErrors.push('Email address is too long (maximum 255 characters)');
      }
    }

    // Validate contact phone format if provided
    if (newDriver.contact_phone && newDriver.contact_phone.trim() !== '') {
      const contactPhoneDigits = newDriver.contact_phone.replace(/\D/g, '');
      if (contactPhoneDigits.length < 10) {
        validationErrors.push('Contact Phone must have at least 10 digits');
      }
    }

    // Validate city_state_zip if provided
    if (newDriver.city_state_zip && newDriver.city_state_zip.trim() !== '') {
      if (newDriver.city_state_zip.trim().length < 5) {
        validationErrors.push('City, State, Zip must be at least 5 characters');
      }
    }

    // Validate loads_mark if provided
    if (newDriver.loads_mark && newDriver.loads_mark.trim() !== '') {
      if (newDriver.loads_mark.trim().length < 2) {
        validationErrors.push('Loads/Mark must be at least 2 characters');
      }
    }

    // Validate dimensions_payload if provided
    if (newDriver.dimensions_payload && newDriver.dimensions_payload.trim() !== '') {
      if (newDriver.dimensions_payload.trim().length < 3) {
        validationErrors.push('Dimensions/Payload must be at least 3 characters');
      }
    }

    // Validate arrival_time if provided using centralized EDT validation
    if (newDriver.arrival_time) {
      const validation = validateEDTDate(newDriver.arrival_time, 30, 365);
      if (!validation.isValid) {
        validationErrors.push(validation.error);
      }
    }

    // Check for duplicate truck number (basic check)
    if (newDriver.truck_no && newDriver.truck_no.trim() !== '' && trucks && Array.isArray(trucks)) {
      const existingTruck = trucks.find(t => 
        t.truck_no && t.truck_no.toString().toLowerCase() === newDriver.truck_no.trim().toLowerCase()
      );
      if (existingTruck) {
        validationErrors.push(`Truck № ${newDriver.truck_no} already exists`);
      }
    }

    // Check for duplicate cell phone (basic check)
    if (newDriver.cell_phone && newDriver.cell_phone.trim() !== '' && trucks && Array.isArray(trucks)) {
      const phoneDigits = newDriver.cell_phone.replace(/\D/g, '');
      const existingPhone = trucks.find(t => 
        t.cell_phone && t.cell_phone.replace(/\D/g, '') === phoneDigits
      );
      if (existingPhone) {
        validationErrors.push(`Cell Phone ${newDriver.cell_phone} is already registered`);
      }
    }

    // Check for duplicate contact phone if different from cell phone
    if (newDriver.contact_phone && newDriver.contact_phone.trim() !== '' && 
        newDriver.contact_phone !== newDriver.cell_phone && trucks && Array.isArray(trucks)) {
      const contactPhoneDigits = newDriver.contact_phone.replace(/\D/g, '');
      const existingContactPhone = trucks.find(t => 
        t.contactphone && t.contactphone.replace(/\D/g, '') === contactPhoneDigits
      );
      if (existingContactPhone) {
        validationErrors.push(`Contact Phone ${newDriver.contact_phone} is already registered`);
      }
    }

    if (validationErrors.length > 0) {
      // Show only the first error to keep it compact
      setError(validationErrors[0]);
      setIsLoading(false);
      return;
    }

    const driverData = {
      ...newDriver,
      // Map contact_phone to contactphone for consistency with database
      contactphone: newDriver.contact_phone,
      // Format arrival_time consistently with EditModal
      arrival_time: newDriver.arrival_time ? formatDateTimeInAppTZ(newDriver.arrival_time) : null
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
        // Handle specific API error messages
        let errorMessage = result.message || 'Failed to add new driver.';
        
        // Map common API errors to user-friendly messages
        if (result.message && result.message.includes('duplicate')) {
          errorMessage = 'A driver with this truck number or phone number already exists.';
        } else if (result.message && result.message.includes('validation')) {
          errorMessage = 'Please check all required fields and try again.';
        } else if (result.message && result.message.includes('database')) {
          errorMessage = 'Database error. Please try again or contact support.';
        }
        
        setError(errorMessage);
      }
    } catch (err) {
      console.error('Error creating driver:', err);
      
      // Handle network and other errors
      let errorMessage = 'An unexpected error occurred. Please try again.';
      
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        errorMessage = 'Network error. Please check your connection and try again.';
      } else if (err.message && err.message.includes('timeout')) {
        errorMessage = 'Request timed out. Please try again.';
      } else if (err.message && err.message.includes('unauthorized')) {
        errorMessage = 'Session expired. Please log in again.';
      } else if (err.message && err.message.includes('Failed to fetch')) {
        errorMessage = 'Unable to connect to server. Please check your internet connection.';
      } else if (err.message && err.message.includes('CORS')) {
        errorMessage = 'Cross-origin request blocked. Please contact support.';
      } else if (err.message && err.message.includes('JSON')) {
        errorMessage = 'Invalid response from server. Please try again.';
      }
      
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="new-driver-modal-content" onClick={e => {
        if (e && e.stopPropagation) e.stopPropagation();
      }}>
        <h2>Add New Driver</h2>
        <form onSubmit={handleSubmit} className="new-driver-form">

          
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
            <div className="form-row">
              <label>Assigned Dispatcher</label>
              <select
                value={newDriver.assigned_dispatcher_id}
                onChange={e => handleChange('assigned_dispatcher_id', e.target.value)}
                className="edit-input"
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
                    const now = getCurrentTimeInAppTZ();
                    handleChange('arrival_time', now);
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
            {error && (
              <div className="error-message-inline">
                ⚠️ {error}
              </div>
            )}
            <div className="action-buttons">
              <button type="button" className="cancel-btn" onClick={handleClose} disabled={isLoading}>
                Cancel
              </button>
              <button type="submit" className="save-btn" disabled={isLoading}>
                {isLoading ? 'Saving...' : 'Add Driver'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NewDriverModal; 