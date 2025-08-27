import React, { useState, useEffect } from 'react';
import AddressSearchBar from './AddressSearchBar';
import * as turf from '@turf/turf';
import './CreateOfferModal.css';

const CreateOfferModal = ({ 
  isOpen, 
  onClose, 
  onSubmit, 
  selectedDrivers = [],
  trucks = []
}) => {
  const [formData, setFormData] = useState({
    pickupLocation: '',
    pickupLat: null,
    pickupLon: null,
    deliveryLocation: '',
    deliveryLat: null,
    deliveryLon: null,
    weight: '',
    dimensions: '',
    proposedRate: '',
    pickupDate: '',
    pickupTime: '',
    notes: ''
  });

  const [distance, setDistance] = useState(null);
  const [isCalculatingDistance, setIsCalculatingDistance] = useState(false);
  const [errors, setErrors] = useState({});

  // Get selected driver details
  const selectedDriverDetails = selectedDrivers.map(driverId => {
    const truck = trucks.find(t => t.id === driverId);
    return truck ? {
      id: truck.id,
      name: truck.driver_name,
      truckNumber: truck.truck_no,
      phone: truck.contactphone || truck.cell_phone,
      location: truck.city_state_zip,
      dimensions: truck.dimensions_payload
    } : null;
  }).filter(Boolean);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setFormData({
        pickupLocation: '',
        pickupLat: null,
        pickupLon: null,
        deliveryLocation: '',
        deliveryLat: null,
        deliveryLon: null,
        weight: '',
        dimensions: '',
        proposedRate: '',
        pickupDate: '',
        pickupTime: '',
        notes: ''
      });
      setDistance(null);
      setErrors({});
    }
  }, [isOpen]);

  // Calculate distance between pickup and delivery using Turf.js
  useEffect(() => {
    if (formData.pickupLocation && formData.deliveryLocation) {
      try {
        // Extract coordinates from location objects
        const pickupCoords = formData.pickupLocation.coordinates || 
          [formData.pickupLocation.lng || formData.pickupLocation.lon, formData.pickupLocation.lat];
        const deliveryCoords = formData.deliveryLocation.coordinates || 
          [formData.deliveryLocation.lng || formData.deliveryLocation.lon, formData.deliveryLocation.lat];
        
        if (pickupCoords && deliveryCoords && pickupCoords.length === 2 && deliveryCoords.length === 2) {
          const point1 = turf.point(pickupCoords);
          const point2 = turf.point(deliveryCoords);
          const distanceKm = turf.distance(point1, point2, { units: 'kilometers' });
          const distanceMiles = Math.round(distanceKm * 0.621371); // Convert km to miles
          setDistance(distanceMiles);
        } else {
          setDistance(null);
        }
      } catch (error) {
        console.error('Distance calculation error:', error);
        setDistance(null);
      }
    } else {
      setDistance(null);
    }
  }, [formData.pickupLocation, formData.deliveryLocation]);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: null
      }));
    }
  };

  const handleAddressSelect = (field, address, coordinates) => {
    if (field === 'pickup') {
      setFormData(prev => ({
        ...prev,
        pickupLocation: address,
        pickupLat: coordinates?.lat || null,
        pickupLon: coordinates?.lng || null
      }));
    } else if (field === 'delivery') {
      setFormData(prev => ({
        ...prev,
        deliveryLocation: address,
        deliveryLat: coordinates?.lat || null,
        deliveryLon: coordinates?.lng || null
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.pickupLocation.trim()) {
      newErrors.pickupLocation = 'Pickup location is required';
    }
    if (!formData.deliveryLocation.trim()) {
      newErrors.deliveryLocation = 'Delivery location is required';
    }
    if (!formData.weight.trim()) {
      newErrors.weight = 'Weight is required';
    } else if (isNaN(formData.weight) || parseFloat(formData.weight) <= 0) {
      newErrors.weight = 'Weight must be a valid positive number';
    }
    if (!formData.proposedRate.trim()) {
      newErrors.proposedRate = 'Proposed rate is required';
    } else if (isNaN(formData.proposedRate) || parseFloat(formData.proposedRate) <= 0) {
      newErrors.proposedRate = 'Rate must be a valid positive number';
    }
    if (!formData.pickupDate) {
      newErrors.pickupDate = 'Pickup date is required';
    }
    if (!formData.pickupTime) {
      newErrors.pickupTime = 'Pickup time is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    const offerData = {
      ...formData,
      selectedDrivers: selectedDrivers,
      distance: distance,
      weight: parseFloat(formData.weight),
      proposedRate: parseFloat(formData.proposedRate)
    };

    onSubmit(offerData);
  };

  const handleClose = () => {
    setFormData({
      pickupLocation: '',
      pickupLat: null,
      pickupLon: null,
      deliveryLocation: '',
      deliveryLat: null,
      deliveryLon: null,
      weight: '',
      dimensions: '',
      proposedRate: '',
      pickupDate: '',
      pickupTime: '',
      notes: ''
    });
    setDistance(null);
    setErrors({});
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="create-offer-modal">
        <div className="modal-header">
          <h2>Create New Offer</h2>
          <button className="modal-close-btn" onClick={handleClose}>×</button>
        </div>

        <div className="modal-content">
          {/* Selected Drivers Section */}
          <div className="selected-drivers-section">
            <h3>Selected Drivers ({selectedDriverDetails.length})</h3>
            <div className="drivers-list">
              {selectedDriverDetails.map(driver => (
                <div key={driver.id} className="driver-card">
                  <div className="driver-info">
                    <span className="driver-name">{driver.name}</span>
                    <span className="driver-truck">#{driver.truckNumber}</span>
                  </div>
                  <div className="driver-details">
                    <span className="driver-phone">{driver.phone}</span>
                    <span className="driver-location">{driver.location}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Offer Form */}
          <form onSubmit={handleSubmit} className="offer-form">
            {/* Route Information */}
            <div className="form-section">
              <h3>Route Information</h3>
              
              <div className="form-group">
                <label>Pickup Location *</label>
                <AddressSearchBar
                  query={formData.pickupLocation}
                  onQueryChange={(value) => handleInputChange('pickupLocation', value)}
                  onSelect={(address, coordinates) => handleAddressSelect('pickup', address, coordinates)}
                  placeholder="Enter pickup address..."
                />
                {errors.pickupLocation && <span className="error-text">{errors.pickupLocation}</span>}
              </div>

              <div className="form-group">
                <label>Delivery Location *</label>
                <AddressSearchBar
                  query={formData.deliveryLocation}
                  onQueryChange={(value) => handleInputChange('deliveryLocation', value)}
                  onSelect={(address, coordinates) => handleAddressSelect('delivery', address, coordinates)}
                  placeholder="Enter delivery address..."
                />
                {errors.deliveryLocation && <span className="error-text">{errors.deliveryLocation}</span>}
              </div>

              {/* Distance Display */}
              {distance && (
                <div className="distance-display">
                  <span className="distance-label">Distance:</span>
                  <span className="distance-value">{distance} miles</span>
                </div>
              )}
              {isCalculatingDistance && (
                <div className="distance-calculating">Calculating distance...</div>
              )}
            </div>

            {/* Load Information */}
            <div className="form-section">
              <h3>Load Information</h3>
              
              <div className="form-row">
                <div className="form-group">
                  <label>Weight (lbs) *</label>
                  <input
                    type="number"
                    value={formData.weight}
                    onChange={(e) => handleInputChange('weight', e.target.value)}
                    placeholder="15000"
                    min="0"
                    step="100"
                  />
                  {errors.weight && <span className="error-text">{errors.weight}</span>}
                </div>

                <div className="form-group">
                  <label>Dimensions</label>
                  <input
                    type="text"
                    value={formData.dimensions}
                    onChange={(e) => handleInputChange('dimensions', e.target.value)}
                    placeholder="48' x 8.5' x 9'"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Proposed Rate ($) *</label>
                <input
                  type="number"
                  value={formData.proposedRate}
                  onChange={(e) => handleInputChange('proposedRate', e.target.value)}
                  placeholder="1200"
                  min="0"
                  step="50"
                />
                {errors.proposedRate && <span className="error-text">{errors.proposedRate}</span>}
                {distance && formData.proposedRate && (
                  <div className="rate-per-mile">
                    ${(parseFloat(formData.proposedRate) / distance).toFixed(2)} per mile
                  </div>
                )}
              </div>
            </div>

            {/* Pickup Schedule */}
            <div className="form-section">
              <h3>Pickup Schedule</h3>
              
              <div className="form-row">
                <div className="form-group">
                  <label>Pickup Date *</label>
                  <input
                    type="date"
                    value={formData.pickupDate}
                    onChange={(e) => handleInputChange('pickupDate', e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                  />
                  {errors.pickupDate && <span className="error-text">{errors.pickupDate}</span>}
                </div>

                <div className="form-group">
                  <label>Pickup Time *</label>
                  <input
                    type="time"
                    value={formData.pickupTime}
                    onChange={(e) => handleInputChange('pickupTime', e.target.value)}
                  />
                  {errors.pickupTime && <span className="error-text">{errors.pickupTime}</span>}
                </div>
              </div>
            </div>

            {/* Additional Notes */}
            <div className="form-section">
              <h3>Additional Notes</h3>
              <div className="form-group">
                <textarea
                  value={formData.notes}
                  onChange={(e) => handleInputChange('notes', e.target.value)}
                  placeholder="Special instructions, requirements, or additional information..."
                  rows="3"
                />
              </div>
            </div>

            {/* Form Actions */}
            <div className="form-actions">
              <button type="button" className="cancel-btn" onClick={handleClose}>
                Cancel
              </button>
              <button type="submit" className="submit-btn">
                Create Offer & Send to Drivers
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CreateOfferModal;
