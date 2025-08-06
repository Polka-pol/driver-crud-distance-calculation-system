# Driver CRUD Distance Calculation System - Frontend Documentation

## Overview

The Driver CRUD Distance Calculation System Frontend is a React-based web application that provides dispatchers with a comprehensive dashboard for managing loads, drivers, and real-time communication.

## Technology Stack

- **React 18** - UI framework
- **JavaScript/JSX** - Programming language
- **CSS3** - Styling and responsive design
- **Axios** - HTTP client for API communication
- **React Router** - Client-side routing

## Project Structure

```
frontend/
├── public/                 # Static files
│   ├── index.html         # Main HTML file
│   └── favicon.ico        # App icon
├── src/                   # Source code
│   ├── components/        # React components
│   │   ├── ActivityDashboard.js
│   │   ├── AddressSearchBar.js
│   │   ├── DispatcherDashboard.js
│   │   ├── EditModal.js
│   │   ├── SearchBar.js
│   │   ├── TruckTable.js
│   │   └── UserModal.js
│   ├── config.js          # Configuration file
│   ├── App.js             # Main application component
│   └── index.js           # Application entry point
├── package.json           # Dependencies and scripts
└── env.example           # Environment variables template
```

## Setup Instructions

### Prerequisites
- Node.js 16+
- npm or yarn
- Backend API running

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd frontend
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**
```bash
cp env.example .env
# Edit .env with your configuration
```

4. **Configure API connection**
```bash
cp src/config.example.js src/config.js
# Edit src/config.js with your actual API URL
```

4. **Start development server**
```bash
npm start
```

The application will be available at `http://localhost:3000`

## Configuration

### Environment Variables

Create a `.env` file in the frontend directory:

```bash
# API Configuration
REACT_APP_API_BASE_URL=https://your-api-domain.com/api
REACT_APP_API_TIMEOUT=30000

# External API Keys (Public keys only)
REACT_APP_MAPBOX_API_KEY=your_mapbox_public_key_here

# Application Settings
REACT_APP_VERSION=1.1.0-php
REACT_APP_ENVIRONMENT=development
REACT_APP_DEBUG=true

# Feature Flags
REACT_APP_ENABLE_ANALYTICS=true
REACT_APP_ENABLE_NOTIFICATIONS=true
REACT_APP_ENABLE_REAL_TIME_UPDATES=true
```

### API Configuration

The frontend communicates with the backend API through the `config.js` file:

**Important:** The `config.js` file contains sensitive API URLs and should never be committed to version control. Use `config.example.js` as a template.

```bash
# Copy the example configuration
cp src/config.example.js src/config.js

# Edit config.js with your actual API URL
# Replace 'https://your-api-domain.com/api' with your real backend URL
```

```javascript
// src/config.js
const API_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000/api';
export const API_BASE_URL = API_URL;
```

## Components

### Core Components

#### App.js
Main application component that handles:
- Authentication state
- Routing
- Global error handling
- API client configuration

#### TruckTable.js
Displays a table of trucks/drivers with:
- Sorting and filtering
- Real-time updates
- Edit/delete functionality
- Status indicators

#### ActivityDashboard.js
Analytics dashboard showing:
- User activity statistics
- Database analytics
- Recent activity feed

#### DispatcherDashboard.js
Main dispatcher interface with:
- Load hierarchy view
- Driver management
- Real-time chat
- Offer management

### Utility Components

#### AddressSearchBar.js
Address search component with:
- Autocomplete functionality
- Recent searches
- Address validation
- Integration with mapping services

#### EditModal.js
Modal for editing truck/driver information:
- Form validation
- Real-time updates
- Error handling

#### SearchBar.js
Search functionality for:
- Trucks/drivers
- Loads
- Status filtering
- Advanced search options

## Features

### Authentication
- JWT token-based authentication
- Automatic token refresh
- Session management
- Role-based access control

### Data Updates
- API polling for data updates
- Status synchronization
- User activity tracking

### Load Management
**⚠️ NOTE: Load management features are in development stage.**
- Create and edit loads
- Assign drivers to loads
- Track load status
- Manage offers and pricing

### Driver Management
- View driver information
- Track driver locations
- Manage driver status
- Driver communication tools

### Analytics
- Dashboard analytics
- User activity tracking
- Performance metrics
- Data visualization

## API Integration

### HTTP Client Setup

The application uses Axios for API communication:

```javascript
import axios from 'axios';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add authentication interceptor
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

### Error Handling

Global error handling for API responses:

```javascript
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Handle unauthorized access
      localStorage.removeItem('authToken');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);
```

## Styling

### CSS Architecture
- Component-based styling
- Responsive design
- CSS Grid and Flexbox
- Mobile-first approach

### Key Styles
- Modern, clean interface
- Consistent color scheme
- Accessible design
- Cross-browser compatibility

## State Management

### Local State
- React hooks for component state
- useState for simple state
- useEffect for side effects
- useCallback for performance optimization

### Global State
- Context API for global state
- Authentication state
- User preferences
- Application settings

## Performance Optimization

### Code Splitting
- React.lazy for component lazy loading
- Route-based code splitting
- Dynamic imports

### Caching
- API response caching
- Local storage for user preferences
- Browser caching strategies

### Bundle Optimization
- Tree shaking
- Minification
- Compression
- CDN integration

## Testing

### Unit Testing
```bash
npm test
```

### Integration Testing
```bash
npm run test:integration
```

### E2E Testing
```bash
npm run test:e2e
```

## Build and Deployment

### Development Build
```bash
npm run build:dev
```

### Production Build
```bash
npm run build
```

### Deployment
```bash
# Build for production
npm run build

# Deploy to server
npm run deploy
```

## Troubleshooting

### Common Issues

1. **API Connection Errors**
   - Check API_BASE_URL in .env
   - Verify backend is running
   - Check CORS configuration

2. **Authentication Issues**
   - Clear localStorage
   - Check JWT token validity
   - Verify API endpoints

3. **Build Errors**
   - Clear node_modules and reinstall
   - Check Node.js version
   - Verify environment variables

### Debug Mode

Enable debug mode in .env:
```bash
REACT_APP_DEBUG=true
```

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Performance Metrics

- First Contentful Paint: < 1.5s
- Largest Contentful Paint: < 2.5s
- Cumulative Layout Shift: < 0.1
- First Input Delay: < 100ms

## Security

- HTTPS only in production
- Content Security Policy
- XSS protection
- CSRF protection
- Secure headers

## Support

For frontend support and questions:
- **Email**: vlad.polishuk.biz@gmail.com
- **Documentation**: [docs/](docs/)
- **Issues**: GitHub Issues 