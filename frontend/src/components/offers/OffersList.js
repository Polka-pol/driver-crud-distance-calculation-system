import React from 'react';
import './OffersList.css';

const OffersList = ({ loads, loading, onLoadSelect, onRefresh }) => {
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const getOffersSummary = (load) => {
    const offers = load.load_offers || [];
    const total = offers.length;
    const viewed = offers.filter(o => o.viewed_at).length;
    const interested = offers.filter(o => o.offer_status === 'driver_interested').length;
    const accepted = offers.filter(o => o.offer_status === 'accepted').length;
    
    return { total, viewed, interested, accepted };
  };

  const getStatusColor = (summary) => {
    if (summary.accepted > 0) return '#28a745'; // Green
    if (summary.interested > 0) return '#ffc107'; // Yellow
    if (summary.viewed > 0) return '#17a2b8'; // Blue
    return '#6c757d'; // Gray
  };

  if (loading) {
    return (
      <div className="offers-list">
        <div className="offers-list-header">
          <h2>Your Load Offers</h2>
          <button onClick={onRefresh} disabled className="refresh-btn">
            Refreshing...
          </button>
        </div>
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading offers...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="offers-list">
      <div className="offers-list-header">
        <h2>Your Load Offers</h2>
        <button onClick={onRefresh} className="refresh-btn">
          🔄 Refresh
        </button>
      </div>

      {loads.length === 0 ? (
        <div className="empty-state">
          <div className="empty-content">
            <h3>No offers yet</h3>
            <p>Create your first load offer by selecting drivers from the main page and clicking "Send Offer".</p>
          </div>
        </div>
      ) : (
        <div className="offers-list-content">
          {loads.map(load => {
            const summary = getOffersSummary(load);
            const statusColor = getStatusColor(summary);
            
            return (
              <div 
                key={load.id} 
                className="offer-item"
                onClick={() => onLoadSelect(load)}
              >
                <div className="offer-header">
                  <div className="offer-route">
                    <div className="origin">{load.origin_address}</div>
                    <div className="arrow">→</div>
                    <div className="destination">{load.destination_address}</div>
                  </div>
                  <div className="offer-date">
                    {formatDate(load.created_at)}
                  </div>
                </div>

                <div className="offer-details">
                  <div className="detail-item">
                    <span className="label">Weight:</span>
                    <span className="value">{load.weight ? `${load.weight} lbs` : 'N/A'}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Rate:</span>
                    <span className="value">{load.proposed_cost_by_user ? `$${load.proposed_cost_by_user}` : 'N/A'}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Distance:</span>
                    <span className="value">{load.delivery_distance_miles ? `${load.delivery_distance_miles} mi` : 'N/A'}</span>
                  </div>
                </div>

                <div className="offer-status">
                  <div className="status-indicator" style={{ backgroundColor: statusColor }}>
                    <span className="status-count">{summary.total}</span>
                    <span className="status-label">drivers</span>
                  </div>
                  <div className="status-breakdown">
                    {summary.accepted > 0 && (
                      <span className="status-badge accepted">{summary.accepted} accepted</span>
                    )}
                    {summary.interested > 0 && (
                      <span className="status-badge interested">{summary.interested} interested</span>
                    )}
                    {summary.viewed > 0 && (
                      <span className="status-badge viewed">{summary.viewed} viewed</span>
                    )}
                    {summary.total - summary.viewed > 0 && (
                      <span className="status-badge pending">{summary.total - summary.viewed} pending</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default OffersList;
