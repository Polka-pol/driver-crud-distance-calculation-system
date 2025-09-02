import React, { useState, useEffect, useRef } from 'react';
import './CreateOfferModal.css';
import { getAddressSuggestions } from '../utils/addressAutofill';
import { API_BASE_URL } from '../config';
import { apiClient } from '../utils/apiClient';
import offersApi from '../services/offersApi';

const CreateOfferModal = ({ isOpen, onClose, selectedDrivers, pickupAddress, onOfferCreated }) => {
  
  const [formData, setFormData] = useState({
    pickupAddress: pickupAddress || '',
    deliveryAddress: '',
    pickupDateTime: '',
    deliveryDateTime: '',
    ratePerMile: 'best rate',
    pieces: '1',
    weight: '1200',
    dims: '',
    notes: '',
    loadedMiles: ''
  });

  const [pickupQuery, setPickupQuery] = useState('');
  const [deliveryQuery, setDeliveryQuery] = useState('');
  const [pickupSuggestions, setPickupSuggestions] = useState([]);
  const [deliverySuggestions, setDeliverySuggestions] = useState([]);
  const [pickupLoading, setPickupLoading] = useState(false);
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [isPickupSuggestionsVisible, setIsPickupSuggestionsVisible] = useState(false);
  const [isDeliverySuggestionsVisible, setIsDeliverySuggestionsVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);

  // Refs to suppress refetch after selection and to detect outside clicks
  const pickupSuppressRef = useRef(false);
  const deliverySuppressRef = useRef(false);
  const pickupSelectedRef = useRef('');
  const deliverySelectedRef = useRef('');
  const pickupContainerRef = useRef(null);
  const deliveryContainerRef = useRef(null);

  // Update form data when pickupAddress prop changes
  useEffect(() => {
    if (pickupAddress) {
      setFormData(prev => ({ ...prev, pickupAddress }));
      setPickupQuery(pickupAddress);
    }
  }, [pickupAddress]);

  const handlePickupSelect = (suggestion) => {
    const address = suggestion.formattedAddress;
    setFormData(prev => ({ ...prev, pickupAddress: address }));
    // Suppress the next fetch triggered by setting query
    pickupSuppressRef.current = true;
    pickupSelectedRef.current = address;
    setPickupQuery(address);
    setPickupSuggestions([]);
    setIsPickupSuggestionsVisible(false);
  };

  const handleDeliverySelect = (suggestion) => {
    const address = suggestion.formattedAddress;
    setFormData(prev => ({ ...prev, deliveryAddress: address }));
    // Suppress the next fetch triggered by setting query
    deliverySuppressRef.current = true;
    deliverySelectedRef.current = address;
    setDeliveryQuery(address);
    setDeliverySuggestions([]);
    setIsDeliverySuggestionsVisible(false);
  };

  // Fetch pickup address suggestions
  useEffect(() => {
    // If this change came from a selection, do not refetch; just keep dropdown hidden
    if (pickupSuppressRef.current) {
      pickupSuppressRef.current = false;
      setIsPickupSuggestionsVisible(false);
      setPickupSuggestions([]);
      setPickupLoading(false);
      return;
    }

    // If query equals the last selected address, do not fetch
    if (pickupQuery && pickupSelectedRef.current && pickupQuery === pickupSelectedRef.current) {
      setIsPickupSuggestionsVisible(false);
      setPickupSuggestions([]);
      setPickupLoading(false);
      return;
    }

    if (pickupQuery && pickupQuery.length > 2) {
      const timeoutId = setTimeout(() => {
        setIsPickupSuggestionsVisible(true);
        getAddressSuggestions(
          pickupQuery,
          setPickupSuggestions,
          setPickupLoading
        );
      }, 300);
      return () => clearTimeout(timeoutId);
    } else {
      setPickupSuggestions([]);
      setPickupLoading(false);
      setIsPickupSuggestionsVisible(false);
    }
  }, [pickupQuery]);

  // Fetch delivery address suggestions
  useEffect(() => {
    // If this change came from a selection, do not refetch; just keep dropdown hidden
    if (deliverySuppressRef.current) {
      deliverySuppressRef.current = false;
      setIsDeliverySuggestionsVisible(false);
      setDeliverySuggestions([]);
      setDeliveryLoading(false);
      return;
    }

    // If query equals the last selected address, do not fetch
    if (deliveryQuery && deliverySelectedRef.current && deliveryQuery === deliverySelectedRef.current) {
      setIsDeliverySuggestionsVisible(false);
      setDeliverySuggestions([]);
      setDeliveryLoading(false);
      return;
    }

    if (deliveryQuery && deliveryQuery.length > 2) {
      const timeoutId = setTimeout(() => {
        setIsDeliverySuggestionsVisible(true);
        getAddressSuggestions(
          deliveryQuery,
          setDeliverySuggestions,
          setDeliveryLoading
        );
      }, 300);
      return () => clearTimeout(timeoutId);
    } else {
      setDeliverySuggestions([]);
      setDeliveryLoading(false);
      setIsDeliverySuggestionsVisible(false);
    }
  }, [deliveryQuery]);

  // Hide suggestions when clicking outside of the input containers
  useEffect(() => {
    const handleClickOutside = (event) => {
      const pickEl = pickupContainerRef.current;
      const delEl = deliveryContainerRef.current;

      if (pickEl && !pickEl.contains(event.target)) {
        setIsPickupSuggestionsVisible(false);
      }
      if (delEl && !delEl.contains(event.target)) {
        setIsDeliverySuggestionsVisible(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const calculateMiles = async () => {
    if (!formData.pickupAddress || !formData.deliveryAddress) {
      alert('🚨 Please enter both pickup and delivery addresses');
      return;
    }

    setIsCalculating(true);
    try {
      // Use backend single-distance endpoint which checks cache first, then Mapbox, and caches result
      const resp = await apiClient(`${API_BASE_URL}/distance`, {
        method: 'POST',
        body: JSON.stringify({
          origin: formData.pickupAddress,
          destination: formData.deliveryAddress,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || err.message || `Request failed with status ${resp.status}`);
      }

      const data = await resp.json();
      const meters = data && typeof data.distance === 'number' ? data.distance : null;
      if (meters !== null) {
        const miles = Math.round(meters / 1609.34); // Convert meters to miles (rounded)
        setFormData({ ...formData, loadedMiles: miles.toString() });
      } else {
        alert('❌ Could not calculate distance. Please check the addresses.');
      }
    } catch (error) {
      console.error('Error calculating distance:', error);
      alert('⚠️ Error calculating distance. Please try again.');
    } finally {
      setIsCalculating(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.pickupAddress || !formData.deliveryAddress || !formData.ratePerMile) {
      alert('🚨 Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);
    try {
      const offerData = {
        ...formData,
        driverIds: selectedDrivers.map(driver => driver.ID)
      };
      
      await offersApi.createOffer(offerData);
      alert('✅ Offer created successfully!');
      
      // Call the callback to clear selected drivers
      if (onOfferCreated) {
        onOfferCreated();
      }
      
      onClose();
      // Clear form data
      setFormData({
        pickupAddress: '',
        deliveryAddress: '',
        pickupDateTime: '',
        deliveryDateTime: '',
        ratePerMile: 'best rate',
        pieces: '1',
        weight: '1200',
        dims: '',
        notes: '',
        loadedMiles: ''
      });
      setPickupQuery('');
      setDeliveryQuery('');
    } catch (error) {
      console.error('Error creating offer:', error);
      alert('❌ Error creating offer. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const setPickupNow = () => {
    // Set plain text for quick action
    setFormData({ ...formData, pickupDateTime: 'ASAP' });
  };

  const setPickupToday = () => {
    setFormData({ ...formData, pickupDateTime: 'Today' });
  };

  const setPickupTomorrow = () => {
    setFormData({ ...formData, pickupDateTime: 'Tomorrow' });
  };

  const setDeliveryToday = () => {
    setFormData({ ...formData, deliveryDateTime: 'Today' });
  };

  const setDeliveryTomorrow = () => {
    setFormData({ ...formData, deliveryDateTime: 'Tomorrow' });
  };

  const setDeliveryASAP = () => {
    setFormData({ ...formData, deliveryDateTime: 'ASAP' });
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content create-offer-modal-new" onClick={e => e.stopPropagation()}>
        <div className="modal-header-new">
          <h2>🚛 Create New Offer</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-body-new">
          {/* Selected Drivers Count */}
          <div className="drivers-count">
            👥 {selectedDrivers.length} driver{selectedDrivers.length !== 1 ? 's' : ''} selected
          </div>

          <form className="offer-form" onSubmit={handleSubmit}>
            {/* Pickup Address */}
            <div className="form-field">
              <label>📍 Pickup Address *</label>
              <div className="address-input-container" ref={pickupContainerRef}>
                <input
                  type="text"
                  className="address-input"
                  value={pickupQuery}
                  onChange={(e) => {
                    setPickupQuery(e.target.value);
                    setFormData(prev => ({ ...prev, pickupAddress: e.target.value }));
                  }}
                  placeholder="Enter pickup address..."
                  required
                />
                {pickupLoading && <span className="loading-spinner">⏳</span>}
                {isPickupSuggestionsVisible && pickupSuggestions.length > 0 && (
                  <div className="suggestions-dropdown">
                    {pickupSuggestions.map((suggestion, index) => (
                      <div
                        key={index}
                        className="suggestion-item"
                        onClick={() => handlePickupSelect(suggestion)}
                      >
                        <span className="suggestion-flag">🇺🇸</span>
                        <span className="suggestion-text">{suggestion.formattedAddress}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Delivery Address */}
            <div className="form-field">
              <label>🎯 Delivery Address *</label>
              <div className="address-input-container" ref={deliveryContainerRef}>
                <input
                  type="text"
                  className="address-input"
                  value={deliveryQuery}
                  onChange={(e) => {
                    setDeliveryQuery(e.target.value);
                    setFormData(prev => ({ ...prev, deliveryAddress: e.target.value }));
                  }}
                  placeholder="Enter delivery address..."
                  required
                />
                {deliveryLoading && <span className="loading-spinner">⏳</span>}
                {isDeliverySuggestionsVisible && deliverySuggestions.length > 0 && (
                  <div className="suggestions-dropdown">
                    {deliverySuggestions.map((suggestion, index) => (
                      <div
                        key={index}
                        className="suggestion-item"
                        onClick={() => handleDeliverySelect(suggestion)}
                      >
                        <span className="suggestion-flag">🇺🇸</span>
                        <span className="suggestion-text">{suggestion.formattedAddress}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Loaded Miles */}
            <div className="form-field">
              <label>📏 Loaded Miles</label>
              <div className="miles-input-row">
                <input
                  type="number"
                  className="miles-input"
                  value={formData.loadedMiles}
                  onChange={(e) => setFormData({ ...formData, loadedMiles: e.target.value })}
                  placeholder="Enter miles"
                  min="0"
                  step="1"
                />
                <button
                  type="button"
                  className="calc-btn"
                  onClick={calculateMiles}
                  disabled={isCalculating || !formData.pickupAddress || !formData.deliveryAddress}
                >
                  {isCalculating ? '⏳' : 'Calculate'}
                </button>
              </div>
            </div>

            {/* Pickup Date/Time */}
            <div className="form-field">
              <label>📅 Pickup Date & Time</label>
              <div className="date-input-row">
                <input
                  type="text"
                  className="date-input"
                  value={formData.pickupDateTime}
                  onChange={(e) => setFormData({ ...formData, pickupDateTime: e.target.value })}
                />
              </div>
              <div className="quick-date-buttons">
                <button type="button" className="quick-btn" onClick={setPickupNow}>ASAP</button>
                <button type="button" className="quick-btn" onClick={setPickupToday}>Today</button>
                <button type="button" className="quick-btn" onClick={setPickupTomorrow}>Tomorrow</button>
              </div>
            </div>

            {/* Delivery Date/Time */}
            <div className="form-field">
              <label>🚚 Delivery Date & Time</label>
              <div className="date-input-row">
                <input
                  type="text"
                  className="date-input"
                  value={formData.deliveryDateTime}
                  onChange={(e) => setFormData({ ...formData, deliveryDateTime: e.target.value })}
                />
              </div>
              <div className="quick-date-buttons">
                <button type="button" className="quick-btn" onClick={setDeliveryASAP}>ASAP</button>
                <button type="button" className="quick-btn" onClick={setDeliveryToday}>Today</button>
                <button type="button" className="quick-btn" onClick={setDeliveryTomorrow}>Tomorrow</button>
              </div>
            </div>

            {/* Pieces & Weight */}
            <div className="form-field">
              <div className="miles-input-row">
                <div className="input-with-label">
                  <label>📦 Pieces</label>
                  <input
                    type="text"
                    className="miles-input"
                    value={formData.pieces}
                    onChange={(e) => setFormData({ ...formData, pieces: e.target.value })}
                  />
                </div>
                <div className="input-with-label">
                  <label>⚖️ Weight</label>
                  <input
                    type="text"
                    className="miles-input"
                    value={formData.weight}
                    onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* DIMS */}
            <div className="form-field">
              <label>📐 DIMS</label>
              <input
                type="text"
                className="address-input"
                value={formData.dims}
                onChange={(e) => setFormData({ ...formData, dims: e.target.value })}
                placeholder="160x55x70"
              />
            </div>

            {/* Rate */}
            <div className="form-field">
              <label>💰 Rate *</label>
              <input
                type="text"
                className="rate-input"
                value={formData.ratePerMile}
                onChange={(e) => setFormData({ ...formData, ratePerMile: e.target.value })}
                required
              />
            </div>

            {/* Notes */}
            <div className="form-field">
              <label>📝 Notes</label>
              <textarea
                className="notes-input"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional notes or requirements..."
              />
            </div>

            {/* Form Actions */}
            <div className="form-actions-new">
              <button type="button" className="cancel-btn-new" onClick={onClose}>
                ❌ Cancel
              </button>
              <button type="submit" className="submit-btn-new" disabled={isSubmitting}>
                {isSubmitting ? '⏳ Creating...' : '✅ Create Offer'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CreateOfferModal;
