import React, { useState } from 'react';
import './OffersCarousel.css';

const OffersCarousel = ({ offers, selectedOfferId, onOfferSelect }) => {
  const [filters, setFilters] = useState({
    status: 'all',
    search: ''
  });

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return '#ffc107'; // 🟡
      case 'completed': return '#28a745'; // ✅
      case 'cancelled': return '#dc3545'; // ❌
      default: return '#6c757d'; // ⚪
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'active': return '🟡';
      case 'completed': return '✅';
      case 'cancelled': return '❌';
      default: return '⚪';
    }
  };

  const filteredOffers = offers.filter(offer => {
    if (filters.status !== 'all' && offer.status !== filters.status) {
      return false;
    }
    
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      return (
        offer.pickup_location?.toLowerCase().includes(searchLower) ||
        offer.delivery_location?.toLowerCase().includes(searchLower) ||
        offer.id.toString().includes(searchLower)
      );
    }
    
    return true;
  });

  const handleFilterChange = (filterType, value) => {
    setFilters(prev => ({ ...prev, [filterType]: value }));
  };

  const formatRoute = (pickup, delivery) => {
    if (!pickup || !delivery) return 'Route not set';
    
    const pickupShort = pickup.split(',')[0];
    const deliveryShort = delivery.split(',')[0];
    
    return `${pickupShort} → ${deliveryShort}`;
  };

  

  return (
    <div className="offers-carousel">
      <div className="carousel-header">
        <div className="carousel-title">
          <h2>Offers</h2>
          <span className="offers-count">({offers.length})</span>
        </div>
        
        <div className="carousel-filters">
          <div className="filter-group">
            <label>Status:</label>
            <select 
              value={filters.status} 
              onChange={(e) => handleFilterChange('status', e.target.value)}
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          
          <div className="filter-group">
            <label>Search:</label>
            <input
              type="text"
              placeholder="Search offers..."
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="carousel-container">
        <div className="carousel-scroll">
          {filteredOffers.length === 0 ? (
            <div className="no-offers">
              <p>No offers found matching your criteria</p>
            </div>
          ) : (
                                    filteredOffers.map(offer => {
                          const isSelected = selectedOfferId === offer.id;
              
              return (
                <div
                  key={offer.id}
                  className={`offer-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => onOfferSelect(offer.id)}
                >
                  <div className="offer-header">
                    <div className="offer-id">
                      🚛 Offer #{offer.id}
                    </div>
                    <div className="offer-status">
                      <span 
                        className="status-indicator"
                        style={{ backgroundColor: getStatusColor(offer.status) }}
                      >
                        {getStatusIcon(offer.status)} {offer.status}
                      </span>
                    </div>
                  </div>

                  <div className="offer-route">
                    {formatRoute(offer.pickup_location, offer.delivery_location)}
                  </div>

                  

                                                {/* New Messages Indicator */}
                              {offer.unread_messages > 0 && (
                                <div className="new-messages-indicator">
                                  <span className="new-messages-icon">💬</span>
                                  <span className="new-messages-count">{offer.unread_messages}</span>
                                </div>
                              )}

                  
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default OffersCarousel;
