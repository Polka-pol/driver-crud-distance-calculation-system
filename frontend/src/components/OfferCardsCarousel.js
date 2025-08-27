import React, { useState, useRef, useEffect } from 'react';
import './OfferCardsCarousel.css';

const OfferCardsCarousel = ({ offers, selectedOffer, onOfferSelect }) => {
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const scrollContainerRef = useRef(null);

  // Check scroll position to show/hide navigation arrows
  const checkScrollPosition = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    setCanScrollLeft(container.scrollLeft > 0);
    setCanScrollRight(
      container.scrollLeft < container.scrollWidth - container.clientWidth
    );
  };

  useEffect(() => {
    checkScrollPosition();
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', checkScrollPosition);
      return () => container.removeEventListener('scroll', checkScrollPosition);
    }
  }, [offers]);

  const scrollLeft = () => {
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollBy({ left: -300, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollBy({ left: 300, behavior: 'smooth' });
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'active':
        return '🔥';
      case 'completed':
        return '✅';
      case 'cancelled':
        return '❌';
      default:
        return '📝';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active':
        return 'status-active';
      case 'completed':
        return 'status-completed';
      case 'cancelled':
        return 'status-cancelled';
      default:
        return 'status-draft';
    }
  };

  const formatRoute = (pickup, delivery) => {
    const formatLocation = (location) => {
      if (!location) return 'Unknown';
      const parts = location.split(',');
      return parts[0].trim(); // Get city name
    };

    return `${formatLocation(pickup)} → ${formatLocation(delivery)}`;
  };

  const formatRate = (rate) => {
    return rate ? `$${Math.round(rate).toLocaleString()}` : '$0';
  };

  const getDriverCount = (offer) => {
    return offer.proposals?.length || 0;
  };

  const getNewResponsesCount = (offer) => {
    if (!offer.proposals) return 0;
    // Count proposals with recent activity (within last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    return offer.proposals.filter(proposal => 
      proposal.responded_at && new Date(proposal.responded_at) > oneHourAgo
    ).length;
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

  if (!offers || offers.length === 0) {
    return (
      <div className="offers-carousel">
        <div className="no-offers">
          <p>No offers available. Create your first offer to get started.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="offers-carousel">
      {/* Left Arrow */}
      {canScrollLeft && (
        <button className="carousel-arrow carousel-arrow-left" onClick={scrollLeft}>
          ◀
        </button>
      )}

      {/* Offer Cards Container */}
      <div className="offers-scroll-container" ref={scrollContainerRef}>
        <div className="offers-cards">
          {offers.map(offer => {
            const isSelected = selectedOffer?.id === offer.id;
            const driverCount = getDriverCount(offer);
            const newResponses = getNewResponsesCount(offer);
            
            return (
              <div
                key={offer.id}
                className={`offer-card ${isSelected ? 'selected' : ''} ${getStatusColor(offer.status)}`}
                onClick={() => onOfferSelect(offer)}
              >
                <div className="card-header">
                  <div className="offer-id">
                    <span className="status-icon">{getStatusIcon(offer.status)}</span>
                    <span className="id-text">#{offer.id}</span>
                  </div>
                  <div className="offer-status">
                    {offer.status}
                  </div>
                </div>

                <div className="card-content">
                  <div className="route">
                    {formatRoute(offer.pickup_location, offer.delivery_location)}
                  </div>
                  
                  <div className="rate">
                    {formatRate(offer.proposed_rate)}
                  </div>

                  <div className="drivers-info">
                    <span className="driver-count">
                      🚛 {driverCount} driver{driverCount !== 1 ? 's' : ''}
                    </span>
                    {newResponses > 0 && (
                      <span className="new-responses">
                        🔔 {newResponses} new
                      </span>
                    )}
                  </div>

                  <div className="time-info">
                    {offer.status === 'active' && driverCount > 0 ? (
                      <span className="activity">⏰ {getTimeAgo(offer.updated_at)}</span>
                    ) : offer.status === 'completed' ? (
                      <span className="completed">🎉 Success</span>
                    ) : offer.status === 'cancelled' ? (
                      <span className="cancelled">❌ Cancelled</span>
                    ) : (
                      <span className="draft">📤 Just sent</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Arrow */}
      {canScrollRight && (
        <button className="carousel-arrow carousel-arrow-right" onClick={scrollRight}>
          ▶
        </button>
      )}
    </div>
  );
};

export default OfferCardsCarousel;
