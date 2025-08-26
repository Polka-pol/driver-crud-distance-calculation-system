import React, { useState, useEffect } from 'react';
import { useModalScrollLock } from '../utils/modalScrollLock';
import './UserModal.css';

const UserModal = ({ isOpen, onClose, onSave, user }) => {
    const [formData, setFormData] = useState({
        email: '',
        username: '',
        full_name: '',
        mobile_number: '',
        role: 'dispatcher',
        password: '',
        confirmPassword: ''
    });
    
    const [errors, setErrors] = useState({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const isEditMode = user && user.id;

    // Prevent body scroll when modal is open
    useModalScrollLock(isOpen);

    useEffect(() => {
        if (isEditMode) {
            setFormData({
                email: user.email || '',
                username: user.username || '',
                full_name: user.full_name || '',
                mobile_number: user.mobile_number || '',
                role: user.role || 'dispatcher',
                password: '',
                confirmPassword: ''
            });
        } else {
            setFormData({
                email: '',
                username: '',
                full_name: '',
                mobile_number: '',
                role: 'dispatcher',
                password: '',
                confirmPassword: ''
            });
        }
        setErrors({});
        setIsSubmitting(false);
    }, [user, isOpen, isEditMode]);

    if (!isOpen) {
        return null;
    }

    const validateForm = () => {
        const newErrors = {};

        // Email validation
        if (!formData.email) {
            newErrors.email = 'Email is required';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
            newErrors.email = 'Please enter a valid email address';
        }

        // Username validation
        if (!formData.username) {
            newErrors.username = 'Username is required';
        } else if (formData.username.length < 3) {
            newErrors.username = 'Username must be at least 3 characters';
        } else if (!/^[a-zA-Z0-9_]+$/.test(formData.username)) {
            newErrors.username = 'Username can only contain letters, numbers, and underscores';
        }

        // Password validation (only for new users or when changing password)
        if (!isEditMode || formData.password) {
            if (!formData.password) {
                newErrors.password = 'Password is required';
            } else if (formData.password.length < 6) {
                newErrors.password = 'Password must be at least 6 characters';
            }

            if (formData.password !== formData.confirmPassword) {
                newErrors.confirmPassword = 'Passwords do not match';
            }
        }

        // Mobile number validation (optional but format check if provided)
        if (formData.mobile_number && !/^[\+]?[0-9\s\-\(\)]{10,}$/.test(formData.mobile_number)) {
            newErrors.mobile_number = 'Please enter a valid mobile number';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        
        // Clear error when user starts typing
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: '' }));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!validateForm()) {
            return;
        }

        setIsSubmitting(true);
        
        try {
            const submitData = { ...formData };
            delete submitData.confirmPassword; // Don't send confirm password to backend
            
            await onSave(submitData, user ? user.id : null);
        } catch (error) {
            console.error('Error saving user:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleOverlayClick = (e) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <div className="user-modal-overlay" onClick={handleOverlayClick}>
            <div className="user-modal-content">
                <div className="user-modal-header">
                    <h2>
                        {isEditMode ? (
                            <>
                                <span className="modal-icon">✏️</span>
                                Edit User
                            </>
                        ) : (
                            <>
                                <span className="modal-icon">👤</span>
                                Create New User
                            </>
                        )}
                    </h2>
                    <button 
                        type="button" 
                        className="modal-close-btn" 
                        onClick={onClose}
                        aria-label="Close modal"
                    >
                        ✕
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="user-modal-form">
                    <div className="form-grid">
                        {/* Email Field */}
                        <div className="form-group">
                            <label htmlFor="email" className="form-label">
                                Email Address <span className="required">*</span>
                            </label>
                            <input
                                id="email"
                                type="email"
                                name="email"
                                value={formData.email}
                                onChange={handleChange}
                                className={`form-input ${errors.email ? 'error' : ''}`}
                                disabled={isEditMode}
                                placeholder="user@connexlogistics.com"
                                autoComplete="email"
                            />
                            {errors.email && <span className="error-message">{errors.email}</span>}
                        </div>

                        {/* Username Field */}
                        <div className="form-group">
                            <label htmlFor="username" className="form-label">
                                Username <span className="required">*</span>
                            </label>
                            <input
                                id="username"
                                type="text"
                                name="username"
                                value={formData.username}
                                onChange={handleChange}
                                className={`form-input ${errors.username ? 'error' : ''}`}
                                placeholder="john_doe"
                                autoComplete="username"
                            />
                            {errors.username && <span className="error-message">{errors.username}</span>}
                        </div>

                        {/* Full Name Field */}
                        <div className="form-group">
                            <label htmlFor="full_name" className="form-label">
                                Full Name
                            </label>
                            <input
                                id="full_name"
                                type="text"
                                name="full_name"
                                value={formData.full_name}
                                onChange={handleChange}
                                className="form-input"
                                placeholder="John Doe"
                                autoComplete="name"
                            />
                        </div>

                        {/* Mobile Number Field */}
                        <div className="form-group">
                            <label htmlFor="mobile_number" className="form-label">
                                Mobile Number
                            </label>
                            <input
                                id="mobile_number"
                                type="tel"
                                name="mobile_number"
                                value={formData.mobile_number}
                                onChange={handleChange}
                                className={`form-input ${errors.mobile_number ? 'error' : ''}`}
                                placeholder="+1 (555) 123-4567"
                                autoComplete="tel"
                            />
                            {errors.mobile_number && <span className="error-message">{errors.mobile_number}</span>}
                        </div>

                        {/* Role Field */}
                        <div className="form-group">
                            <label htmlFor="role" className="form-label">
                                Role <span className="required">*</span>
                            </label>
                            <select
                                id="role"
                                name="role"
                                value={formData.role}
                                onChange={handleChange}
                                className="form-select"
                            >
                                <option value="dispatcher">🚛 Dispatcher</option>
                                <option value="manager">👔 Manager</option>
                                <option value="admin">⚙️ Administrator</option>
                            </select>
                        </div>

                        {/* Password Fields */}
                        <div className="form-group password-group">
                            <label htmlFor="password" className="form-label">
                                Password {!isEditMode && <span className="required">*</span>}
                            </label>
                            <div className="password-input-wrapper">
                                <input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    name="password"
                                    value={formData.password}
                                    onChange={handleChange}
                                    className={`form-input ${errors.password ? 'error' : ''}`}
                                    placeholder={isEditMode ? "Leave blank to keep current password" : "Enter secure password"}
                                    autoComplete={isEditMode ? "new-password" : "new-password"}
                                />
                                <button
                                    type="button"
                                    className="password-toggle"
                                    onClick={() => setShowPassword(!showPassword)}
                                    aria-label={showPassword ? "Hide password" : "Show password"}
                                >
                                    {showPassword ? "👁️" : "👁️‍🗨️"}
                                </button>
                            </div>
                            {errors.password && <span className="error-message">{errors.password}</span>}
                        </div>

                        {/* Confirm Password Field */}
                        {(!isEditMode || formData.password) && (
                            <div className="form-group password-group">
                                <label htmlFor="confirmPassword" className="form-label">
                                    Confirm Password <span className="required">*</span>
                                </label>
                                <div className="password-input-wrapper">
                                    <input
                                        id="confirmPassword"
                                        type={showConfirmPassword ? "text" : "password"}
                                        name="confirmPassword"
                                        value={formData.confirmPassword}
                                        onChange={handleChange}
                                        className={`form-input ${errors.confirmPassword ? 'error' : ''}`}
                                        placeholder="Confirm your password"
                                        autoComplete="new-password"
                                    />
                                    <button
                                        type="button"
                                        className="password-toggle"
                                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                        aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                                    >
                                        {showConfirmPassword ? "👁️" : "👁️‍🗨️"}
                                    </button>
                                </div>
                                {errors.confirmPassword && <span className="error-message">{errors.confirmPassword}</span>}
                            </div>
                        )}
                    </div>

                    <div className="user-modal-actions">
                        <button 
                            type="button" 
                            onClick={onClose} 
                            className="btn-cancel"
                            disabled={isSubmitting}
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit" 
                            className="btn-save"
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? (
                                <>
                                    <span className="spinner"></span>
                                    {isEditMode ? 'Updating...' : 'Creating...'}
                                </>
                            ) : (
                                <>
                                    {isEditMode ? '💾 Update User' : '✨ Create User'}
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default UserModal; 