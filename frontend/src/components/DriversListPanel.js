import React, { useState } from 'react';
import './DriversListPanel.css';

const DriversListPanel = ({ 
  offer, 
  drivers = [], 
  selectedDriverId, 
  onDriverSelect,
  onSendOffer 
}) => {
  const [statusFilter, setStatusFilter] = useState('all');

  const getStatusColor = (status) => {
    switch (status) {
      case 'sent': return '#ffc107'; // 🟡
      case 'viewed': return '#17a2b8'; // 🔵
      case 'responded': return '#28a745'; // 🟢
      case 'accepted': return '#28a745'; // ✅
      case 'rejected': return '#dc3545'; // ❌
      default: return '#6c757d'; // ⚪
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'sent': return '🟡';
      case 'viewed': return '🔵';
      case 'responded': return '🟢';
      case 'accepted': return '✅';
      case 'rejected': return '❌';
      default: return '⚪';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'sent': return 'Sent';
      case 'viewed': return 'Viewed';
      case 'responded': return 'Responded';
      case 'accepted': return 'Accepted';
      case 'rejected': return 'Rejected';
      default: return 'Not Sent';
    }
  };

  const filteredDrivers = drivers.filter(driver => {
    if (statusFilter === 'all') return true;
    return driver.offerStatus === statusFilter;
  });

  const getDriverStatus = (driver) => {
    // This would come from the backend - for now using mock data
    return driver.offerStatus || 'not_sent';
  };

  const getOnlineStatus = (driver) => {
    // This would come from real-time data
    return driver.isOnline || false;
  };

  const handleSendOffer = (driverId) => {
    if (onSendOffer) {
      onSendOffer(driverId);
    }
  };

  if (!offer) {
    return (
      <div className="drivers-panel">
        <div className="panel-header">
          <h3>Drivers</h3>
        </div>
        <div className="no-offer-selected">
          <p>Select an offer to view drivers</p>
        </div>
      </div>
    );
  }

  return (
    <div className="drivers-panel">
      <div className="panel-header">
        <h3>Drivers for Offer #{offer.id}</h3>
        <span className="drivers-count">({drivers.length})</span>
      </div>

      <div className="panel-filters">
        <div className="filter-group">
          <label>Status:</label>
          <select 
            value={statusFilter} 
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All ({drivers.length})</option>
            <option value="not_sent">Not Sent</option>
            <option value="sent">Sent</option>
            <option value="viewed">Viewed</option>
            <option value="responded">Responded</option>
            <option value="accepted">Accepted</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      <div className="drivers-list">
        {filteredDrivers.length === 0 ? (
          <div className="no-drivers">
            <p>No drivers found matching the filter</p>
          </div>
        ) : (
          filteredDrivers.map(driver => {
            const status = getDriverStatus(driver);
            const isOnline = getOnlineStatus(driver);
            const isSelected = selectedDriverId === driver.id;
            
            return (
              <div
                key={driver.id}
                className={`driver-item ${isSelected ? 'selected' : ''}`}
                onClick={() => onDriverSelect(driver.id)}
              >
                <div className="driver-header">
                  <div className="driver-info">
                    <div className="driver-name">
                      <span className={`online-indicator ${isOnline ? 'online' : 'offline'}`}></span>
                      {driver.DriverName || driver.driver_name}
                    </div>
                    <div className="truck-number">
                      Truck #{driver.TruckNumber || driver.truck_number}
                    </div>
                  </div>
                  
                  <div className="driver-status">
                    <span 
                      className="status-badge"
                      style={{ backgroundColor: getStatusColor(status) }}
                    >
                      {getStatusIcon(status)} {getStatusText(status)}
                    </span>
                  </div>
                </div>

                <div className="driver-details">
                  <div className="detail-row">
                    <span className="detail-label">Phone:</span>
                    <span className="detail-value">
                      {driver.CellPhone || driver.cell_phone || 'N/A'}
                    </span>
                  </div>
                  
                  <div className="detail-row">
                    <span className="detail-label">Location:</span>
                    <span className="detail-value">
                      {driver.city_state_zip || driver.location || 'N/A'}
                    </span>
                  </div>
                  
                  {driver.dimensions_payload && (
                    <div className="detail-row">
                      <span className="detail-label">Dimensions:</span>
                      <span className="detail-value">
                        {driver.dimensions_payload}
                      </span>
                    </div>
                  )}
                </div>

                                            <div className="driver-actions">
                              {status === 'not_sent' && (
                                <button 
                                  className="send-offer-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSendOffer(driver.id);
                                  }}
                                >
                                  Send Offer
                                </button>
                              )}
                            </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default DriversListPanel;
