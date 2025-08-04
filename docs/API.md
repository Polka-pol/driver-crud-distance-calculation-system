# Driver CRUD Distance Calculation System - API Documentation

## Overview

The Driver CRUD Distance Calculation System API is a RESTful service built with PHP that handles all backend operations including user authentication, driver and truck management, and data synchronization.

## Base URL

```
Production: https://your-api-domain.com/api
Development: http://localhost:5000/api
```

## Authentication

The API uses JWT (JSON Web Tokens) for authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

## Response Format

All API responses follow this format:

```json
{
  "success": true,
  "data": { ... },
  "message": "Optional message"
}
```

Error responses:

```json
{
  "success": false,
  "message": "Error description"
}
```

## Endpoints

### Authentication

#### POST /auth/login
Authenticate a user and receive a JWT token.

**Request Body:**
```json
{
  "username": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "jwt-token-here",
    "user": {
      "id": 1,
      "username": "user@example.com",
      "role": "dispatcher",
      "full_name": "John Doe"
    }
  }
}
```

### Driver Authentication

#### POST /driver/login
Driver login using phone number and password.

**Request Body:**
```json
{
  "cellPhone": "1234567890",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "jwt-token-here",
    "driver": {
      "id": 1,
      "cellPhone": "1234567890",
      "driverName": "John Doe",
      "truckNumber": "TX-001"
    },
    "requiresPasswordSetup": false
  }
}
```

#### POST /driver/set-password
Set password for first-time driver login.

**Request Body:**
```json
{
  "cellPhone": "1234567890",
  "password": "newpassword123"
}
```

### Load Management

**⚠️ NOTE: Load management features are in development stage.**

#### GET /loads/hierarchy
Get hierarchical view of loads with summary information.

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "origin_address": "Dallas, TX",
      "destination_address": "Los Angeles, CA",
      "status": "active",
      "total_drivers": 5,
      "unread_messages": 2
    }
  ]
}
```

#### GET /loads/{id}/drivers
Get list of drivers for a specific load.

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "load": { ... },
    "drivers": [
      {
        "offer_id": 1,
        "driver_id": 1,
        "driver_name": "John Doe",
        "truck_number": "TX-001",
        "offer_status": "driver_interested",
        "unread_messages": 1
      }
    ]
  }
}
```

### Driver Operations

#### GET /driver/offers
Get available offers for the authenticated driver.

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "load_id": 1,
      "origin_address": "Dallas, TX",
      "destination_address": "Los Angeles, CA",
      "distance_to_pickup_miles": 25.5,
      "delivery_distance_miles": 1500.0,
      "proposed_cost_by_user": 2500.00,
      "offer_status": "sent"
    }
  ]
}
```

#### GET /driver/offers/{id}
Get detailed information about a specific offer.

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "load_id": 1,
    "origin_address": "Dallas, TX",
    "destination_address": "Los Angeles, CA",
    "distance_to_pickup_miles": 25.5,
    "delivery_distance_miles": 1500.0,
    "total_miles": 1525.5,
    "weight": "5000 lbs",
    "dimensions": "48' x 8.5' x 8.5'",
    "proposed_cost_by_user": 2500.00,
    "offer_status": "viewed"
  }
}
```

#### POST /driver/offers/{id}/propose-price
Propose a price for an offer.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "proposed_cost": 2750.00,
  "message": "I can do this for $2,750"
}
```

### Chat System

**⚠️ NOTE: Chat system features are in development stage.**

#### GET /loads/{loadId}/drivers/{driverId}/chat
Get chat messages between dispatcher and driver.

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "offer": { ... },
    "load": { ... },
    "driver": { ... },
    "messages": [
      {
        "id": 1,
        "sender_type": "driver",
        "sender_id": 1,
        "message_text": "I can do this for $2,750",
        "message_type": "price_offer",
        "price_amount": 2750.00,
        "created_at": "2024-01-15T10:30:00Z"
      }
    ]
  }
}
```

#### POST /chat/messages
Send a message in chat.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "load_offer_id": 1,
  "message_text": "That works for us!",
  "message_type": "text"
}
```

#### POST /driver/chat/send
Driver sends a message.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "offer_id": 1,
  "message_text": "When do you need this delivered?",
  "message_type": "text"
}
```

### Location and Status

#### POST /driver/location
Update driver's current location.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "latitude": 32.7767,
  "longitude": -96.7970,
  "city_state_zip": "Dallas, TX 75201"
}
```

#### POST /driver/status
Update driver's availability status.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "status": "Available"
}
```

### Analytics

#### GET /dashboard/analytics
Get dashboard analytics data.

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "total_loads": 150,
      "active_drivers": 25,
      "completed_deliveries": 120
    },
    "user_daily_stats": { ... },
    "db_analytics": { ... },
    "recent_activity": [ ... ],
    "user_heatmaps": { ... }
  }
}
```

## Error Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 400 | Bad Request - Invalid input data |
| 401 | Unauthorized - Invalid or missing token |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource doesn't exist |
| 500 | Internal Server Error |

## Rate Limiting

The API implements rate limiting to prevent abuse:
- 100 requests per minute per IP address
- 1000 requests per hour per authenticated user

## CORS

The API supports CORS for cross-origin requests. Allowed origins are configured in the environment variables.

## Webhooks

**⚠️ NOTE: Webhook functionality is planned for future implementation.**

The API will support webhooks for real-time events:
- Load status changes
- New messages
- Driver location updates
- Offer status changes

## Testing

Use the provided Postman collection or curl commands for testing:

```bash
# Test authentication
curl -X POST https://your-api-domain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test@example.com","password":"password123"}'
```

## Support

For API support and questions:
- **Email**: vlad.polishuk.biz@gmail.com
- **Documentation**: [docs/](docs/) 