# Offers System API - Documentation

## Overview

This document describes the new API endpoints for the Driver Offers System, which enables real-time communication between dispatchers and drivers for load offers.

## Architecture

The offers system consists of four main controllers:
- **OfferController** - Manages offers and proposals
- **ChatController** - Handles real-time messaging
- **DriverController** - Provides driver information and filtering
- **SocketAuthController** - Manages Socket.io authentication

## Authentication

All endpoints require JWT authentication via the `Authorization: Bearer <token>` header.

**User Roles:**
- `dispatcher` - Can create offers, view proposals, send messages
- `admin` - Full access to all endpoints
- `manager` - Full access to all endpoints
- `driver` - Limited access to offers and chat (via Truck ID)

## API Endpoints

### 1. Offers Management

#### GET /api/offers
**Description:** Get all offers created by the authenticated dispatcher

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "created_by": 18,
      "pickup_location": "Chicago, IL",
      "delivery_location": "New York, NY",
      "weight_lbs": "2000.00",
      "dimensions": "48' x 8.5' x 8.5'",
      "distance_miles": "800.00",
      "proposed_rate": "2.50",
      "status": "active",
      "notes": "Urgent delivery needed",
      "created_at": "2025-01-27 10:00:00",
      "updated_at": "2025-01-27 10:00:00",
      "creator_name": "Carl Banks",
      "total_drivers": 5,
      "sent_count": 5,
      "viewed_count": 3,
      "accepted_count": 1,
      "rejected_count": 1,
      "unread_messages": 2
    }
  ]
}
```

#### POST /api/offers
**Description:** Create a new offer

**Headers:**
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "pickup_location": "Chicago, IL",
  "pickup_lat": 41.8781,
  "pickup_lon": -87.6298,
  "delivery_location": "New York, NY",
  "delivery_lat": 40.7128,
  "delivery_lon": -74.0060,
  "weight_lbs": "2000.00",
  "dimensions": "48' x 8.5' x 8.5'",
  "distance_miles": "800.00",
  "proposed_rate": "2.50",
  "notes": "Urgent delivery needed",
  "driver_ids": [107, 120, 122]
}
```

**Required Fields:**
- `pickup_location` - Pickup address
- `delivery_location` - Delivery address
- `driver_ids` - Array of Truck IDs to send offer to

**Response:**
```json
{
  "success": true,
  "message": "Offer created successfully",
  "data": {
    "id": 1,
    "created_by": 18,
    "pickup_location": "Chicago, IL",
    "delivery_location": "New York, NY",
    "weight_lbs": "2000.00",
    "dimensions": "48' x 8.5' x 8.5'",
    "distance_miles": "800.00",
    "proposed_rate": "2.50",
    "status": "active",
    "notes": "Urgent delivery needed",
    "created_at": "2025-01-27 10:00:00",
    "updated_at": "2025-01-27 10:00:00",
    "creator_name": "Carl Banks",
    "total_drivers": 3
  }
}
```

#### GET /api/offers/{id}
**Description:** Get specific offer details

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "created_by": 18,
    "pickup_location": "Chicago, IL",
    "delivery_location": "New York, NY",
    "weight_lbs": "2000.00",
    "dimensions": "48' x 8.5' x 8.5'",
    "distance_miles": "800.00",
    "proposed_rate": "2.50",
    "status": "active",
    "notes": "Urgent delivery needed",
    "created_at": "2025-01-27 10:00:00",
    "updated_at": "2025-01-27 10:00:00",
    "creator_name": "Carl Banks"
  }
}
```

#### PUT /api/offers/{id}
**Description:** Update offer status

**Request Body:**
```json
{
  "status": "completed"
}
```

**Valid Statuses:** `active`, `completed`, `cancelled`

#### GET /api/offers/{id}/proposals
**Description:** Get driver proposals for an offer

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "offer_id": 1,
      "driver_id": 107,
      "status": "sent",
      "driver_proposed_rate": null,
      "responded_at": null,
      "created_at": "2025-01-27 10:00:00",
      "DriverName": "Nwee Ler (IL)",
      "TruckNumber": "101",
      "CellPhone": "(779) 513-2475",
      "CityStateZip": "Rockford, IL 61108",
      "Dimensions": "169x52x70/3000",
      "driver_rate": "✔",
      "driver_email": "nweepler77@yahoo.com",
      "unread_messages": 0
    }
  ]
}
```

### 2. Chat System

#### GET /api/offers/{offer_id}/chat/{driver_id}
**Description:** Get chat history between dispatcher and driver

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "offer_id": 1,
      "driver_id": 107,
      "sender_type": "dispatcher",
      "sender_id": 18,
      "message": "Hi, are you available for this load?",
      "message_type": "text",
      "is_read": false,
      "created_at": "2025-01-27 10:00:00",
      "sender_name": "Carl Banks"
    },
    {
      "id": 2,
      "offer_id": 1,
      "driver_id": 107,
      "sender_type": "driver",
      "sender_id": 107,
      "message": "Yes, I can take it. What's the rate?",
      "message_type": "text",
      "is_read": false,
      "created_at": "2025-01-27 10:05:00",
      "sender_name": "Nwee Ler (IL)"
    }
  ]
}
```

#### POST /api/offers/{offer_id}/chat/{driver_id}
**Description:** Send a message in the chat

**Request Body:**
```json
{
  "message": "The rate is $2.50 per mile. Can you confirm?",
  "message_type": "text"
}
```

**Message Types:** `text`, `rate_proposal`, `system`

#### PUT /api/chat/{message_id}/read
**Description:** Mark a message as read

**Response:**
```json
{
  "success": true,
  "message": "Message marked as read"
}
```

### 3. Driver Management

#### GET /api/drivers/available
**Description:** Get all available drivers

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 107,
      "truck_number": "101",
      "driver_name": "Nwee Ler (IL)",
      "cell_phone": "(779) 513-2475",
      "location": "Rockford, IL 61108",
      "dimensions_payload": "169x52x70/3000",
      "driver_rate": "✔",
      "driver_email": "nweepler77@yahoo.com",
      "latitude": "42.26555000",
      "longitude": "-88.98013400",
      "status": "Available",
      "updated_at": "2025-08-27 16:10:13",
      "isOnline": false,
      "last_seen": "2025-08-27 16:10:13"
    }
  ]
}
```

#### GET /api/drivers/by-location
**Description:** Get drivers within a radius of specified coordinates

**Query Parameters:**
- `lat` - Latitude (required)
- `lon` - Longitude (required)
- `radius` - Radius in miles (default: 100)

**Example:** `/api/drivers/by-location?lat=41.8781&lon=-87.6298&radius=50`

**Response:** Same as `/drivers/available` with additional `distance_miles` field

#### GET /api/drivers/{id}
**Description:** Get specific driver details

**Response:** Same as driver object from `/drivers/available`

### 4. Socket.io Authentication

#### POST /api/socket/auth
**Description:** Generate Socket.io authentication token

**Response:**
```json
{
  "success": true,
  "data": {
    "socket_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
    "user_id": 18,
    "user_type": "dispatcher",
    "full_name": "Carl Banks",
    "role": "dispatcher"
  }
}
```

## Database Schema

### Tables Used

#### offers
```sql
CREATE TABLE offers (
    id INT PRIMARY KEY AUTO_INCREMENT,
    created_by INT NOT NULL,
    pickup_location VARCHAR(500) NOT NULL,
    pickup_lat DECIMAL(10,8),
    pickup_lon DECIMAL(11,8),
    delivery_location VARCHAR(500) NOT NULL,
    delivery_lat DECIMAL(10,8),
    delivery_lon DECIMAL(11,8),
    weight_lbs DECIMAL(10,2),
    dimensions VARCHAR(100),
    distance_miles DECIMAL(10,2),
    proposed_rate DECIMAL(10,2),
    status ENUM('active', 'completed', 'cancelled') DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
);
```

#### offer_proposals
```sql
CREATE TABLE offer_proposals (
    id INT PRIMARY KEY AUTO_INCREMENT,
    offer_id INT NOT NULL,
    driver_id INT NOT NULL,
    status ENUM('sent', 'viewed', 'accepted', 'rejected', 'counter_offered') DEFAULT 'sent',
    driver_proposed_rate DECIMAL(10,2),
    responded_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE,
    FOREIGN KEY (driver_id) REFERENCES Trucks(ID),
    UNIQUE KEY unique_offer_driver (offer_id, driver_id)
);
```

#### chat_messages
```sql
CREATE TABLE chat_messages (
    id INT PRIMARY KEY AUTO_INCREMENT,
    offer_id INT NOT NULL,
    driver_id INT NOT NULL,
    sender_type ENUM('dispatcher', 'driver') NOT NULL,
    sender_id INT NOT NULL,
    message TEXT NOT NULL,
    message_type ENUM('text', 'rate_proposal', 'system') DEFAULT 'text',
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE,
    FOREIGN KEY (driver_id) REFERENCES Trucks(ID)
);
```

#### socket_sessions
```sql
CREATE TABLE socket_sessions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    socket_id VARCHAR(255) NOT NULL,
    user_type ENUM('dispatcher', 'driver') NOT NULL,
    is_online BOOLEAN DEFAULT TRUE,
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_socket_id (socket_id),
    INDEX idx_user_type (user_type)
);
```

### Existing Tables Integration

#### users
- **Purpose:** Authentication and dispatcher identification
- **Key Fields:** `id`, `username`, `full_name`, `role`, `is_active`
- **Integration:** `offers.created_by` → `users.id`

#### Trucks
- **Purpose:** Driver and vehicle information
- **Key Fields:** `ID`, `DriverName`, `CellPhone`, `CityStateZip`, `Dimensions`, `latitude`, `longitude`
- **Integration:** `offer_proposals.driver_id` → `Trucks.ID`, `chat_messages.driver_id` → `Trucks.ID`

## Error Handling

### Standard Error Response
```json
{
  "error": "Error message",
  "message": "Detailed error description"
}
```

### HTTP Status Codes
- `200` - Success
- `201` - Created (for POST requests)
- `400` - Bad Request (validation errors)
- `401` - Unauthorized (missing/invalid JWT)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `500` - Internal Server Error

### Common Error Scenarios
1. **Missing JWT Token:** 401 Unauthorized
2. **Invalid Role:** 403 Forbidden (dispatcher role required)
3. **Invalid Driver ID:** 400 Bad Request (driver not found or inactive)
4. **Database Connection Error:** 500 Internal Server Error

## Security Features

### JWT Authentication
- All endpoints require valid JWT token
- Token includes user role and permissions
- 24-hour expiration for socket tokens

### Role-Based Access Control
- Dispatchers can create and manage offers
- Drivers can only access their own offers
- Admins and managers have full access

### Input Validation
- SQL injection protection via prepared statements
- Required field validation
- Data type validation
- Business logic validation (e.g., driver must be active)

### CORS Configuration
- Configurable allowed origins
- Secure headers (CSP, X-Frame-Options, etc.)
- Preflight request handling

## Performance Considerations

### Database Indexes
- `offers.created_by` - For dispatcher queries
- `offer_proposals.offer_id, driver_id` - For proposal lookups
- `chat_messages.offer_id, driver_id` - For chat history
- `Trucks.isActive, Status` - For driver filtering

### Query Optimization
- JOIN operations for related data
- Subqueries for statistics calculation
- Prepared statements for repeated queries
- Connection pooling via existing Database class

## Real-time Integration

### Webhook Notifications
The API automatically sends webhook notifications to the offers-server for real-time updates:

**Offer Created Webhook:**
- URL: `https://offers.connex.team/events/offer-created`
- Method: POST
- Headers: `X-Webhook-Secret: <OFFERS_WEBHOOK_SECRET>`
- Payload: Complete offer data with invited driver IDs

**Chat Message Webhook:**
- URL: `https://offers.connex.team/events/message-sent`
- Method: POST
- Headers: `X-Webhook-Secret: <OFFERS_WEBHOOK_SECRET>`
- Payload: Message data with offer_id and driver_id

### Environment Variables Required
```bash
# PHP API (.env)
OFFERS_SERVER_URL=https://offers.connex.team
OFFERS_WEBHOOK_SECRET=your_webhook_secret_here

# Offers-Server (.env)
WEBHOOK_SECRET=your_webhook_secret_here
```

### Socket.io Events
Frontend clients receive real-time updates via Socket.io:
- `offer_created` - New offer created and broadcasted
- `receive_message` - New chat message received
- `offer_status_change` - Offer status updated

## Integration Points

### Frontend Integration
- React components use these endpoints via `offersApi.js`
- Real-time updates via Socket.io connection to offers.connex.team
- JWT tokens from existing authentication system
- ChatWindow component integrated with API endpoints

### Socket.io Server
- Production server: https://offers.connex.team
- Uses `/api/socket/auth` for authentication
- Real-time chat and offer status updates
- Session management via `socket_sessions` table
- Webhook integration for API-to-Socket.io communication

### Existing System
- Leverages existing `Auth` and `Database` classes
- Integrates with current user management
- Preserves all existing TruckTable functionality
- Uses existing Trucks table for driver information

## Development Notes

### File Structure
```
api/
├── src/
│   └── Controllers/
│       ├── OfferController.php
│       ├── ChatController.php
│       ├── DriverController.php
│       └── SocketAuthController.php
├── index.php (updated with new routes)
└── OFFERS_API_README.md (this file)
```

### Testing
- Test with Postman or similar API testing tool
- Verify JWT authentication works
- Test role-based access control
- Validate database transactions
- Check error handling scenarios

## Current Implementation Status

### ✅ Completed Features
- **Offer Management:** Full CRUD operations with database persistence
- **Chat System:** Real-time messaging with database storage and Socket.io integration
- **Driver Integration:** Driver details fetching from existing Trucks table
- **Real-time Updates:** Webhook notifications and Socket.io broadcasting
- **Frontend Integration:** React components with API integration
- **Authentication:** JWT-based security with role-based access control

### 🔄 Ready for Testing
- **End-to-End Workflow:** Offer creation → Driver invitation → Chat communication
- **Multi-user Scenarios:** Concurrent dispatcher operations
- **Real-time Performance:** Message latency and connection stability

### Future Enhancements
- Rate limiting for message sending
- File attachment support in chat
- Push notifications for drivers
- Advanced driver filtering (equipment type, experience, etc.)
- Offer templates for common routes
