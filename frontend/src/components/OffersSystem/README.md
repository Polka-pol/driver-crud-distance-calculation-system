# Offers System Components

This directory contains all the React components for the Driver Offers System.

## 🏗️ **Component Architecture**

### **Three-Zone Layout (OffersPage.js)**
```
┌─────────────────────────────────────────────────────────┐
│                    OffersCarousel                       │
│              (Horizontal scroll of offers)              │
├─────────────────────────────────────────────────────────┤
│ DriversListPanel │           ChatWindow                │
│   (Left 35%)    │           (Right 65%)               │
│                  │                                     │
└─────────────────────────────────────────────────────────┘
```

## 📁 **Component Files**

### **Core Components**
- **`OffersPage.js`** - Main page with three-zone layout
- **`OffersCarousel.js`** - Horizontal scrollable offers carousel
- **`DriversListPanel.js`** - Left panel showing drivers for selected offer
- **`ChatWindow.js`** - Right panel for real-time chat
- **`CreateOfferModal.js`** - Modal for creating new offers

### **Supporting Components**
- **`SocketStatus.js`** - Real-time connection status indicator
- **`SocketProvider.js`** - Context provider for Socket.io integration

### **Services**
- **`offersApi.js`** - API service for backend communication

## 🚀 **Usage**

### **1. Basic Setup**
```jsx
import OffersPage from './components/OffersPage';
import { SocketProvider } from './context/SocketProvider';

function App() {
  return (
    <SocketProvider>
      <OffersPage />
    </SocketProvider>
  );
}
```

### **2. Socket Integration**
```jsx
import { useSocket } from './context/SocketProvider';

function MyComponent() {
  const { isConnected, emit, joinRoom } = useSocket();
  
  // Join chat room
  useEffect(() => {
    if (isConnected && offerId && driverId) {
      joinRoom(`offer_${offerId}_driver_${driverId}`);
    }
  }, [isConnected, offerId, driverId]);
}
```

### **3. API Integration**
```jsx
import offersApi from './services/offersApi';

// Create offer
const newOffer = await offersApi.createOffer({
  pickup_location: 'New York, NY',
  delivery_location: 'Los Angeles, CA',
  proposed_rate: 2.50,
  driver_ids: [1, 2, 3]
});

// Get offers
const offers = await offersApi.getOffers();
```

## 🎨 **Styling**

All components use CSS modules with consistent design tokens:
- **Primary Color:** #007bff (Blue)
- **Success Color:** #28a745 (Green)
- **Warning Color:** #ffc107 (Yellow)
- **Danger Color:** #dc3545 (Red)
- **Neutral Colors:** #6c757d, #495057, #212529

## 📱 **Responsive Design**

- **Desktop (1200px+):** Three-zone layout
- **Tablet (768px-1199px):** Vertical layout
- **Mobile (<768px):** Stacked layout

## 🔌 **Socket.io Events**

### **Client → Server**
- `join_offer_chat` - Join chat room
- `send_message` - Send chat message
- `typing_start/stop` - Typing indicators
- `mark_message_read` - Mark message as read

### **Server → Client**
- `receive_message` - New message received
- `chat_history` - Chat history loaded
- `user_typing` - User typing indicator
- `new_offer_received` - New offer notification
- `offer_status_change` - Offer status update

## 🚧 **Development Notes**

### **Mock Data**
Components currently use mock data for development. Replace with real API calls:
- `OffersPage.js` - Mock offers, drivers, messages
- `OffersCarousel.js` - Mock status counts
- `DriversListPanel.js` - Mock driver statuses

### **TODO Items**
- [ ] Replace mock data with real API calls
- [ ] Implement real-time updates via Socket.io
- [ ] Add error handling and loading states
- [ ] Implement offer editing functionality
- [ ] Add driver proposal handling
- [ ] Implement message read receipts

### **Integration Points**
- **TruckTable:** Add "Make Offer" button
- **Authentication:** JWT token integration
- **Real-time:** Socket.io server connection
- **Database:** MySQL tables for offers, chat, proposals

## 🧪 **Testing**

Run the development server:
```bash
cd frontend
npm start
```

The offers system will be available at `/offers` route.

## 📚 **Dependencies**

- **React 18.2.0** - UI framework
- **Socket.io-client 4.8.1** - Real-time communication
- **CSS3** - Styling and animations



