import React, { useState, useEffect } from 'react';
import './UserModal.css';

const UserModal = ({ isOpen, onClose, onSave, user }) => {
    const [formData, setFormData] = useState({
        username: '',
        full_name: '',
        mobile_number: '',
        role: 'dispatcher',
        password: '',
    });

    const isEditMode = user && user.id;

    useEffect(() => {
        if (isEditMode) {
            setFormData({
                username: user.username || '',
                full_name: user.full_name || '',
                mobile_number: user.mobile_number || '',
                role: user.role || 'dispatcher',
                password: '', // Password is not sent back, should be entered if needs to be changed
            });
        } else {
             // Reset form for 'add' mode
             setFormData({
                username: '',
                full_name: '',
                mobile_number: '',
                role: 'dispatcher',
                password: '',
            });
        }
    }, [user, isOpen, isEditMode]);

    if (!isOpen) {
        return null;
    }

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData, user ? user.id : null);
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <form onSubmit={handleSubmit}>
                    <h2>{isEditMode ? 'Edit User' : 'Add New User'}</h2>
                    
                    <label>Username</label>
                    <input
                        type="text"
                        name="username"
                        value={formData.username}
                        onChange={handleChange}
                        required
                        disabled={isEditMode} // Cannot change username
                    />

                    <label>Full Name</label>
                    <input type="text" name="full_name" value={formData.full_name} onChange={handleChange} />

                    <label>Mobile Number</label>
                    <input type="tel" name="mobile_number" value={formData.mobile_number} onChange={handleChange} />

                    <label>Role</label>
                    <select name="role" value={formData.role} onChange={handleChange} required>
                        <option value="dispatcher">Dispatcher</option>
                        <option value="manager">Manager</option>
                        <option value="admin">Admin</option>
                    </select>

                    <label>Password</label>
                    <input 
                        type="password" 
                        name="password" 
                        value={formData.password} 
                        onChange={handleChange} 
                        placeholder={isEditMode ? "Leave blank to keep current password" : ""}
                        required={!isEditMode}
                    />
                    
                    <div className="modal-actions">
                        <button type="button" onClick={onClose} className="btn-cancel">Cancel</button>
                        <button type="submit" className="btn-save">Save</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default UserModal; 