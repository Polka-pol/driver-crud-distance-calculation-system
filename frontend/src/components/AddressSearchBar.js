import React, { useState, useEffect, useRef } from 'react';
import { getAddressSuggestions, getRecentSearches } from '../utils/addressAutofill';
import './SearchBar.css'; // We can reuse some styles

const AddressSearchBar = ({ query, onQueryChange, onSelect, placeholder, hideRecentInfo = false }) => {
    const [suggestions, setSuggestions] = useState([]);
    const [recentSearches, setRecentSearches] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    const [isSuggestionsVisible, setIsSuggestionsVisible] = useState(false);
    const [error, setError] = useState(null);
    const searchRef = useRef(null);
    const currentQuery = useRef('');

    // Main suggestions loading
    useEffect(() => {
        if (!query || query.length < 3) {
            setSuggestions([]);
            setRecentSearches([]);
            setError(null);
            currentQuery.current = '';
            return;
        }

        currentQuery.current = query;
        const handler = setTimeout(() => {
            // Only load main suggestions first
            getAddressSuggestions(query, setSuggestions, setIsLoading, setError);
        }, 300); // Debounce API call

        return () => {
            clearTimeout(handler);
        };
    }, [query]);

    // Load recent searches alongside main suggestions to prevent flickering
    useEffect(() => {
        if (query && query.length >= 3 && !hideRecentInfo) {
            // Load recent searches with same debounce timing as main suggestions
            const handler = setTimeout(async () => {
                if (currentQuery.current === query) {
                    try {
                        const recentResults = await getRecentSearches(query);
                        // Only update if query hasn't changed
                        if (currentQuery.current === query) {
                            setRecentSearches(recentResults || []);
                        }
                    } catch (err) {
                        console.warn('Error fetching recent searches:', err);
                    }
                }
            }, 300); // Same debounce as main suggestions

            return () => {
                clearTimeout(handler);
            };
        } else {
            setRecentSearches([]);
        }
    }, [query, hideRecentInfo]);

    // Handle clicks outside the search bar to close suggestions
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (searchRef.current && !searchRef.current.contains(event.target)) {
                setIsSuggestionsVisible(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const handleSelect = (suggestion) => {
        onSelect(suggestion.formattedAddress);
        setSuggestions([]);
        setRecentSearches([]);
        setIsSuggestionsVisible(false);
        setError(null);
        currentQuery.current = '';
    };

    // Find recent search info for a specific suggestion
    const findRecentSearchInfo = (suggestionAddress) => {
        return recentSearches.find(recent => {
            const normalizeAddress = (addr) => {
                return addr.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
            };
            
            const normalizedSuggestion = normalizeAddress(suggestionAddress);
            const normalizedRecent = normalizeAddress(recent.destination);
            
            return normalizedSuggestion.includes(normalizedRecent) || 
                   normalizedRecent.includes(normalizedSuggestion) ||
                   normalizedSuggestion === normalizedRecent;
        });
    };

    return (
        <div className="address-search-bar-container" ref={searchRef}>
            <style>
                {`
                    .recent-search-badge {
                        display: inline-flex;
                        align-items: center;
                        padding: 2px 6px;
                        margin-left: 8px;
                        border-radius: 12px;
                        font-size: 10px;
                        font-weight: 600;
                        background-color: #e3f2fd;
                        color: #1565c0;
                        border: 1px solid #bbdefb;
                    }
                    .recent-search-badge.loading {
                        background-color: #f5f5f5;
                        color: #999;
                        border: 1px solid #ddd;
                    }
                    .recent-search-badge .role-dot {
                        display: inline-block;
                        width: 6px;
                        height: 6px;
                        border-radius: 50%;
                        margin-right: 4px;
                    }
                    .recent-search-badge .role-dot.admin {
                        background-color: #dc3545;
                    }
                    .recent-search-badge .role-dot.manager {
                        background-color: #fd7e14;
                    }
                    .recent-search-badge .role-dot.dispatcher {
                        background-color: #20c997;
                    }
                    .recent-search-badge .role-dot.default {
                        background-color: #6c757d;
                    }
                    .suggestion-main-line {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        gap: 8px;
                        margin-bottom: 4px;
                    }
                    .suggestion-address {
                        flex: 1;
                        min-width: 0;
                    }
                    .suggestion-meta-enhanced {
                        display: flex;
                        align-items: center;
                        flex-wrap: wrap;
                        gap: 4px;
                    }
                    .loading-dots {
                        display: inline-block;
                        width: 12px;
                        height: 12px;
                        border: 2px solid #ddd;
                        border-top: 2px solid #999;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                    }
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                `}
            </style>
            <input
                type="text"
                className="search-bar"
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                onFocus={(e) => {
                    e.target.select(); // Select all text
                    setIsSuggestionsVisible(true);
                    setError(null);
                }}
                placeholder={placeholder || 'Enter address...'}
                autoComplete="off"
            />
            {isSuggestionsVisible && (suggestions?.length > 0 || isLoading || error) && (
                <div className="suggestions-list">
                    {isLoading ? (
                        <div className="suggestion-item">Loading...</div>
                    ) : error ? (
                        <div className="suggestion-item" style={{ color: '#dc3545', fontStyle: 'italic' }}>
                            {error}
                        </div>
                    ) : (
                        suggestions.map((suggestion, index) => {
                            const recentInfo = findRecentSearchInfo(suggestion.formattedAddress);
                            
                            return (
                                <div
                                    key={index}
                                    className="suggestion-item"
                                    onClick={() => handleSelect(suggestion)}
                                    title={`${suggestion.country || 'Unknown'} - ${suggestion.sourceLabel || suggestion.source}${recentInfo ? ` | Recently searched by ${recentInfo.user} (${recentInfo.role}) ${recentInfo.time_ago}` : ''}`}
                                >
                                    <div className="suggestion-content">
                                        <div className="suggestion-main-line">
                                            <span className="suggestion-address">
                                                {suggestion.formattedAddress}
                                            </span>
                                            {/* Show recent search info when available */}
                                            {recentInfo && !hideRecentInfo && (
                                                <span className="recent-search-badge">
                                                    <span className={`role-dot ${recentInfo.role}`}></span>
                                                    checked by {recentInfo.user} {recentInfo.time_ago}
                                                </span>
                                            )}
                                        </div>
                                        <div className="suggestion-meta-enhanced">
                                            <span className="suggestion-meta">
                                                {suggestion.flag} {suggestion.sourceLabel || suggestion.source}
                                            </span>

                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            )}
        </div>
    );
};

export default AddressSearchBar; 