import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './MapPage.css';
import { apiClient } from '../utils/apiClient';
import { API_BASE_URL } from '../config';
import { getCurrentEDT } from '../utils/timeUtils';

// Fix default markers for Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

function MapPage({ onBack, user }) {
  const [trucks, setTrucks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [updatedFilter, setUpdatedFilter] = useState('3days');
  const [selectedType, setSelectedType] = useState('all');

  // Status colors
  const statusColors = {
    'Available': '#28a745',
    'Available on': '#17a2b8', 
    'Local': '#fd7e14',
    'Unavailable': '#dc3545',
    'default': '#6c757d'
  };

  // Updated filter options
  const updatedOptions = [
    { value: '', label: 'All Updates' },
    { value: 'today', label: 'Today' },
    { value: '3days', label: 'Last 3 Days' },
    { value: '5days', label: 'Last 5 Days' }
  ];

  // Type filter options
  const typeFilterOptions = [
    { value: 'all', label: 'All Types' },
    { value: 'reefer', label: 'Reefer' },
    { value: 'team', label: 'Team' },
    { value: 'twic', label: 'TWIC' },
    { value: 'tsa', label: 'TSA' },
    { value: 'g2', label: 'G2' }
  ];

  const fetchTrucks = useCallback(async () => {
    try {
      setLoading(true);
      const url = `${API_BASE_URL}/trucks/map`;
      const response = await apiClient(url);
      if (!response.ok) {
        throw new Error('Failed to fetch trucks data');
      }
      const data = await response.json();
      setTrucks(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrucks();
  }, [fetchTrucks]);

  // Create custom icons for each status
  const createCustomIcon = (status) => {
    const color = statusColors[status] || statusColors.default;
    return L.divIcon({
      className: 'custom-marker',
      html: `<div style="background-color: ${color}; width: 20px; height: 20px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });
  };

  // Filter trucks based on selected status, updated filter, and type filters
  const filteredTrucks = useMemo(() => {
    return trucks.filter(truck => {
      // Status filter
      const statusMatch = selectedStatus === 'all' || truck.status === selectedStatus;
      
      // Updated filter logic (same as in App.js)
      let updatedMatch = true;
      if (updatedFilter) {
        const now = getCurrentEDT();
        const truckDate = new Date(truck.arrival_time);
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const truckDay = new Date(truckDate.getFullYear(), truckDate.getMonth(), truckDate.getDate());
        const diffDays = Math.floor((today - truckDay) / (1000 * 60 * 60 * 24));
        
        switch (updatedFilter) {
          case 'today':
            updatedMatch = diffDays === 0;
            break;
          case '3days':
            updatedMatch = diffDays >= 0 && diffDays <= 3;
            break;
          case '5days':
            updatedMatch = diffDays >= 0 && diffDays <= 5;
            break;
          default:
            updatedMatch = true;
        }
      }
      
      // Type filter logic
      let typeMatch = true;
      
      if (selectedType !== 'all') {
        typeMatch = false;
        
        // Check reefer filter (search in driver name)
        if (selectedType === 'reefer' && truck.driver_name) {
          const driverName = truck.driver_name.toLowerCase();
          if (driverName.includes('reefer')) {
            typeMatch = true;
          }
        }
        
        // Check loads/mark filters (team, twic, tsa, g2)
        if (truck.loads_mark) {
          const loadsMarkLower = truck.loads_mark.toLowerCase();
          
          if (selectedType === 'team' && loadsMarkLower.includes('(team)')) {
            typeMatch = true;
          }
          if (selectedType === 'twic' && loadsMarkLower.includes('(twic)')) {
            typeMatch = true;
          }
          if (selectedType === 'tsa' && loadsMarkLower.includes('(tsa)')) {
            typeMatch = true;
          }
          if (selectedType === 'g2' && loadsMarkLower.includes('(g2)')) {
            typeMatch = true;
          }
        }
      }
      
      return statusMatch && updatedMatch && typeMatch;
    });
  }, [trucks, selectedStatus, updatedFilter, selectedType]);

  const getStatusCounts = () => {
    const counts = { all: trucks.length };
    trucks.forEach(truck => {
      counts[truck.status] = (counts[truck.status] || 0) + 1;
    });
    return counts;
  };

  const statusCounts = getStatusCounts();

  if (loading) {
    return (
      <div className="map-page">
        <div className="map-header">
          <h2>Truck Map</h2>
          <button onClick={onBack} className="back-btn">← Back to Main</button>
        </div>
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Loading trucks...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="map-page">
        <div className="map-header">
          <h2>Truck Map</h2>
          <button onClick={onBack} className="back-btn">← Back to Main</button>
        </div>
        <div className="error-container">
          <p>Error loading trucks: {error}</p>
          <button onClick={fetchTrucks} className="retry-btn">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="map-page">
      <div className="map-header">
        <h2>Truck Map ({filteredTrucks.length} of {trucks.length} trucks)</h2>
        <div className="map-controls">
          <select 
            value={selectedType} 
            onChange={(e) => setSelectedType(e.target.value)}
            className="type-filter"
          >
            {typeFilterOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          
          <select 
            value={updatedFilter} 
            onChange={(e) => setUpdatedFilter(e.target.value)}
            className="updated-filter"
          >
            {updatedOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select 
            value={selectedStatus} 
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="status-filter"
          >
            <option value="all">All Trucks ({statusCounts.all})</option>
            {Object.keys(statusColors).slice(0, -1).map(status => (
              statusCounts[status] ? (
                <option key={status} value={status}>
                  {status} ({statusCounts[status]})
                </option>
              ) : null
            ))}
          </select>
          
          <button onClick={onBack} className="back-btn">← Back to Main</button>
        </div>
      </div>
      
      <div className="map-container">
        <MapContainer 
          center={[39.8283, -98.5795]} 
          zoom={4} 
          style={{ height: '100%', width: '100%' }}
          className="leaflet-map"
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          
          {filteredTrucks.map(truck => {
            const color = statusColors[truck.status] || statusColors.default;
            return (
              <Marker
                key={truck.id}
                position={[truck.lat, truck.lon]}
                icon={createCustomIcon(truck.status)}
              >
                <Popup>
                  <div className="truck-popup">
                    <h4>🚚 Truck {truck.truck_no}</h4>
                    <p><strong>Status:</strong> <span style={{color}}>{truck.status}</span></p>
                    <p><strong>Driver:</strong> {truck.driver_name || 'N/A'}</p>
                    <p><strong>Phone:</strong> {truck.cell_phone || 'N/A'}</p>
                    <p><strong>Location:</strong> {truck.formatted_address || truck.city_state_zip}</p>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
        
        <div className="map-legend">
          <h4>Legend:</h4>
          {Object.entries(statusColors).slice(0, -1).map(([status, color]) => (
            statusCounts[status] ? (
              <div key={status} className="legend-item">
                <div 
                  className="legend-color" 
                  style={{ backgroundColor: color }}
                ></div>
                <span>{status} ({statusCounts[status]})</span>
              </div>
            ) : null
          ))}
        </div>
      </div>
    </div>
  );
}

export default MapPage; 