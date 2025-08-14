import React, { useState, useEffect } from 'react';
import './AdminPage.css';
import ActivityDashboard from './ActivityDashboard';
import DatabaseAnalytics from './DatabaseAnalytics';
import SessionManagement from './SessionManagement';
import TimezoneSettings from './TimezoneSettings';
import { usePermissions } from '../context/PermissionsContext';
import RbacManager from './RbacManager';

const AdminPage = ({ onBack, user, serverTimeOffset = 0 }) => {
    const { has } = usePermissions();
    const isAdmin = has('sessions.manage');
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
                return <ActivityDashboard serverTimeOffset={serverTimeOffset} />;
            case 'db-analytics':
                return has('dashboard.analytics.view') ? <DatabaseAnalytics /> : <ActivityDashboard serverTimeOffset={serverTimeOffset} />;
            case 'sessions':
                return has('sessions.manage') ? <SessionManagement /> : <ActivityDashboard serverTimeOffset={serverTimeOffset} />;
            case 'timezone-settings':
                return has('settings.timezone.view') ? <TimezoneSettings /> : <ActivityDashboard serverTimeOffset={serverTimeOffset} />;
            case 'rbac':
                return (has('rbac.roles.manage') || has('rbac.permissions.manage')) ? <RbacManager /> : <ActivityDashboard serverTimeOffset={serverTimeOffset} />;
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
                    {has('sessions.manage') && (
                        <li
                            className={activeTab === 'sessions' ? 'active' : ''}
                            onClick={() => handleMenuItemClick('sessions')}
                        >
                            User & Session Management
                        </li>
                    )}
                    {has('settings.timezone.view') && (
                        <li
                            className={activeTab === 'timezone-settings' ? 'active' : ''}
                            onClick={() => handleMenuItemClick('timezone-settings')}
                        >
                            Timezone Settings
                        </li>
                    )}
                    <li
                        className={activeTab === 'activity' ? 'active' : ''}
                        onClick={() => handleMenuItemClick('activity')}
                    >
                        Activity Dashboard
                    </li>
                    {has('dashboard.analytics.view') && (
                        <li
                            className={activeTab === 'db-analytics' ? 'active' : ''}
                            onClick={() => handleMenuItemClick('db-analytics')}
                        >
                            Database Analytics
                        </li>
                    )}
                    {(has('rbac.roles.manage') || has('rbac.permissions.manage')) && (
                        <li
                            className={activeTab === 'rbac' ? 'active' : ''}
                            onClick={() => handleMenuItemClick('rbac')}
                        >
                            Roles & Permissions
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