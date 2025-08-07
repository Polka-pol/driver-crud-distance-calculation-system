import React from 'react';
import './StatusBadge.css';

const StatusBadge = ({ status, truck, onClick }) => {
  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'available': return '#27ae60';
      case 'unavailable': return '#e74c3c';
      case 'local': return '#8e5c2e';
      case 'out of service': return '#f39c12';
      case 'updated': return '#2980b9';
      default: return '#333';
    }
  };

  return (
    <span 
      className="status-badge" 
      style={{ background: getStatusColor(status) }}
      onClick={() => onClick(truck)}
      title="Click to edit driver information"
    >
      {status}
    </span>
  );
};

export default StatusBadge; 