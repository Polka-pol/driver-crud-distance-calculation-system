import React, { useMemo } from 'react';
import './DistanceCell.css';

// Memoized badge colors to prevent object recreation
const BADGE_COLORS = {
  cache: '#4CAF50',
  mapbox: '#2196F3',
  preliminary: '#FF9800',
  'no-coords-available': '#9E9E9E' // Gray color for no coordinates available
};

// Conversion constant
const METERS_TO_MILES = 1609.34;

const DistanceCell = React.memo(({ distanceData }) => {
  // Memoize the distance calculation - always called
  const distanceMiles = useMemo(() => {
    if (distanceData?.distance === undefined || distanceData?.distance === null) return null;
    return Math.round(distanceData.distance / METERS_TO_MILES);
  }, [distanceData?.distance]);

  // Memoize the source text - always called
  const sourceText = useMemo(() => {
    if (!distanceData?.source) return null;
    
    // Map sources to shorter, clearer names
    const sourceMap = {
      'cache': 'CACHE',
      'mapbox': 'MAPBOX',
      'preliminary': 'APPROX',
      'no-coords-available': 'NO GPS'
    };
    
    return sourceMap[distanceData.source] || distanceData.source.toUpperCase();
  }, [distanceData?.source]);

  // Render empty state if no distance data
  if (distanceData?.distance === undefined || distanceData?.distance === null) {
    return (
      <td className="col-distance">
        <div className="distance-info">
          <span className="distance-value">-</span>
        </div>
      </td>
    );
  }
  
  return (
    <td className="col-distance">
      <div className="distance-info">
        <span className="distance-value">{distanceMiles} mil.</span>
        <span 
          className={`source-badge source-badge-${distanceData.source}`}
          style={{
            backgroundColor: BADGE_COLORS[distanceData.source]
          }}
        >
          {sourceText}
        </span>
      </div>
    </td>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for memo
  return prevProps.distanceData?.distance === nextProps.distanceData?.distance &&
         prevProps.distanceData?.source === nextProps.distanceData?.source;
});

DistanceCell.displayName = 'DistanceCell';

export default DistanceCell; 