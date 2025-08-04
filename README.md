# Driver CRUD Distance Calculation System

A comprehensive logistics management platform connecting dispatchers with truck drivers through real-time communication, load management, and location tracking. This project was developed with assistance from Cursor AI and is part of my portfolio for LinkedIn.

## 👨‍💻 About the Developer

I'm actively seeking new opportunities in software development. This project demonstrates my skills in full-stack development, API design, and mobile application development. 

**Live Demo:** https://homin.events/test20

Feel free to reach out for collaboration or job opportunities!

## 🚀 Overview

Driver Platform is a full-stack application consisting of:
- **Backend API** (PHP) - RESTful API for data management and business logic
- **Frontend Web App** (React) - Dispatcher dashboard for load management
- **Mobile App** (React Native) - Driver application for real-time updates

## 📁 Project Structure

```
driver-crud-distance-calculation-system/
├── api/                    # PHP Backend API
│   ├── src/               # Source code
│   ├── config/            # Configuration files
│   ├── logs/              # Application logs
│   └── env.example        # Environment variables template
├── frontend/              # React Web Application
│   ├── src/               # Source code
│   ├── public/            # Static files
│   └── env.example        # Environment variables template
├── driverapp/             # React Native Mobile App
│   ├── src/               # Source code
│   ├── android/           # Android specific files
│   ├── ios/               # iOS specific files
│   └── env.example        # Environment variables template
├── docs/                  # Documentation
├── .gitignore            # Global gitignore
└── README.md             # This file
```

## 🛠️ Technology Stack

### Backend (API)
- **PHP 8.0+** - Server-side language
- **MySQL** - Database
- **JWT** - Authentication tokens
- **Composer** - Dependency management

### Frontend (Web App)
- **React 18** - UI framework
- **JavaScript/JSX** - Programming language
- **CSS3** - Styling
- **Axios** - HTTP client

### Mobile App
- **React Native** - Cross-platform mobile framework
- **TypeScript** - Type-safe JavaScript
- **HTTP API** - Communication with backend

## 🚀 Quick Start

### Live Demo
You can view a working demo of the application at: **https://homin.events/test20**

### Prerequisites
- PHP 8.0+
- Node.js 16+
- MySQL 8.0+
- React Native development environment

### 1. Backend Setup
```bash
cd api
cp env.example .env
# Edit .env with your configuration
composer install
```

### 2. Frontend Setup
```bash
cd frontend
cp env.example .env
# Edit .env with your configuration
npm install
npm start
```

### 3. Mobile App Setup
```bash
cd driverapp
cp env.example .env
# Edit .env with your configuration
npm install
# For iOS
cd ios && pod install && cd ..
npx react-native run-ios
# For Android
npx react-native run-android
```

## 📚 Documentation

- [API Documentation](docs/API.md) - Backend API endpoints and usage
- [Frontend Guide](docs/FRONTEND.md) - Web application setup and features
- [Mobile App Guide](docs/MOBILE.md) - Mobile application setup and features
- [Security Guidelines](SECURITY_GUIDELINES.md) - Security best practices
- [Firebase Setup](docs/FIREBASE.md) - Firebase configuration guide

## 🔧 Configuration

### Environment Variables
Each component has its own `.env.example` file:
- `api/env.example` - Backend configuration
- `frontend/env.example` - Frontend configuration  
- `driverapp/env.example` - Mobile app configuration

### Required Services
- **MySQL Database** - Persistent data storage
- **Mapbox** - Location services and distance calculations

## 🏗️ Architecture

### Data Flow
1. **Dispatcher** creates loads in the web application
2. **System** calculates distances and finds nearby drivers
3. **Drivers** receive offers via mobile app
4. **Communication** between dispatchers and drivers
5. **Data synchronization** via REST API

### Key Features
- Driver and truck management
- Location tracking and distance calculations
- Communication system
- Analytics dashboard
- REST API for data exchange

## 🔒 Security

This project follows security best practices:
- Environment variables for sensitive data
- JWT authentication
- Input validation
- CORS configuration
- Database security

See [Security Guidelines](SECURITY_GUIDELINES.md) for detailed information.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🎯 Portfolio Project

This project showcases:
- **Full-stack development** with PHP, React, and React Native
- **API design and implementation** with RESTful endpoints
- **Database design** and optimization
- **Mobile app development** for cross-platform solutions
- **Project documentation** and best practices
- **Version control** and collaborative development

**Technologies demonstrated:** PHP, MySQL, React, React Native, JavaScript, TypeScript, Git, REST APIs, JWT Authentication, Mapbox Integration

## 📞 Support

For support and questions:
- **Email**: vlad.polishuk.biz@gmail.com
- **Documentation**: [docs/](docs/)

## 🚀 Deployment

### Production Checklist
- [ ] Environment variables configured
- [ ] Database migrated
- [ ] SSL certificates installed
- [ ] Security rules configured
- [ ] Performance monitoring enabled
- [ ] API endpoints tested

---

**Version**: 1.1.0  
**Last Updated**: July 2025