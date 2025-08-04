import React, { useState, useRef, useEffect } from 'react';
import './SearchBar.css';

const SearchBar = ({
  searchTruckNo,
  searchLoadsMark,
  searchDriver,
  searchPhone,
  updatedFilter,
  statusFilter,
  onSearchChange,
  onSearch,
  onReset
}) => {
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [isUpdatedDropdownOpen, setIsUpdatedDropdownOpen] = useState(false);
  const statusDropdownRef = useRef(null);
  const updatedDropdownRef = useRef(null);

  const statusOptions = [
    { value: 'available', label: 'Available' },
    { value: 'available on', label: 'Available on' },
    { value: 'unavailable', label: 'Unavailable' },
    { value: 'local', label: 'Local' },
    { value: 'out of service', label: 'Out of Service' },
    { value: 'updated', label: 'Updated' }
  ];

  const updatedOptions = [
    { value: '', label: 'All Updates' },
    { value: 'today', label: 'Today' },
    { value: '3days', label: 'Last 3 Days' },
    { value: '5days', label: 'Last 5 Days' }
  ];

  const handleStatusChange = (value) => {
    const newStatusFilter = statusFilter.includes(value)
      ? statusFilter.filter(status => status !== value)
      : [...statusFilter, value];
    onSearchChange('status_filter', newStatusFilter);
  };

  const handleUpdatedChange = (value) => {
    onSearchChange('updated_filter', value);
    setIsUpdatedDropdownOpen(false);
  };

  const handleClickOutside = (event) => {
    if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target)) {
      setIsStatusDropdownOpen(false);
    }
    if (updatedDropdownRef.current && !updatedDropdownRef.current.contains(event.target)) {
      setIsUpdatedDropdownOpen(false);
    }
  };

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div className="search-bar-group">
      <div className="search-bar-item truck-no">
        <input 
          className="search-bar" 
          type="text" 
          placeholder="Truck №" 
          value={searchTruckNo} 
          onChange={(e) => onSearchChange('truck_no', e.target.value)}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onSearch();
            }
          }}
        />
      </div>
      <div className="search-bar-item">
        <input 
          className="search-bar" 
          type="text" 
          placeholder="Loads/Mark" 
          value={searchLoadsMark} 
          onChange={(e) => onSearchChange('loads_mark', e.target.value)}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onSearch();
            }
          }}
        />
      </div>
      <div className="search-bar-item">
        <input 
          className="search-bar" 
          type="text" 
          placeholder="Driver name" 
          value={searchDriver} 
          onChange={(e) => onSearchChange('driver_name', e.target.value)}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onSearch();
            }
          }}
        />
      </div>
      <div className="search-bar-item">
        <input 
          className="search-bar" 
          type="text" 
          placeholder="Phone" 
          value={searchPhone} 
          onChange={(e) => onSearchChange('phone', e.target.value)}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onSearch();
            }
          }}
        />
      </div>
      <div className="search-bar-item" ref={updatedDropdownRef}>
        <div
          className="search-bar updated-filter-trigger"
          tabIndex={0}
          aria-expanded={isUpdatedDropdownOpen}
          onClick={() => setIsUpdatedDropdownOpen(!isUpdatedDropdownOpen)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') setIsUpdatedDropdownOpen(!isUpdatedDropdownOpen);
          }}
        >
          {updatedOptions.find(opt => opt.value === updatedFilter)?.label || 'All Updates'}
          <span className="status-filter-arrow">▼</span>
        </div>
        {isUpdatedDropdownOpen && (
          <div className="status-dropdown">
            {updatedOptions.map(option => (
              <div
                key={option.value}
                className={`status-option${updatedFilter === option.value ? ' selected' : ''}`}
                onClick={() => handleUpdatedChange(option.value)}
                tabIndex={0}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') handleUpdatedChange(option.value);
                }}
              >
                <span>{option.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="search-bar-item" ref={statusDropdownRef}>
        <div 
          className="search-bar status-filter-trigger"
          tabIndex={0}
          aria-expanded={isStatusDropdownOpen}
          onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') setIsStatusDropdownOpen(!isStatusDropdownOpen);
          }}
        >
          {statusFilter.length > 0 ? `${statusFilter.length} selected` : 'Status'}
          <span className="status-filter-arrow">▼</span>
        </div>
        {isStatusDropdownOpen && (
          <div className="status-dropdown">
            {statusOptions.map(option => (
              <label key={option.value} className="status-option">
                <input
                  type="checkbox"
                  checked={statusFilter.includes(option.value)}
                  onChange={() => handleStatusChange(option.value)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>
      <div className="search-bar-item buttons">
        <button className="search-btn" onClick={onSearch}>Search</button>
        <button className="reset-btn" onClick={onReset}>Reset</button>
      </div>
    </div>
  );
};

export default SearchBar; 