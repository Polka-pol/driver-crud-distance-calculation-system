# Security Guidelines for Driver CRUD Distance Calculation System

## 🚨 CRITICAL SECURITY NOTICE

This document outlines security best practices for the Driver CRUD Distance Calculation System project. **NEVER commit sensitive information to version control.**

## 🔐 Environment Variables

### Required Environment Variables

#### API Backend (.env)
```bash
# Database
DB_HOST=localhost
DB_PORT=3306
DB_NAME=connex_driver_platform
DB_USER=your_database_user
DB_PASSWORD=your_database_password

# JWT Authentication
JWT_SECRET=your_super_secret_jwt_key_here_make_it_long_and_random

# CORS Settings
# Note: Currently hardcoded in index.php - update code to use this variable
# ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,https://your-domain.com

# Firebase (Service Account)
FIREBASE_PROJECT_ID=connex-driver-platform
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@connex-driver-platform.iam.gserviceaccount.com

# External APIs
MAPBOX_API_KEY=your_mapbox_api_key_here
# GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
```

#### Frontend (.env)
```bash
REACT_APP_API_BASE_URL=https://your-api-domain.com/api
REACT_APP_MAPBOX_API_KEY=your_mapbox_public_key_here
# REACT_APP_GOOGLE_MAPS_API_KEY=your_google_maps_public_key_here
```

#### Mobile App (.env)
```bash
API_BASE_URL=https://your-api-domain.com/api
FIREBASE_API_KEY=your_firebase_api_key_here
FIREBASE_MESSAGING_SENDER_ID=your_sender_id_here
FIREBASE_APP_ID=your_app_id_here
```

## 🚫 NEVER Commit These Files

### Firebase Configuration Files
- `api/config/*-firebase-adminsdk-*.json` - Contains private keys
- `driverapp/GoogleService-Info.plist` - iOS Firebase config
- `driverapp/google-services.json` - Android Firebase config

### Environment Files
- `.env` - All environment files
- `.env.local`
- `.env.development.local`
- `.env.test.local`
- `.env.production.local`

### Database Files
- `*.sql` - Database dumps
- `*.sqlite` - SQLite databases
- `*.db` - Database files

### Log Files
- `*.log` - Application logs
- `logs/` - Log directories

### Keys and Certificates
- `*.key` - Private keys
- `*.pem` - Certificates
- `*.p12` - PKCS12 files
- `*.pfx` - Personal Information Exchange files

## 🔧 Setup Instructions

### 1. Copy Environment Templates
```bash
# API Backend
cp api/env.example api/.env

# Frontend
cp frontend/env.example frontend/.env

# Mobile App
cp driverapp/env.example driverapp/.env
```

### 2. Fill in Real Values
Replace all placeholder values in the `.env` files with your actual configuration.

### 3. Verify .gitignore
Ensure all sensitive files are listed in the appropriate `.gitignore` files.

## 🔍 Security Checklist

### Before Committing
- [ ] No `.env` files in staging area
- [ ] No Firebase service account keys
- [ ] No database dumps
- [ ] No log files
- [ ] No private keys or certificates
- [ ] No hardcoded secrets in code

### Before Deploying
- [ ] All environment variables set correctly
- [ ] Firebase configuration files in place
- [ ] Database credentials updated
- [ ] API keys configured
- [ ] CORS origins updated for production

## 🛡️ Additional Security Measures

### JWT Secret Requirements
- Minimum 32 characters
- Mix of uppercase, lowercase, numbers, and special characters
- Use a secure random generator

### Database Security
- Use strong passwords
- Limit database user permissions
- Enable SSL connections
- Regular backups

### API Security
- Rate limiting implemented
- Input validation on all endpoints
- CORS properly configured
- HTTPS in production

### Firebase Security
- Service account keys stored securely
- Database rules properly configured
- Authentication enabled
- Real-time database rules set

## 🚨 Emergency Procedures

### If Secrets Are Committed
1. **IMMEDIATELY** revoke and regenerate all exposed secrets
2. Remove sensitive files from git history
3. Update all environment variables
4. Notify team members
5. Review access logs

### Commands to Remove from History
```bash
# Remove file from git history
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch path/to/sensitive/file" \
  --prune-empty --tag-name-filter cat -- --all

# Force push to remove from remote
git push origin --force --all
```

## 📞 Security Contacts

For security issues or questions:
- **Project Lead**: [Your Name]
- **Emergency Contact**: [Emergency Contact]

## 📚 Resources

- [GitHub Security Best Practices](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [Firebase Security Rules](https://firebase.google.com/docs/rules)
- [JWT Security Best Practices](https://auth0.com/blog/a-look-at-the-latest-draft-for-jwt-bcp/)
- [OWASP Security Guidelines](https://owasp.org/www-project-top-ten/)

---

**Remember**: Security is everyone's responsibility. When in doubt, ask before committing! 