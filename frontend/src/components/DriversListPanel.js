import React from 'react';
import './DriversListPanel.css';

const DriversListPanel = ({ offer, drivers, selectedDriver, onDriverSelect }) => {
  
  const formatLocation = (location) => {
    if (!location) return 'Unknown Location';
    const parts = location.split(',');
    return parts.length > 1 ? `${parts[0].trim()}, ${parts[1].trim()}` : location;
  };

  const formatRate = (rate) => {
    return rate ? `$${Math.round(rate).toLocaleString()}` : 'N/A';
  };

  const formatPhone = (phone) => {
    if (!phone || phone === 'N/A') return 'No phone';
    return phone;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'accepted':
        return 'status-accepted';
      case 'rejected':
        return 'status-rejected';
      case 'counter_offered':
        return 'status-counter';
      case 'viewed':
        return 'status-viewed';
      default:
        return 'status-sent';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'accepted':
        return 'Accepted';
      case 'rejected':
        return 'Rejected';
      case 'counter_offered':
        return 'Counter Offer';
      case 'viewed':
        return 'Viewed';
      default:
        return 'Sent';
    }
  };

  const getTimeAgo = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now - date) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  };

  if (!offer) {
    return (
      <div className="drivers-list-panel">
        <div className="no-offer-selected">
          <p>Select an offer to view driver responses</p>
        </div>
      </div>
    );
  }

  return (
    <div className="drivers-list-panel">
      {/* Offer Details Section */}
      <div className="offer-details-section">
        <div className="section-header">
          <h3>📋 Offer #{offer.id} Details</h3>
        </div>
        
        <div className="offer-details-content">
          <div className="detail-row">
            <span className="detail-icon">🏁</span>
            <div className="detail-info">
              <span className="detail-label">Route:</span>
              <span className="detail-value">
                {formatLocation(offer.pickup_location)} → {formatLocation(offer.delivery_location)}
              </span>
            </div>
          </div>

          <div className="detail-row">
            <span className="detail-icon">📏</span>
            <div className="detail-info">
              <span className="detail-label">Distance:</span>
              <span className="detail-value">
                {offer.distance_miles ? `${Math.round(offer.distance_miles)} miles` : 'Calculating...'}
              </span>
            </div>
          </div>

          <div className="detail-row">
            <span className="detail-icon">⚖️</span>
            <div className="detail-info">
              <span className="detail-label">Weight:</span>
              <span className="detail-value">
                {offer.weight_lbs ? `${offer.weight_lbs.toLocaleString()} lbs` : 'N/A'}
              </span>
            </div>
          </div>

          <div className="detail-row">
            <span className="detail-icon">📦</span>
            <div className="detail-info">
              <span className="detail-label">Dimensions:</span>
              <span className="detail-value">{offer.dimensions || 'Standard'}</span>
            </div>
          </div>

          <div className="detail-row">
            <span className="detail-icon">💰</span>
            <div className="detail-info">
              <span className="detail-label">Proposed Rate:</span>
              <span className="detail-value rate-highlight">
                {formatRate(offer.proposed_rate)}
              </span>
            </div>
          </div>

          <div className="detail-row">
            <span className="detail-icon">📅</span>
            <div className="detail-info">
              <span className="detail-label">Pickup:</span>
              <span className="detail-value">
                {offer.pickup_date && offer.pickup_time 
                  ? `${new Date(offer.pickup_date).toLocaleDateString()} at ${offer.pickup_time}`
                  : 'TBD'
                }
              </span>
            </div>
          </div>

          {offer.notes && (
            <div className="detail-row">
              <span className="detail-icon">📝</span>
              <div className="detail-info">
                <span className="detail-label">Notes:</span>
                <span className="detail-value">{offer.notes}</span>
              </div>
            </div>
          )}
        </div>

        <div className="offer-actions">
          <button className="edit-offer-btn">Edit Offer</button>
          <button className="close-offer-btn">Close Offer</button>
        </div>
      </div>

      {/* Drivers Responses Section */}
      <div className="drivers-responses-section">
        <div className="section-header">
          <h3>👥 Driver Responses ({drivers.length})</h3>
        </div>

        <div className="drivers-list">
          {drivers.length === 0 ? (
            <div className="no-drivers">
              <p>No driver responses yet</p>
              <button className="send-more-btn">+ Send to more drivers</button>
            </div>
          ) : (
            drivers.map(driver => {
              const isSelected = selectedDriver?.id === driver.id;
              
              return (
                <div
                  key={driver.id}
                  className={`driver-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => onDriverSelect(driver)}
                >
                  <div className="driver-header">
                    <div className="driver-info">
                      <div className="driver-name-status">
                        <span className="driver-name">{driver.name}</span>
                        <span className="online-indicator">
                          {driver.isOnline ? '🟢' : '🔴'}
                        </span>
                      </div>
                      <div className="driver-meta">
                        <span className="truck-number">#{driver.truckNumber}</span>
                        <span className="phone-number">{formatPhone(driver.phone)}</span>
                      </div>
                    </div>
                    
                    <div className="response-status">
                      <span className={`status-badge ${getStatusColor(driver.status)}`}>
                        {getStatusText(driver.status)}
                      </span>
                      {driver.respondedAt && (
                        <span className="response-time">
                          {getTimeAgo(driver.respondedAt)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="driver-details">
                    <div className="location-info">
                      <span className="location-icon">📍</span>
                      <span className="location-text">{formatLocation(driver.location)}</span>
                    </div>

                    {driver.proposedRate && (
                      <div className="rate-info">
                        <span className="rate-label">Counter offer:</span>
                        <span className="rate-value">{formatRate(driver.proposedRate)}</span>
                        {offer.proposed_rate && driver.proposedRate && (
                          <span className={`rate-diff ${driver.proposedRate > offer.proposed_rate ? 'higher' : 'lower'}`}>
                            ({driver.proposedRate > offer.proposed_rate ? '+' : ''}
                            ${Math.abs(driver.proposedRate - offer.proposed_rate)})
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="driver-actions">
                    <button className="chat-btn">💬 Click to chat</button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {drivers.length > 0 && (
          <div className="panel-footer">
            <button className="send-more-btn">+ Send to more drivers</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DriversListPanel;
