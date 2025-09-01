# Offers Server - Real-time Socket.io Backend

## Overview

This directory contains the Node.js Socket.io server for the Driver Offers System. The server provides real-time communication capabilities including instant chat, typing indicators, online presence tracking, and live offer status updates.

## Architecture

- **Framework:** Node.js + Express.js + Socket.io
- **Database:** MySQL (existing dr542239_db) + Redis (sessions/cache)
- **Authentication:** JWT integration with existing PHP backend
- **Deployment:** VPS with PM2 process management
- **Domain:** https://offers.connex.team

## VPS Configuration

### Server Details
- **Domain:** offers.connex.team
- **SSL:** Let's Encrypt certificate (auto-renewal enabled)
- **Reverse Proxy:** Nginx configured for Socket.io
- **Process Manager:** PM2 for auto-restart and monitoring

### Directory Structure on VPS
```
/var/www/offers-server/
├── server.js              # Main Socket.io server
├── package.json           # Dependencies and scripts
├── ecosystem.config.js    # PM2 configuration
├── .env                   # Environment variables
├── logs/                  # PM2 logs directory
│   ├── err.log           # Error logs
│   ├── out.log           # Output logs
│   └── combined.log      # Combined logs
├── src/                   # Source code modules
│   ├── auth/             # JWT authentication middleware
│   ├── database/         # MySQL and Redis connections
│   ├── handlers/         # Socket.io event handlers
│   └── utils/            # Utility functions
├── handlers/             # Socket.io event handlers
│   ├── chatHandler.js    # Chat events and messaging
│   └── offerHandler.js   # Offer management events
└── README.md             # This file
```

### User Configuration
- **System User:** nodeuser (non-root for security)
- **User Groups:** nodeuser, sudo
- **Directory Owner:** nodeuser:nodeuser
- **Permissions:** 755 for directories, 644 for files

## Environment Variables

Required environment variables in `.env` file:

```env
# Server Configuration
PORT=3001
NODE_ENV=production

# Database Configuration
DB_HOST=dr542239.mysql.tools
DB_PORT=3306
DB_NAME=dr542239_db
DB_USER=dr542239_db
DB_PASSWORD=your_password_here
DB_CHARSET=utf8mb4

# JWT Configuration (must match PHP backend)
JWT_SECRET=your_jwt_secret_here

# Redis Configuration
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# CORS Origins
CORS_ORIGINS=https://connex.team,http://localhost:3000
```

## Installation Commands

### 1. VPS User Setup
```bash
# Create nodeuser (run as root)
adduser nodeuser --disabled-password --gecos ""
usermod -aG sudo nodeuser

# Set directory permissions
chown -R nodeuser:nodeuser /var/www/offers-server
```

### 2. Node.js Installation
```bash
# Install Node.js v18+ LTS
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
apt-get install -y nodejs

# Verify installation
node --version
npm --version
```

### 3. Dependencies Installation
```bash
# Switch to nodeuser
su - nodeuser
cd /var/www/offers-server

# Install production dependencies
npm install express socket.io cors helmet dotenv winston express-rate-limit
npm install mysql2 redis ioredis jsonwebtoken bcryptjs

# Install development dependencies
npm install --save-dev nodemon
```

### 4. PM2 Setup
```bash
# Install PM2 globally
sudo npm install pm2 -g

# Start application
pm2 start ecosystem.config.js

# Setup auto-startup
pm2 startup
pm2 save
```

## Socket.io Events

### Authentication Events
- `authenticate` - JWT token validation (handled by middleware)
- `authenticated` - Successful authentication response
- `auth_error` - Authentication failure

### Chat Events
- `join_offer_chat` - Join specific offer chat room
- `send_message` - Send chat message with validation
- `receive_message` - Receive chat message broadcast
- `chat_history` - Load previous messages when joining
- `typing_start` - User started typing indicator
- `typing_stop` - User stopped typing indicator
- `user_typing` - Typing status broadcast
- `mark_message_read` - Mark message as read
- `message_read_receipt` - Read confirmation broadcast
- `user_joined_chat` - User joined chat notification
- `user_left_chat` - User left chat notification

### Presence Events
- `user_online` - User came online
- `user_offline` - User went offline
- `heartbeat` - Keep-alive ping
- `heartbeat_ack` - Heartbeat acknowledgment
- `presence_update` - Online status change

### Offer Events
- `new_offer_created` - Dispatcher created new offer
- `new_offer_received` - Driver receives offer notification
- `driver_proposal` - Driver responds to offer
- `driver_proposal_response` - Dispatcher receives driver response
- `offer_status_change` - Offer status updated
- `offer_status_changed` - Status change notification
- `get_offer_details` - Request offer information
- `offer_details` - Offer details response
- `get_user_offers` - Request user's offers list
- `user_offers_list` - User's offers response

### System Events
- `error` - Error message broadcast
- `ping` - Test connection
- `pong` - Test response

## Database Integration

### MySQL Tables (New)
- `offers` - Offer details and status
- `offer_proposals` - Driver proposals and responses  
- `chat_messages` - Persistent chat history
- `socket_sessions` - Active socket connections

### Redis Usage
- Socket session management (`socket:${socketId}`)
- Online presence tracking (`presence:${userType}:${userId}`)
- Typing indicators state (`typing:${roomName}:${userId}`)
- General caching with TTL

### Database Operations
- **MySQL:** Message persistence, offer management, user authentication
- **Redis:** Real-time state, session storage, presence tracking
- **Connection Pooling:** Optimized for concurrent users
- **Error Handling:** Graceful fallbacks and reconnection

## Security Features

- JWT token validation on all socket connections
- Rate limiting for message sending
- Input sanitization and XSS protection
- CORS configuration for allowed origins
- Helmet.js security headers
- Non-root user execution

## Monitoring & Logging

### PM2 Monitoring
```bash
pm2 status          # Check application status
pm2 logs offers-server  # View real-time logs
pm2 monit           # Real-time monitoring dashboard
```

### Log Files
- Error logs: `/var/www/offers-server/logs/err.log`
- Output logs: `/var/www/offers-server/logs/out.log`
- Combined logs: `/var/www/offers-server/logs/combined.log`

### Health Check
- Endpoint: `https://offers.connex.team/health`
- Returns: Server status, uptime, and version info

## Phase 2 Implementation Status

### ✅ Completed Features
- **JWT Authentication:** Middleware integration with existing PHP backend
- **Database Integration:** MySQL + Redis connections with error handling
- **Chat System:** Real-time messaging with persistence and typing indicators
- **Offer Management:** Complete offer lifecycle with notifications
- **Presence Tracking:** Online/offline status with Redis storage
- **Session Management:** Socket session storage and cleanup
- **Handler Classes:** Modular ChatHandler and OfferHandler
- **Security:** Input validation, rate limiting, permission checks

### 🔄 Current Architecture
```
Socket.io Server (offers.connex.team)
├── JWT Authentication Middleware
├── ChatHandler (join, send, typing, read receipts)
├── OfferHandler (create, respond, status, details)
├── MySQL Integration (message/offer persistence)
├── Redis Integration (sessions, presence, typing)
└── Error Handling & Logging
```

## Development Workflow

### Local Development
1. Update code in this local directory
2. Test locally with development environment
3. Copy files to VPS: `rsync -av --exclude node_modules . nodeuser@offers.connex.team:/var/www/offers-server/`
4. Install dependencies on VPS: `npm install`
5. Restart PM2: `pm2 restart offers-server`

### Deployment Process
1. **Code Update:** Modify files in local offers-server directory
2. **File Transfer:** `scp -r ./src nodeuser@offers.connex.team:/var/www/offers-server/`
3. **Server Restart:** `pm2 restart offers-server`
4. **Monitor:** `pm2 logs offers-server --lines 50`
5. **Health Check:** `curl https://offers.connex.team/health`

## Integration with Existing System

### PHP Backend Integration
- Uses same JWT secret for token validation
- Connects to same MySQL database (dr542239_db)
- Syncs offer and message data with PHP API
- Maintains session consistency

### React Frontend Integration
- Socket.io client connects to offers.connex.team
- JWT token passed from existing auth system
- Real-time updates for chat and offer status
- Seamless integration with existing TruckTable

## Performance Targets

- Message latency: < 100ms
- Connection establishment: < 2 seconds
- Concurrent users: 50+ supported
- Uptime target: 99.9%
- Memory usage: < 1GB per instance

## Troubleshooting

### Common Issues
1. **Connection refused:** Check if PM2 is running and port 3001 is open
2. **SSL errors:** Verify Let's Encrypt certificate is valid
3. **Database connection:** Check MySQL credentials in .env
4. **Redis connection:** Ensure Redis service is running

### Debug Commands
```bash
# Check PM2 status
pm2 status

# View real-time logs
pm2 logs offers-server --lines 100

# Test health endpoint
curl https://offers.connex.team/health

# Check Nginx configuration
nginx -t

# Verify SSL certificate
certbot certificates
```

## Next Steps

### Phase 2 Completion
1. **Deploy Updated Server:** Transfer new handler files to VPS
2. **Test Real-time Features:** Verify chat, offers, presence tracking
3. **Load Testing:** Test with multiple concurrent connections
4. **Error Monitoring:** Verify logging and error handling

### Phase 3: Frontend Integration
1. **React Components:** OffersPage, ChatWindow, DriversListPanel
2. **Socket.io Client:** Connection management and event handling  
3. **TruckTable Integration:** Add "Make Offer" button
4. **Real-time UI:** Live updates, typing indicators, notifications

### Phase 4: PHP API Integration
1. **OfferController:** CRUD operations for offers
2. **ChatController:** Message history and management
3. **API Routes:** RESTful endpoints for offer management
4. **Database Sync:** Ensure consistency between PHP and Node.js

## Current Implementation Status

### ✅ Completed Features (Phase 2-4)
- **Real-time Socket.io Server:** Production deployment on offers.connex.team
- **JWT Authentication:** Middleware integration with existing PHP backend
- **Database Integration:** MySQL + Redis connections with error handling
- **Chat System:** Real-time messaging with database persistence and webhook integration
- **Offer Management:** Complete offer lifecycle with real-time notifications
- **Webhook Integration:** API-to-Socket.io communication via secured endpoints
- **Frontend Integration:** React components with Socket.io client connection
- **Session Management:** Socket session storage and cleanup
- **Security:** Input validation, rate limiting, CORS protection

### 🔄 Production Ready
- **VPS Deployment:** https://offers.connex.team with SSL and PM2 management
- **Webhook Endpoints:** `/events/offer-created` and `/events/message-sent`
- **Health Monitoring:** `/health` endpoint with uptime and connection stats
- **Database Tables:** All required tables created and operational
- **Environment Variables:** Production configuration completed

### Current Architecture
```
Socket.io Server (offers.connex.team)
├── JWT Authentication Middleware
├── Webhook Endpoints (/events/offer-created, /events/message-sent)
├── Real-time Broadcasting (offer_created, receive_message events)
├── MySQL Integration (message/offer persistence)
├── Redis Integration (sessions, presence, typing)
└── Error Handling & Logging
```

## Webhook Integration

### Offer Created Webhook
- **Endpoint:** `POST /events/offer-created`
- **Authentication:** `X-Webhook-Secret` header
- **Payload:** Complete offer data with invited driver IDs
- **Action:** Broadcasts `offer_created` event to all connected clients

### Chat Message Webhook  
- **Endpoint:** `POST /events/message-sent`
- **Authentication:** `X-Webhook-Secret` header
- **Payload:** Message data with offer_id and driver_id
- **Action:** Broadcasts `receive_message` event to specific offer room

### Environment Variables
```env
# Webhook Security
WEBHOOK_SECRET=your_webhook_secret_here

# Database Configuration
DB_HOST=dr542239.mysql.tools
DB_PORT=3306
DB_NAME=dr542239_db
DB_USER=dr542239_db
DB_PASSWORD=your_password_here

# Redis Configuration
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# CORS Origins
CORS_ORIGINS=https://connex.team,http://localhost:3000
```

## Development Status: Phase 4 Complete ✅
**Production-ready offers system with full real-time integration**
