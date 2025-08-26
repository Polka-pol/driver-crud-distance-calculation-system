import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/HybridAuthContext';
import './LoginPage.css';

const LoginPage = () => {
    const { signIn, loading, error: authError } = useAuth();
    const [email, setEmail] = useState('');
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
                        setEmail(credential.id);
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
            const result = await signIn(email, password);
            
            if (result.error) {
                throw new Error(result.error.message || 'Login failed');
            }
            
            // Explicitly tell the browser about successful login
            if (window.PasswordCredential && navigator.credentials && result.data?.user) {
                try {
                    // eslint-disable-next-line no-undef
                    const credential = new PasswordCredential({
                        id: email,
                        password: password,
                        name: result.data.user.user_metadata?.full_name || result.data.user.fullName || email
                    });
                    await navigator.credentials.store(credential);
                } catch (credError) {
                    // Credential API failed, but login was successful
                    console.log('Could not store credentials:', credError);
                }
            }
            
            // No need to call onLoginSuccess - HybridAuthContext handles state
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
                        <label htmlFor="email">Email</label>
                        <input
                            type="email"
                            id="email"
                            name="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            autoComplete="email"
                            placeholder="Email"
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
                    {(error || authError) && <p className="login-error-message">{error || authError}</p>}
                    <button type="submit" className="login-btn" disabled={isLoading || loading}>
                        {(isLoading || loading) ? 'Logging in...' : 'Login'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default LoginPage; 