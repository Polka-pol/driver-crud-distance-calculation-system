import React, { useState, useEffect } from 'react';
import { supabaseHelpers } from '../supabaseClient';
import { useAuth } from '../context/HybridAuthContext';
import './SendOfferModal.css';

const SendOfferModal = ({ 
  isOpen, 
  onClose, 
  selectedTrucks, 
  trucks, 
  pickupLocation = '',
  onOfferSent 
}) => {
  // Get full auth context to access more properties
  const { user, isAuthenticated, session, loading } = useAuth();
  
  // Debug authentication state when component mounts
  useEffect(() => {
    console.log('SendOfferModal - Auth State:', { 
      isAuthenticated, 
      hasUser: !!user, 
      userId: user?.id,
      loading,
      sessionActive: !!session
    });
  }, [user, isAuthenticated, session, loading]);
  const [formData, setFormData] = useState({
    origin_address: pickupLocation,
    destination_address: '',
    weight: '',
    dimensions: '',
    proposed_cost_by_user: '',
    delivery_distance_miles: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setFormData(prev => ({
        ...prev,
        origin_address: pickupLocation
      }));
      setError(null);
    }
  }, [isOpen, pickupLocation]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Get auth context at component level
  const { userRole } = useAuth();
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // More comprehensive auth check
    if (loading) {
      setError('Authentication is still loading, please wait...');
      return;
    }
    
    if (!isAuthenticated || !user || !user.id) {
      console.error('Authentication failed:', { isAuthenticated, user });
      setError('You must be logged in to send offers. Please refresh the page or log in again.');
      return;
    }
    
    // Debug logging for user role information
    console.log('User object:', user);
    console.log('User role from metadata:', user?.user_metadata?.role);
    console.log('User role from app_metadata:', user?.app_metadata?.role);
    console.log('User role from HybridAuthContext:', userRole);

    if (selectedTrucks.length === 0) {
      setError('No drivers selected');
      return;
    }

    if (!formData.origin_address || !formData.destination_address) {
      setError('Origin and destination addresses are required');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Create the load first
      const loadData = {
        ...formData,
        weight: formData.weight ? parseFloat(formData.weight) : null,
        proposed_cost_by_user: formData.proposed_cost_by_user ? parseFloat(formData.proposed_cost_by_user) : null,
        delivery_distance_miles: formData.delivery_distance_miles ? parseFloat(formData.delivery_distance_miles) : null,
        created_by_dispatcher_id: user.id
      };

      const { data: load, error: loadError } = await supabaseHelpers.loads.create(loadData);
      
      if (loadError) throw loadError;

      // Create load offers for each selected driver using mysql_truck_id
      const offers = selectedTrucks.map(truckId => {
        const truck = trucks.find(t => t.id === truckId);
        console.log('Processing truck:', truck);
        return {
          load_id: load.id,
          mysql_truck_id: parseInt(truck?.id) || null, // Use MySQL truck ID directly
          driver_user_id: truck?.supabase_user_id || null, // Use supabase_user_id if available
          offer_status: 'sent',
          driver_distance_miles: null, // Could be populated from distance calculation
          created_at: new Date().toISOString()
        };
      }).filter(offer => {
        // Only include offers with valid mysql_truck_id
        const isValid = offer.mysql_truck_id !== null && !isNaN(offer.mysql_truck_id);
        if (!isValid) {
          console.warn('Invalid truck ID found:', offer);
        }
        return isValid;
      });

      if (offers.length === 0) {
        throw new Error('No valid trucks selected. Please ensure trucks have valid IDs.');
      }
      
      console.log('Prepared offers:', offers);

      const { data: createdOffers, error: offersError } = await supabaseHelpers.loadOffers.createBatch(offers);
      
      if (offersError) throw offersError;

      // Success
      console.log('Load created:', load);
      console.log('Offers created:', createdOffers);
      
      if (onOfferSent) {
        onOfferSent({
          load,
          offers: createdOffers,
          selectedTruckCount: selectedTrucks.length
        });
      }

      // Reset form and close modal
      setFormData({
        origin_address: '',
        destination_address: '',
        weight: '',
        dimensions: '',
        proposed_cost_by_user: '',
        delivery_distance_miles: ''
      });
      onClose();

    } catch (error) {
      console.error('Error creating offer:', error);
      setError(error.message || 'Failed to send offer');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedTruckDetails = selectedTrucks.map(id => 
    trucks.find(truck => truck.id === id)
  ).filter(Boolean);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content send-offer-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Send Load Offer</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <div className="selected-drivers-info">
            <h3>Selected Drivers ({selectedTrucks.length})</h3>
            <div className="drivers-list">
              {selectedTruckDetails.map(truck => (
                <div key={truck.id} className="driver-item">
                  <span className="truck-no">#{truck.truck_no}</span>
                  <span className="driver-name">{truck.driver_name}</span>
                  <span className="driver-phone">{truck.cell_phone || truck.contactphone}</span>
                </div>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="offer-form">
            <div className="form-group">
              <label htmlFor="origin_address">Pickup Location *</label>
              <input
                type="text"
                id="origin_address"
                name="origin_address"
                value={formData.origin_address}
                onChange={handleInputChange}
                placeholder="Enter pickup address"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="destination_address">Destination *</label>
              <input
                type="text"
                id="destination_address"
                name="destination_address"
                value={formData.destination_address}
                onChange={handleInputChange}
                placeholder="Enter destination address"
                required
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="weight">Weight (lbs)</label>
                <input
                  type="number"
                  id="weight"
                  name="weight"
                  value={formData.weight}
                  onChange={handleInputChange}
                  placeholder="0"
                  min="0"
                  step="0.01"
                />
              </div>

              <div className="form-group">
                <label htmlFor="proposed_cost_by_user">Proposed Rate ($)</label>
                <input
                  type="number"
                  id="proposed_cost_by_user"
                  name="proposed_cost_by_user"
                  value={formData.proposed_cost_by_user}
                  onChange={handleInputChange}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="dimensions">Dimensions</label>
                <input
                  type="text"
                  id="dimensions"
                  name="dimensions"
                  value={formData.dimensions}
                  onChange={handleInputChange}
                  placeholder="L x W x H"
                />
              </div>

              <div className="form-group">
                <label htmlFor="delivery_distance_miles">Distance (miles)</label>
                <input
                  type="number"
                  id="delivery_distance_miles"
                  name="delivery_distance_miles"
                  value={formData.delivery_distance_miles}
                  onChange={handleInputChange}
                  placeholder="0"
                  min="0"
                  step="0.1"
                />
              </div>
            </div>

            <div className="form-actions">
              <button 
                type="button" 
                className="cancel-btn" 
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="submit-btn" 
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Sending...' : `Send Offer to ${selectedTrucks.length} Driver${selectedTrucks.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default SendOfferModal;
