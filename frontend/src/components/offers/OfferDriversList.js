import React from 'react';
import './OfferDriversList.css';

const OfferDriversList = ({ load, offers, onBack, onOfferSelect, selectedOfferId }) => {
  const formatDate = (dateString) => {
    if (!dateString) return 'Not viewed';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'accepted': return '#28a745';
      case 'driver_interested': return '#ffc107';
      case 'viewed': return '#17a2b8';
      case 'rejected': return '#dc3545';
      case 'expired': return '#6c757d';
      default: return '#6c757d';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'sent': return 'Sent';
      case 'viewed': return 'Viewed';
      case 'driver_interested': return 'Interested';
      case 'accepted': return 'Accepted';
      case 'rejected': return 'Rejected';
      case 'expired': return 'Expired';
      case 'completed': return 'Completed';
      default: return status;
    }
  };

  const formatDistance = (miles) => {
    if (!miles) return 'N/A';
    return `${miles} mi`;
  };

  const formatCost = (cost) => {
    if (!cost) return 'No offer';
    return `$${cost}`;
  };

  return (
    <div className="offer-drivers-list">
      <div className="drivers-list-header">
        <button onClick={onBack} className="back-btn">← Back to Offers</button>
        <h2>Drivers for Load</h2>
      </div>

      {load && (
        <div className="load-summary">
          <div className="load-route">
            <div className="route-text">
              <span className="origin">{load.origin_address}</span>
              <span className="arrow">→</span>
              <span className="destination">{load.destination_address}</span>
            </div>
          </div>
          <div className="load-details">
            <span className="detail">Weight: {load.weight ? `${load.weight} lbs` : 'N/A'}</span>
            <span className="detail">Rate: {load.proposed_cost_by_user ? `$${load.proposed_cost_by_user}` : 'N/A'}</span>
            <span className="detail">Distance: {load.delivery_distance_miles ? `${load.delivery_distance_miles} mi` : 'N/A'}</span>
          </div>
        </div>
      )}

      <div className="drivers-list-content">
        {offers.length === 0 ? (
          <div className="empty-state">
            <div className="empty-content">
              <h3>No drivers found</h3>
              <p>No offers have been sent for this load yet.</p>
            </div>
          </div>
        ) : (
          <div className="drivers-list">
            {offers.map(offer => (
              <div 
                key={offer.id}
                className={`driver-item ${selectedOfferId === offer.id ? 'selected' : ''}`}
                onClick={() => onOfferSelect(offer)}
              >
                <div className="driver-header">
                  <div className="driver-info">
                    <div className="driver-name">
                      Driver #{offer.driver_user_id?.slice(-8) || 'Unknown'}
                    </div>
                    <div className="driver-meta">
                      <span className="offer-date">
                        Sent: {formatDate(offer.created_at)}
                      </span>
                    </div>
                  </div>
                  <div 
                    className="status-badge"
                    style={{ backgroundColor: getStatusColor(offer.offer_status) }}
                  >
                    {getStatusLabel(offer.offer_status)}
                  </div>
                </div>

                <div className="driver-details">
                  <div className="detail-row">
                    <div className="detail-item">
                      <span className="label">Viewed:</span>
                      <span className="value">{formatDate(offer.viewed_at)}</span>
                    </div>
                    <div className="detail-item">
                      <span className="label">Distance:</span>
                      <span className="value">{formatDistance(offer.driver_distance_miles)}</span>
                    </div>
                  </div>
                  
                  {offer.driver_proposed_cost && (
                    <div className="detail-row">
                      <div className="detail-item">
                        <span className="label">Driver's Rate:</span>
                        <span className="value driver-rate">{formatCost(offer.driver_proposed_cost)}</span>
                      </div>
                      <div className="detail-item">
                        <span className="label">Proposed:</span>
                        <span className="value">{formatDate(offer.price_proposed_at)}</span>
                      </div>
                    </div>
                  )}
                </div>

                {offer.offer_status === 'driver_interested' && (
                  <div className="action-indicator">
                    <span className="action-text">💬 Waiting for your response</span>
                  </div>
                )}

                {offer.offer_status === 'accepted' && (
                  <div className="action-indicator accepted">
                    <span className="action-text">✅ Offer Accepted</span>
                  </div>
                )}

                <div className="click-indicator">
                  <span>Click to chat →</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default OfferDriversList;
