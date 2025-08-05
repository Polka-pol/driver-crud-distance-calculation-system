import React, { useEffect, useState, useMemo } from 'react';
import './App.css';
import './styles/modalScrollLock.css';
import { calculateDistancesForDrivers } from './utils/distanceCalculator';
import SearchBar from './components/SearchBar';
import AddressSearchBar from './components/AddressSearchBar';
import TruckTable from './components/TruckTable';
import EditModal from './components/EditModal';
import NewDriverModal from './components/NewDriverModal';
import LocationHistoryModal from './components/LocationHistoryModal';
import Pagination from './components/Pagination';
import LoginPage from './components/LoginPage';
import AdminPage from './components/AdminPage';
import DispatcherDashboard from './components/DispatcherDashboard';
import MapPage from './components/MapPage';
import { isAuthenticated, logout, getCurrentUser } from './utils/auth';
import { apiClient } from './utils/apiClient';
import { API_BASE_URL } from './config';
import { useModalScrollLock } from './utils/modalScrollLock';

function App() {
  const [user, setUser] = useState(getCurrentUser());
  const [isAuth, setIsAuth] = useState(isAuthenticated());
  const [view, setView] = useState('main');
  const [trucks, setTrucks] = useState([]);
  const [distances, setDistances] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchTruckNo, setSearchTruckNo] = useState('');
  const [searchLoadsMark, setSearchLoadsMark] = useState('');
  const [searchDriver, setSearchDriver] = useState('');
  const [searchPhone, setSearchPhone] = useState('');
  const [updatedFilter, setUpdatedFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState([]);
  const [activeSearch, setActiveSearch] = useState({});
  const [modalComment, setModalComment] = useState(null);
  const [editModal, setEditModal] = useState(null);
  const [editedTruck, setEditedTruck] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState({ field: null, direction: 'asc' });
  const [selectedTrucks, setSelectedTrucks] = useState([]);
  const itemsPerPage = 50;
  const [searchQuery, setSearchQuery] = useState('');
  const [isDestinationChosen, setIsDestinationChosen] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [showSlowMessage, setShowSlowMessage] = useState(false);
  const [showNewDriverModal, setShowNewDriverModal] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isUpdated, setIsUpdated] = useState(false);
  const [originalTruck, setOriginalTruck] = useState(null); // Track original data for comparison
  const [locationHistoryModal, setLocationHistoryModal] = useState({
    isOpen: false,
    truckId: null,
    truckNumber: null,
    driverName: null
  });

  const handleLoginSuccess = (userData) => {
    setUser(userData);
    setIsAuth(true);
  };

  const handleLogout = () => {
    logout();
  };

  const handleManualRefresh = async () => {
    if (isRefreshing) return;
    
    try {
      setIsRefreshing(true);
      const response = await apiClient(`${API_BASE_URL}/trucks`);
      if (!response.ok) {
        throw new Error('Failed to fetch data');
      }
      const data = await response.json();
      setTrucks(data);
      setDistances({}); // Clear all calculated distances
      setError(null); // Clear any previous errors
      
      // Set updated state to show visual feedback
      setIsUpdated(true);
      setTimeout(() => {
        setIsUpdated(false);
      }, 5000);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    document.title = 'Connex Transport';
    if (!isAuth) return;

    const fetchTrucks = async () => {
      try {
        setIsLoading(true);
        const response = await apiClient(`${API_BASE_URL}/trucks`);
        if (!response.ok) {
          throw new Error('Failed to fetch data');
        }
        const data = await response.json();
        setTrucks(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTrucks();
  }, [isAuth]);

  // Prevent body scroll when comment modal is open
  useModalScrollLock(!!modalComment);

  const handleSearchChange = (field, value) => {
    switch (field) {
      case 'truck_no':
        setSearchTruckNo(value);
        break;
      case 'loads_mark':
        setSearchLoadsMark(value);
        break;
      case 'driver_name':
        setSearchDriver(value);
        break;
      case 'phone':
        setSearchPhone(value);
        break;
      case 'updated_filter':
        setUpdatedFilter(value);
        break;
      case 'status_filter':
        setStatusFilter(value);
        break;
      default:
        break;
    }
  };

  const handleSearch = () => {
    setCurrentPage(1);
    setActiveSearch({
      truck_no: searchTruckNo,
      loads_mark: searchLoadsMark,
      driver_name: searchDriver,
      phone: searchPhone,
      updated_filter: updatedFilter,
      status_filter: statusFilter
    });
  };

  const handleReset = () => {
    setSearchTruckNo('');
    setSearchLoadsMark('');
    setSearchDriver('');
    setSearchPhone('');
    setUpdatedFilter('');
    setStatusFilter([]);
    setActiveSearch({});
    setCurrentPage(1);
  };

  const handleSort = (field) => {
    setSortConfig(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
    setCurrentPage(1);
  };

  const sortTrucks = useMemo(() => {
    return (a, b) => {
      if (!sortConfig.field) return 0;

      if (sortConfig.field === 'truck_no') {
        const aNum = parseInt(a.truck_no?.toString().replace(/\D/g, '')) || 0;
        const bNum = parseInt(b.truck_no?.toString().replace(/\D/g, '')) || 0;
        return sortConfig.direction === 'asc' ? aNum - bNum : bNum - aNum;
      }

      if (sortConfig.field === 'distance') {
        const aDistance = distances[a.id]?.distance;
        const bDistance = distances[b.id]?.distance;
        
        const aHasValue = aDistance !== undefined && aDistance !== null;
        const bHasValue = bDistance !== undefined && bDistance !== null;

        if (aHasValue && !bHasValue) {
          return -1; // `a` comes first
        }
        if (!aHasValue && bHasValue) {
          return 1; // `b` comes first
        }
        if (!aHasValue && !bHasValue) {
          return 0; // Both are empty, order doesn't matter
        }

        // Both have values, sort them
        return sortConfig.direction === 'asc' ? aDistance - bDistance : bDistance - aDistance;
      }

      return 0;
    };
  }, [sortConfig, distances]);

  const filteredTrucks = useMemo(() => {
    return trucks
      .filter(truck => {
        const truckNoMatch = !activeSearch.truck_no || truck.truck_no?.toString().toLowerCase().includes(activeSearch.truck_no.toLowerCase());
        const loadsMarkMatch = !activeSearch.loads_mark || truck.loads_mark?.toLowerCase().includes(activeSearch.loads_mark.toLowerCase());
        const driverMatch = !activeSearch.driver_name || truck.driver_name?.toLowerCase().includes(activeSearch.driver_name.toLowerCase());
        const phoneMatch = !activeSearch.phone || (
          (truck.cell_phone?.toLowerCase().includes(activeSearch.phone.toLowerCase())) ||
          (truck.contactphone?.toLowerCase().includes(activeSearch.phone.toLowerCase()))
        );

        // Add updated filter logic
        const now = new Date();
        const truckDate = new Date(truck.arrival_time);
        let updatedMatch = true;

        if (activeSearch.updated_filter) {
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const truckDay = new Date(truckDate.getFullYear(), truckDate.getMonth(), truckDate.getDate());
          const diffDays = Math.floor((today - truckDay) / (1000 * 60 * 60 * 24));

          switch (activeSearch.updated_filter) {
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

        // Add status filter logic
        const statusMatch = !activeSearch.status_filter?.length || 
          activeSearch.status_filter.includes(truck.status?.toLowerCase());

        return truckNoMatch && loadsMarkMatch && driverMatch && phoneMatch && updatedMatch && statusMatch;
      })
      .sort(sortTrucks);
  }, [trucks, activeSearch, sortTrucks]);

  const paginationData = useMemo(() => {
    const totalPages = Math.ceil(filteredTrucks.length / itemsPerPage);
    const paginatedTrucks = filteredTrucks.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    return { totalPages, paginatedTrucks };
  }, [filteredTrucks, currentPage, itemsPerPage]);

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
  };

  const handleEditSubmit = async () => {
    try {
      // Compare editedTruck with originalTruck to find changed fields
      const changedFields = {};
      
      if (originalTruck && editedTruck) {
        Object.keys(editedTruck).forEach(key => {
          // Skip internal fields that shouldn't be sent to API
          if (['id', 'updated_by', 'updated_at'].includes(key)) {
            return;
          }
          
          // Compare values, handling null/undefined cases
          const originalValue = originalTruck[key] || '';
          const editedValue = editedTruck[key] || '';
          
          if (originalValue !== editedValue) {
            changedFields[key] = editedValue;
          }
        });
      }
      
      // If no changes, just close the modal
      if (Object.keys(changedFields).length === 0) {
        setEditModal(null);
        setEditedTruck(null);
        setOriginalTruck(null);
        return;
      }
      
      // Add the truck ID to the payload
      const updatePayload = {
        id: editedTruck.id,
        ...changedFields
      };
      
      const response = await apiClient(`${API_BASE_URL}/trucks/update`, {
        method: 'POST',
        body: JSON.stringify(updatePayload)
      });
      const res = await response.json();
      if (res.success) {
        setTrucks(prevTrucks => 
          prevTrucks.map(truck => 
            truck.id === editedTruck.id ? editedTruck : truck
          )
        );
        setEditModal(null);
        setEditedTruck(null);
        setOriginalTruck(null);
      } else {
        alert('Failed to update truck: ' + (res.message || 'Unknown error'));
      }
    } catch (error) {
      alert('Error updating truck: ' + error.message);
    }
  };

  const handleAddNewDriver = (newlyAddedTruck) => {
    setTrucks(prevTrucks => [newlyAddedTruck, ...prevTrucks]);
    // Optionally, you can sort or go to the first page here
    handleReset(); // To clear filters and show the new driver
  };

  const handleLocationClick = (truck) => {
    setLocationHistoryModal({
      isOpen: true,
      truckId: truck.id,
      truckNumber: truck.truck_no,
      driverName: truck.driver_name
    });
  };

  const handleLocationHistoryClose = () => {
    setLocationHistoryModal({
      isOpen: false,
      truckId: null,
      truckNumber: null,
      driverName: null
    });
  };

  const handleEditChange = (field, value) => {
    if (field === 'arrival_time' && value) {
    }
    setEditedTruck(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleDelete = async (id) => {
    const truckToDelete = trucks.find(t => t.id === id);
    if (!truckToDelete) return;
    
    // eslint-disable-next-line no-restricted-globals
    const confirmed = confirm(`Are you sure you want to delete truck #${truckToDelete.truck_no}?`);
    if (!confirmed) return;

    try {
      const response = await apiClient(`${API_BASE_URL}/trucks/delete`, {
        method: 'POST',
        body: JSON.stringify({ id: id })
      });
      const res = await response.json();
      if (!res.success) throw new Error(res.message || 'Failed to delete');
      
      setTrucks(trucks.filter(t => t.id !== id));
      setDistances(prev => {
        const newDistances = { ...prev };
        delete newDistances[id];
        return newDistances;
      });
      
      // Close the modal after successful deletion
      setEditModal(null);
      setEditedTruck(null);
      setOriginalTruck(null);

    } catch (err) {
      alert(err.message);
    }
  };

  const handleCalculate = async () => {
    if (!searchQuery) return;
    
    // Refresh table data before starting calculation
    await handleManualRefresh();
    
    setIsCalculating(true);
    setShowSlowMessage(false); // Reset on new calculation
    setSortConfig({ field: 'distance', direction: 'asc' });
    setError(null);

    const slowCalculationTimer = setTimeout(() => {
        setShowSlowMessage(true);
    }, 4000); // Show message after 4 seconds

    const onDistancesUpdate = (newDistances) => {
      setDistances(prev => {
          const updated = { ...prev };
          newDistances.forEach(d => {
              if (d.distance !== undefined && d.distance !== null) {
                  updated[d.driverId] = {
                      distance: d.distance,
                      source: d.source
                  };
              }
          });
          return updated;
      });
    };

    const onCalculationEnd = () => {
        clearTimeout(slowCalculationTimer);
        setIsCalculating(false);
        setShowSlowMessage(false);
    };

    try {
        await calculateDistancesForDrivers(searchQuery, onDistancesUpdate, onCalculationEnd);
    } catch (error) {
        clearTimeout(slowCalculationTimer); // Ensure timer is cleared on error
        setShowSlowMessage(false);
        if (error.message && error.message.includes('Mapbox API token is invalid or expired')) {
            setError("Distance calculation service is temporarily unavailable. The Mapbox token is no longer valid. Please contact support.");
        } else if (error.message && error.message.includes('Mapbox servers are busy')) {
            setError("⏳ Mapbox servers are busy. Processing may take longer than usual..");
        } else {
            setError("Something went wrong during calculation. Please try again.");
        }
        setIsCalculating(false);
    }
  };

  const handleSelectTruck = (truckId, isArray) => {
    if (isArray) {
      setSelectedTrucks(truckId);
    } else {
      setSelectedTrucks(prev => {
        if (prev.includes(truckId)) {
          return prev.filter(id => id !== truckId);
        } else {
          return [...prev, truckId];
        }
      });
    }
  };

  const handleSelectAllTrucks = () => {
    if (selectedTrucks.length === paginationData.paginatedTrucks.length) {
      setSelectedTrucks([]);
    } else {
      const currentIds = paginationData.paginatedTrucks.map(truck => truck.id);
      setSelectedTrucks(currentIds);
    }
  };

  const handleCopyNumbers = () => {
    const numbers = selectedTrucks
      .map(id => {
        const truck = trucks.find(t => t.id === id);
        if (!truck) return null;
        return truck.contactphone || truck.cell_phone;
      })
      .filter(number => number) // Remove null/undefined values
      .join(', ');

    if (numbers) {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(numbers)
          .then(() => {
            setSelectedTrucks([]); // Clear selection after successful copy
          })
          .catch(err => {
            console.error('Failed to copy numbers: ', err);
            fallbackCopyToClipboard(numbers);
          });
      } else {
        fallbackCopyToClipboard(numbers);
      }
    }
  };

  const fallbackCopyToClipboard = (text) => {
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
      setSelectedTrucks([]); // Clear selection after successful copy
    } catch (err) {
      console.error('Failed to copy numbers: ', err);
      textArea.remove();
    }
  };

  // If not authenticated, show the login page
  if (!isAuth) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  // --- Main App Render ---
  return (
    <div className="app-bg">
      <div className="container">
        <div className="app-header">
          <div className="header-left">
            <h1>Connex Transport</h1>
          </div>
          <div className="header-right">
            {user && (
              <div className="user-welcome">
                <span className="user-name">{user.fullName}</span>
                <span className="user-phone">{user.mobile_number || user.mobileNumber}</span>
              </div>
            )}
            <div className="header-actions">
              <button onClick={() => setShowNewDriverModal(true)} className="new-driver-btn">
                <span className="btn-icon">+</span>
                <span className="btn-text">New Driver</span>
              </button>
              <button onClick={() => setView('map')} className="header-btn map-btn">
                <span className="btn-text">Map</span>
              </button>
              <button onClick={() => setView('dispatcher')} className="header-btn dispatcher-btn">
                <span className="btn-text">Activity</span>
              </button>
              {(user?.role === 'manager' || user?.role === 'admin') && (
                <button onClick={() => setView('admin')} className="header-btn admin-btn">
                  <span className="btn-text">Admin</span>
                </button>
              )}
              <button onClick={handleLogout} className="header-btn logout-btn">
                <span className="btn-text">Logout</span>
              </button>
            </div>
          </div>
        </div>
        
        {view === 'main' ? (
          <>
        {error && (
          <div className={error.includes('⏳') ? "rate-limit-message" : "error-message"}>
            {error}
          </div>
        )}

        <div className="full-width-search">
              <AddressSearchBar
                query={searchQuery}
                onQueryChange={(newQuery) => {
                  setSearchQuery(newQuery);
                  setIsDestinationChosen(false); // Reset when user types
                }}
                onSelect={(selectedAddress) => {
                  setSearchQuery(selectedAddress);
                  setIsDestinationChosen(true); // Set when a suggestion is selected
                }}
                placeholder="Enter destination for distance calculation..."
          />
              <button className="calculate-btn" onClick={handleCalculate} disabled={!isDestinationChosen || isCalculating}>
                {isCalculating ? 'Calculating...' : 'Calculate'}
              </button>
              {isCalculating && showSlowMessage && (
                <span className="slow-calculation-message">
                  The servers are busy. This may take a little longer...
                </span>
              )}
        </div>

            <SearchBar
              searchTruckNo={searchTruckNo}
              searchLoadsMark={searchLoadsMark}
              searchDriver={searchDriver}
              searchPhone={searchPhone}
              updatedFilter={updatedFilter}
              statusFilter={statusFilter}
              onSearchChange={handleSearchChange}
              onSearch={handleSearch}
              onReset={handleReset}
            />

        {isLoading ? (
          <div className="loading-spinner">
            <div className="spinner"></div>
            <p>Loading data...</p>
          </div>
        ) : (
          <>
            {selectedTrucks.length > 0 && (
              <div className="floating-selection-overlay">
                <div className="floating-selection-menu">
                  <div className="selection-info">
                    <span className="selection-count">{selectedTrucks.length}</span>
                    <span className="selection-text">truck(s) selected</span>
                  </div>
                  <div className="action-buttons">
                    <button 
                      className="action-btn"
                      onClick={handleCopyNumbers}
                      title="Copy phone numbers of selected trucks"
                    >
                      📋 Copy
                    </button>
                    <button 
                      className="reset-btn" 
                      onClick={() => setSelectedTrucks([])}
                      title="Clear selection"
                    >
                      ✕ Clear
                    </button>
                  </div>
                </div>
              </div>
            )}
            <TruckTable
                  trucks={paginationData.paginatedTrucks}
              distances={distances}
              sortConfig={sortConfig}
              onSort={handleSort}
                  onEdit={(truck) => {
                    setEditedTruck(truck);
                    setOriginalTruck({ ...truck }); // Store original data for comparison
                    setEditModal(true);
                  }}
                  onCommentClick={setModalComment}
              selectedTrucks={selectedTrucks}
              onSelectTruck={handleSelectTruck}
                  onSelectAll={handleSelectAllTrucks}
              onRefresh={handleManualRefresh}
              isRefreshing={isRefreshing}
              isUpdated={isUpdated}
              onLocationClick={handleLocationClick}
            />

            <Pagination
              currentPage={currentPage}
              totalPages={paginationData.totalPages}
              totalItems={filteredTrucks.length}
              onPageChange={handlePageChange}
            />
          </>
        )}

        {modalComment !== null && (
          <div className="modal-overlay" onClick={() => setModalComment(null)}>
            <div className="modal-content" onClick={e => {
              if (e && e.stopPropagation) e.stopPropagation();
              if (e && e.preventDefault) e.preventDefault();
            }}>
              <h2>Comment</h2>
              <div className="comment-text">{modalComment}</div>
              <button className="reset-btn" onClick={() => setModalComment(null)}>Close</button>
            </div>
          </div>
        )}

        {editModal && (
          <EditModal
            editedTruck={editedTruck}
                userRole={user?.role}
            onClose={() => {
              setEditModal(null);
              setEditedTruck(null);
              setOriginalTruck(null);
            }}
            onSave={handleEditSubmit}
                onDelete={handleDelete}
            onChange={handleEditChange}
          />
        )}

        {showNewDriverModal && (
          <NewDriverModal
            user={user}
            onClose={() => setShowNewDriverModal(false)}
            onDriverAdded={handleAddNewDriver}
          />
        )}

        {locationHistoryModal.isOpen && (
          <LocationHistoryModal
            isOpen={locationHistoryModal.isOpen}
            onClose={handleLocationHistoryClose}
            truckId={locationHistoryModal.truckId}
            truckNumber={locationHistoryModal.truckNumber}
            driverName={locationHistoryModal.driverName}
          />
        )}
          </>
        ) : view === 'admin' ? (
          <AdminPage onBack={() => setView('main')} user={user} />
        ) : view === 'dispatcher' ? (
          <DispatcherDashboard onBack={() => setView('main')} user={user} />
        ) : view === 'map' ? (
          <MapPage onBack={() => setView('main')} user={user} />
        ) : null}
      </div>
    </div>
  );
}

export default App;
