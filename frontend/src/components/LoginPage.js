import React, { useState, useEffect } from 'react';
import { login } from '../utils/auth';
import './LoginPage.css';

const LoginPage = ({ onLoginSuccess }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // Try to get saved credentials when component mounts
    useEffect(() => {
        const loadSavedCredentials = async () => {
            if (window.PasswordCredential && navigator.credentials) {
                try {
                    const credential = await navigator.credentials.get({
                        password: true,
                        mediation: 'optional'
                    });
                    
                    if (credential && credential.type === 'password') {
                        setUsername(credential.id);
                        setPassword(credential.password);
                    }
                } catch (error) {
                    // Failed to get credentials, but that's ok
                    console.log('Could not retrieve saved credentials:', error);
                }
            }
        };

        loadSavedCredentials();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);
        try {
            const user = await login(username, password);
            
            // Explicitly tell the browser about successful login
            if (window.PasswordCredential && navigator.credentials) {
                try {
                    // eslint-disable-next-line no-undef
                    const credential = new PasswordCredential({
                        id: username,
                        password: password,
                        name: user.fullName || username
                    });
                    await navigator.credentials.store(credential);
                } catch (credError) {
                    // Credential API failed, but login was successful
                    console.log('Could not store credentials:', credError);
                }
            }
            
            onLoginSuccess(user);
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="login-page">
            <div className="login-container">
                <h2>Connex Transport</h2>
                <form onSubmit={handleSubmit} name="loginForm" id="loginForm">
                    <div className="form-group">
                        <label htmlFor="username">Username</label>
                        <input
                            type="text"
                            id="username"
                            name="username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                            autoComplete="username"
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="password">Password</label>
                        <input
                            type="password"
                            id="password"
                            name="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            autoComplete="current-password"
                        />
                    </div>
                    {error && <p className="login-error-message">{error}</p>}
                    <button type="submit" className="login-btn" disabled={isLoading}>
                        {isLoading ? 'Logging in...' : 'Login'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default LoginPage; 