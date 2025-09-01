import React from 'react';
import './OfferDetailsPanel.css';

const OfferDetailsPanel = ({ offer }) => {
  if (!offer) {
    return (
      <div className="offer-details-panel">
        <div className="details-header">
          <h3>Offer Details</h3>
        </div>
        <div className="no-offer-selected">
          <p>Select an offer to view details</p>
        </div>
      </div>
    );
  }

  const formatDateTime = (datetime) => {
    if (!datetime) return 'Not specified';
    return datetime;
  };

  const formatRate = (rate) => {
    if (!rate) return 'Not specified';
    if (typeof rate === 'number') return `$${rate.toFixed(2)}`;
    return rate;
  };

  const formatMiles = (miles) => {
    if (!miles) return 'Not calculated';
    return `${miles} miles`;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return '#ffc107';
      case 'completed': return '#28a745';
      case 'cancelled': return '#dc3545';
      default: return '#6c757d';
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

  return (
    <div className="offer-details-panel">
      <div className="details-header">
        <h3>Offer #{offer.id} Details</h3>
        <div className="offer-status-badge">
          <span 
            className="status-indicator"
            style={{ backgroundColor: getStatusColor(offer.status) }}
          >
            {getStatusIcon(offer.status)} {offer.status}
          </span>
        </div>
      </div>

      <div className="details-content">
        <div className="details-compact">
          <div className="compact-row">
            <span className="compact-label">📍 Route:</span>
            <span className="compact-value">
              {offer.pickup_location && offer.delivery_location 
                ? `${offer.pickup_location.split(',')[0]} → ${offer.delivery_location.split(',')[0]}`
                : 'Not specified'
              }
            </span>
            {offer.distance_miles && (
              <>
                <span className="compact-separator">•</span>
                <span className="compact-value">{formatMiles(offer.distance_miles)}</span>
              </>
            )}
          </div>

          <div className="compact-row">
            <span className="compact-label">📅 Schedule:</span>
            <span className="compact-value">
              Pickup: {formatDateTime(offer.pickup_datetime)}
            </span>
            <span className="compact-separator">•</span>
            <span className="compact-value">
              Delivery: {formatDateTime(offer.delivery_datetime)}
            </span>
          </div>

          <div className="compact-row">
            <span className="compact-label">💰 Details:</span>
            <span className="compact-value">Rate: {formatRate(offer.proposed_rate)}</span>
            {offer.pieces && (
              <>
                <span className="compact-separator">•</span>
                <span className="compact-value">Pieces: {offer.pieces}</span>
              </>
            )}
            {offer.weight_lbs && (
              <>
                <span className="compact-separator">•</span>
                <span className="compact-value">Weight: {offer.weight_lbs} lbs</span>
              </>
            )}
            {offer.dimensions && (
              <>
                <span className="compact-separator">•</span>
                <span className="compact-value">Dims: {offer.dimensions}</span>
              </>
            )}
          </div>

          <div className="compact-row">
            <span className="compact-label">👥 Drivers:</span>
            <span className="compact-value">
              {Array.isArray(offer.invited_driver_ids) ? offer.invited_driver_ids.length : 0} invited
            </span>
          </div>
        </div>

        {/* Notes Section */}
        {offer.notes && (
          <div className="notes-section">
            <h4>📝 Notes</h4>
            <div className="notes-content">
              {offer.notes}
            </div>
          </div>
        )}

        {/* Timestamps */}
        <div className="timestamps-section">
          <div className="timestamp-item">
            <span className="timestamp-label">Created:</span>
            <span className="timestamp-value">
              {offer.created_at ? new Date(offer.created_at).toLocaleString() : 'Unknown'}
            </span>
          </div>
          {offer.updated_at && offer.updated_at !== offer.created_at && (
            <div className="timestamp-item">
              <span className="timestamp-label">Updated:</span>
              <span className="timestamp-value">
                {new Date(offer.updated_at).toLocaleString()}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OfferDetailsPanel;
