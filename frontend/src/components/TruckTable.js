import React, { useState } from 'react';
import DistanceCell from './DistanceCell';
import StatusBadge from './StatusBadge';
import HoldCell from './HoldCell';
import { formatEDTDate, formatEDTDateMobile } from '../utils/timeUtils';
import './TruckTable.css';

// Conversion constant - same as in DistanceCell
const METERS_TO_MILES = 1609.34;

const TruckTable = ({
  trucks,
  distances,
  sortConfig,
  onSort,
  onEdit,
  onCommentClick,
  selectedTrucks,
  onSelectTruck,
  onSelectAll,
  onRefresh,
  isRefreshing,
  isUpdated,
  onLocationClick,
  currentUserId,
  onHoldClick,
  onRemoveHold,
  onHoldExpired,
  serverTimeOffset
}) => {
  const [expandedCards, setExpandedCards] = useState(new Set());
  const [toastMessage, setToastMessage] = useState('');
  const [showToast, setShowToast] = useState(false);

  const showToastMessage = (message) => {
    setToastMessage(message);
    setShowToast(true);
    setTimeout(() => {
      setShowToast(false);
    }, 2000);
  };

  const toggleCard = (truckId) => {
    const newExpandedCards = new Set(expandedCards);
    if (newExpandedCards.has(truckId)) {
      newExpandedCards.delete(truckId);
    } else {
      newExpandedCards.add(truckId);
    }
    setExpandedCards(newExpandedCards);
  };

  // Use centralized EDT time formatting
  const formatDate = (dateString) => {
    const formattedDate = formatEDTDate(dateString);
    if (formattedDate === '-') return '-';
    
    const [datePart, timePart] = formattedDate.split(' ');
    return (
      <div className="date-display">
        <div className="date-part">{datePart}</div>
        <div className="time-part">{timePart}</div>
      </div>
    );
  };

  const formatDateMobile = (dateString) => {
    return formatEDTDateMobile(dateString);
  };

  const commentPreview = (comment) => {
    if (!comment) return '-';
    if (comment.length <= 50) return comment;
    return comment.slice(0, 50) + '...';
  };

  const handleDimensionsClick = (truck) => {
    const distanceData = distances[truck.id];
    const distance = distanceData?.distance !== undefined && distanceData?.distance !== null
      ? `${Math.round(distanceData.distance / METERS_TO_MILES)} mil.`
      : '-';
    const city = truck.city_state_zip || '-';
    const dimensions = truck.dimensions_payload || '-';
    
    const textToCopy = `Miles out: ${distance}\nCurrent Location: ${city}\nDIMS: ${dimensions}`;
    
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(textToCopy).then(() => {
        showToastMessage('Driver info copied');
      }).catch(err => {
        console.error('Failed to copy text: ', err);
        fallbackCopyToClipboard(textToCopy, 'Driver info copied');
      });
    } else {
      fallbackCopyToClipboard(textToCopy, 'Driver info copied');
    }
  };

  const handlePhoneClick = (phoneNumber) => {
    if (!phoneNumber || phoneNumber === '-' || phoneNumber === '***') return;
    
    // Clean the phone number (remove spaces, dashes, etc.)
    const cleanedPhone = phoneNumber.replace(/[^\d+]/g, '');
    
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(cleanedPhone).then(() => {
        showToastMessage('Phone number copied');
      }).catch(err => {
        console.error('Failed to copy phone number: ', err);
        fallbackCopyToClipboard(cleanedPhone, 'Phone number copied');
      });
    } else {
      fallbackCopyToClipboard(cleanedPhone, 'Phone number copied');
    }
  };

  const fallbackCopyToClipboard = (text, successMessage) => {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
      document.execCommand('copy');
      textArea.remove();
      if (successMessage) {
        showToastMessage(successMessage);
      }
    } catch (err) {
      console.error('Failed to copy text: ', err);
      textArea.remove();
    }
  };

  const handleRefreshClick = () => {
    onRefresh();
  };

  const isAllSelectedOnPage = trucks.length > 0 && trucks.every(truck => selectedTrucks.includes(truck.id));

  const getDistanceText = (truck) => {
    const distanceData = distances[truck.id];
    if (distanceData?.distance !== undefined && distanceData?.distance !== null) {
      return `${Math.round(distanceData.distance / METERS_TO_MILES)} mil.`;
    }
    return '-';
  };

  // Mobile card component
  const MobileCard = ({ truck, currentUserId }) => {
    const isExpanded = expandedCards.has(truck.id);
    const distanceText = getDistanceText(truck);

    return (
      <div className="mobile-card">
        <div className="mobile-card-header" onClick={() => toggleCard(truck.id)}>
          <div className="mobile-card-left">
            <input
              type="checkbox"
              checked={selectedTrucks.includes(truck.id)}
              onChange={(e) => {
                if (e && e.stopPropagation) e.stopPropagation();
                onSelectTruck(truck.id);
              }}
              onClick={(e) => {
                if (e && e.stopPropagation) e.stopPropagation();
              }}
              className="mobile-card-checkbox"
            />
            <div className="mobile-card-info">
              <div className="mobile-card-name">{truck.driver_name || `Truck ${truck.truck_no}`}</div>
              <div className="mobile-card-meta">
                <span className="mobile-card-date">{formatDateMobile(truck.arrival_time)}</span>
                <span className="mobile-card-distance">{distanceText}</span>
              </div>
            </div>
          </div>
          <div className="mobile-card-right">
            <StatusBadge 
              status={truck.status} 
              truck={truck} 
              onClick={(e) => {
                if (e && e.stopPropagation) e.stopPropagation();
                onEdit(truck);
              }} 
            />
            <div className="mobile-card-expand">
              {isExpanded ? '▼' : '▶'}
            </div>
          </div>
        </div>
        
        {isExpanded && (
          <div className="mobile-card-details">
            <div className="mobile-detail-row">
              <span className="mobile-detail-label">Truck №:</span>
              <span className="mobile-detail-value">{truck.truck_no}</span>
            </div>
            <div className="mobile-detail-row">
              <span className="mobile-detail-label">Mark/Hold:</span>
              <span className="mobile-detail-value">
                                                                   <HoldCell
                    truck={truck}
                    currentUserId={currentUserId}
                    onHoldClick={onHoldClick}
                    onRemoveHold={onRemoveHold}
                    onHoldExpired={onHoldExpired}
                    serverTimeOffset={serverTimeOffset}
                  />
              </span>
            </div>
            <div className="mobile-detail-row">
              <span className="mobile-detail-label">Contact phone:</span>
              <span 
                className="mobile-detail-value mobile-phone"
                onClick={() => handlePhoneClick(truck.contactphone)}
                title="Click to copy contact phone"
              >
                {truck.contactphone}
              </span>
            </div>
            <div className="mobile-detail-row">
              <span className="mobile-detail-label">Cell phone:</span>
              <span 
                className="mobile-detail-value mobile-phone"
                onClick={() => handlePhoneClick(truck.cell_phone)}
                title="Click to copy cell phone"
              >
                {truck.cell_phone}
              </span>
            </div>
            <div className="mobile-detail-row">
              <span className="mobile-detail-label">Location:</span>
              <span className="mobile-detail-value">{truck.city_state_zip}</span>
            </div>
            <div className="mobile-detail-row">
              <span className="mobile-detail-label">Dimensions:</span>
              <span 
                className="mobile-detail-value mobile-dimensions"
                onClick={() => handleDimensionsClick(truck)}
                title="Click to copy driver information"
              >
                {truck.dimensions_payload}
              </span>
            </div>
            <div className="mobile-detail-row">
              <span className="mobile-detail-label">Updated:</span>
              <span className="mobile-detail-value">{formatDate(truck.arrival_time)}</span>
            </div>
            {truck.comment && (
              <div className="mobile-detail-row">
                <span className="mobile-detail-label">Comment:</span>
                <span 
                  className="mobile-detail-value mobile-comment"
                  onClick={() => onCommentClick(truck.comment)}
                  title={truck.comment}
                >
                  {truck.comment}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="table-wrapper">
      {/* Mobile view */}
      <div className="mobile-view">
        <div className="mobile-header">
          <div className="mobile-header-left">
            <input
              type="checkbox"
              checked={isAllSelectedOnPage}
              onChange={onSelectAll}
              title="Select all visible trucks"
              className="mobile-select-all"
            />
            <span className="mobile-header-title">Drivers ({trucks.length})</span>
          </div>
          <button
            onClick={handleRefreshClick}
            disabled={isRefreshing || isUpdated}
            className={`mobile-refresh-btn ${isRefreshing ? 'refreshing' : ''} ${isUpdated ? 'updated' : ''}`}
            title={isUpdated ? "Table updated" : "Refresh table data"}
          >
            {isUpdated ? (
              <span className="updated-text">✓</span>
            ) : (
              <span className={`refresh-icon ${isRefreshing ? 'rotating' : ''}`}>
                ↻
              </span>
            )}
          </button>
        </div>
        
        <div className="mobile-cards-container">
          {trucks.map(truck => (
            <MobileCard key={truck.id || truck.truck_no} truck={truck} currentUserId={currentUserId} />
          ))}
        </div>
      </div>

      {/* Desktop table view */}
      <table className="styled-table desktop-view">
        <thead>
          <tr>
            <th className="col-select">
              <input
                type="checkbox"
                checked={isAllSelectedOnPage}
                onChange={onSelectAll}
                title="Select all visible trucks"
              />
            </th>
            <th className="col-truck-no" style={{ cursor: 'pointer' }} onClick={() => onSort('truck_no')}>
              <div className="header-content">
                №
                {sortConfig.field === 'truck_no' && (
                  <span className="sort-indicator">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                )}
              </div>
            </th>
            <th className="col-loads-mark">Mark/Hold</th>
            <th className="col-status">Status</th>
            <th className="col-when">Updated</th>
            <th className="col-driver">Driver name</th>
            <th className="col-contact">Contact phone</th>
            <th className="col-cell">Cell phone</th>
            <th className="col-city">City, State zipCode</th>
            <th className="col-distance" style={{ cursor: 'pointer' }} onClick={() => onSort('distance')}>
              <div className="header-content">
                Distance
                {sortConfig.field === 'distance' && (
                  <span className="sort-indicator">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                )}
              </div>
            </th>
            <th className="col-dimensions">
              <div className="header-content">
                Dimensions
              </div>
            </th>
            <th className="col-comment">
              <button
                onClick={handleRefreshClick}
                disabled={isRefreshing || isUpdated}
                className={`refresh-table-btn ${isRefreshing ? 'refreshing' : ''} ${isUpdated ? 'updated' : ''}`}
                title={isUpdated ? "Table updated" : "Refresh table data"}
              >
                {isUpdated ? (
                  <span className="updated-text">updated</span>
                ) : (
                  <span className={`refresh-icon ${isRefreshing ? 'rotating' : ''}`}>
                    ↻
                  </span>
                )}
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {trucks.map(truck => (
            <tr key={truck.id || truck.truck_no} data-driver-id={truck.id}>
              <td className="col-select">
                <input
                  type="checkbox"
                  checked={selectedTrucks.includes(truck.id)}
                  onChange={() => onSelectTruck(truck.id)}
                />
              </td>
              <td className="col-truck-no">{truck.truck_no}</td>
              <td className="col-loads-mark">
                <HoldCell
                  truck={truck}
                  currentUserId={currentUserId}
                  onHoldClick={onHoldClick}
                  onRemoveHold={onRemoveHold}
                  onHoldExpired={onHoldExpired}
                  serverTimeOffset={serverTimeOffset}
                />
              </td>
              <td className="col-status">
                <StatusBadge 
                  status={truck.status} 
                  truck={truck} 
                  onClick={onEdit} 
                />
              </td>
              <td className="col-when">{formatDate(truck.arrival_time)}</td>
              <td className="col-driver">{truck.driver_name}</td>
              <td className="col-contact">{truck.contactphone}</td>
              <td className="col-cell">{truck.cell_phone}</td>
              <td 
                className="col-city location-clickable" 
                onClick={() => onLocationClick && onLocationClick(truck)}
                style={{ cursor: onLocationClick ? 'pointer' : 'default' }}
                title={onLocationClick ? "Click to view location history" : ""}
              >
                {truck.city_state_zip}
              </td>
              {distances[truck.id] ? (
                <DistanceCell distanceData={distances[truck.id]} />
              ) : (
                <td className="col-distance">-</td>
              )}
              <td 
                className="col-dimensions" 
                onClick={() => handleDimensionsClick(truck)}
                style={{ cursor: 'pointer' }}
                title="Click to copy driver information"
              >
                {truck.dimensions_payload}
              </td>
              <td className="col-comment">
                {truck.comment ? (
                  <span 
                    className="comment-preview" 
                    onClick={() => onCommentClick(truck.comment)}
                    title={truck.comment}
                  >
                    {commentPreview(truck.comment)}
                  </span>
                ) : (
                  '-'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      
      {/* Toast notification */}
      {showToast && (
        <div className="toast-notification">
          {toastMessage}
        </div>
      )}
    </div>
  );
};

export default TruckTable; 
