import React, { useState, useEffect } from 'react';
import './AdminPage.css';
import ActivityDashboard from './ActivityDashboard'; // Import the new component
import DatabaseAnalytics from './DatabaseAnalytics'; // Import new component
import SessionManagement from './SessionManagement'; // Import Session Management component

const AdminPage = ({ onBack, user }) => {
    const isAdmin = user && user.role === 'admin';
    // Default to 'sessions' if admin, otherwise 'activity'
    const [activeTab, setActiveTab] = useState(isAdmin ? 'sessions' : 'activity');
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    // Cleanup on component unmount
    useEffect(() => {
        return () => {
            document.body.classList.remove('mobile-menu-open');
        };
    }, []);

    const renderContent = () => {
        switch (activeTab) {
            case 'activity':
                return <ActivityDashboard />;
            case 'db-analytics':
                return isAdmin ? <DatabaseAnalytics /> : <ActivityDashboard />;
            case 'sessions':
                return isAdmin ? <SessionManagement /> : <ActivityDashboard />;
            default:
                return isAdmin ? <SessionManagement /> : <ActivityDashboard />;
        }
    };

    const handleMenuToggle = () => {
        const newState = !isMobileMenuOpen;
        setIsMobileMenuOpen(newState);
        
        // Add/remove class to body for styling purposes
        if (newState) {
            document.body.classList.add('mobile-menu-open');
        } else {
            document.body.classList.remove('mobile-menu-open');
        }
    };

    const handleMenuItemClick = (tab) => {
        setActiveTab(tab);
        setIsMobileMenuOpen(false); // Close mobile menu when item is selected
        document.body.classList.remove('mobile-menu-open');
    };

    return (
        <div className="admin-page-layout">
            {/* Mobile menu button */}
            <button className="mobile-menu-toggle" onClick={handleMenuToggle}>
                <span className={`hamburger ${isMobileMenuOpen ? 'open' : ''}`}>
                    <span></span>
                    <span></span>
                    <span></span>
                </span>
                <span className="menu-text">Admin menu</span>
            </button>

            {/* Mobile overlay */}
            {isMobileMenuOpen && <div className="mobile-overlay" onClick={() => {
                setIsMobileMenuOpen(false);
                document.body.classList.remove('mobile-menu-open');
            }}></div>}

            <div className={`admin-sidebar ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
                <div className="admin-sidebar-header">
                    <h3>Admin Menu</h3>
                    <button className="mobile-close" onClick={() => {
                        setIsMobileMenuOpen(false);
                        document.body.classList.remove('mobile-menu-open');
                    }}>
                        ×
                    </button>
                </div>
                <ul className="admin-menu">
                    {isAdmin && (
                        <li
                            className={activeTab === 'sessions' ? 'active' : ''}
                            onClick={() => handleMenuItemClick('sessions')}
                        >
                            User & Session Management
                        </li>
                    )}
                    <li
                        className={activeTab === 'activity' ? 'active' : ''}
                        onClick={() => handleMenuItemClick('activity')}
                    >
                        Activity Dashboard
                    </li>
                    {isAdmin && (
                        <li
                            className={activeTab === 'db-analytics' ? 'active' : ''}
                            onClick={() => handleMenuItemClick('db-analytics')}
                        >
                            Database Analytics
                        </li>
                    )}
                </ul>
            </div>
            <div className="admin-main-content">
                <div className="admin-content-header">
                    <button onClick={onBack} className="back-btn">
                        ← Back to Main
                    </button>
                </div>
                {renderContent()}
            </div>
        </div>
    );
};

export default AdminPage; 