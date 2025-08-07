import React, { useState, useEffect } from 'react';
import './CopyNumbersModal.css';

const CopyNumbersModal = ({ show, onClose, drivers }) => {
    const [phoneNumbers, setPhoneNumbers] = useState('');
    const [copySuccess, setCopySuccess] = useState(false);
    const [copyCount, setCopyCount] = useState(0); // Copy counter

    useEffect(() => {
        if (show && drivers) {
            const numbers = drivers.map(driver => {
                // If Contact phone exists, use it, otherwise use Cell phone
                return driver.contactphone || driver.CellPhone || '';
            }).filter(phone => phone && phone.trim() !== '' && phone !== 'N/A'); // Filter empty numbers and 'N/A'
            
            // Format numbers for display (no more than 3 per row)
            const formattedNumbers = numbers.map((phone, index) => {
                const isLastInRow = (index + 1) % 3 === 0;
                const isLast = index === numbers.length - 1;
                return phone + (isLast ? '' : ',') + (isLastInRow && !isLast ? '\n' : '');
            }).join(' ');
            
            setPhoneNumbers(formattedNumbers);
            setCopyCount(0); // Reset counter when opening modal
        }
    }, [show, drivers]);

    const handleCopy = () => {
        if (phoneNumbers) {
            // Get all numbers in one line
            const allNumbers = phoneNumbers.replace(/\n/g, '').replace(/,\s*,/g, ',').replace(/,\s*$/g, '');
            const numbersArray = allNumbers.split(',').map(num => num.trim()).filter(num => num);
            
            // Determine number of numbers to copy: alternate between 2 and 40
            const numbersToCopyCount = copyCount % 2 === 0 ? 2 : 40;
            
            // Take numbers for copying with comma at the end
            const numbersToCopy = numbersArray.slice(0, numbersToCopyCount).join(', ') + ',';
            
            // Leave only numbers after copied ones for display
            const remainingNumbers = numbersArray.slice(numbersToCopyCount);
            
            navigator.clipboard.writeText(numbersToCopy).then(() => {
                setCopySuccess(true);
                setTimeout(() => setCopySuccess(false), 2000); // Hide success message after 2 seconds
                
                // Increment copy counter
                setCopyCount(prevCount => prevCount + 1);
                
                // Update text field, leaving only unused numbers
                if (remainingNumbers.length > 0) {
                    const formattedRemaining = remainingNumbers.map((phone, index) => {
                        const isLastInRow = (index + 1) % 3 === 0;
                        const isLast = index === remainingNumbers.length - 1;
                        return phone + (isLast ? '' : ',') + (isLastInRow && !isLast ? '\n' : '');
                    }).join(' ');
                    setPhoneNumbers(formattedRemaining);
                } else {
                    // If no numbers left, clear the field
                    setPhoneNumbers('');
                }
            }).catch(err => {
                console.error('Failed to copy phone numbers:', err);
            });
        }
    };

    // Add Escape key handler
    useEffect(() => {
        const handleEscape = (event) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        if (show) {
            document.addEventListener('keydown', handleEscape);
            return () => document.removeEventListener('keydown', handleEscape);
        }
    }, [show, onClose]);

    // Function to generate line numbers
    const generateLineNumbers = (text) => {
        const lines = text.split('\n');
        return lines.map((_, index) => index + 1).join('\n');
    };

    // Scroll handler to synchronize textarea with line numbers
    const handleScroll = (e) => {
        const lineNumbers = e.target.parentNode.querySelector('.line-numbers');
        if (lineNumbers) {
            lineNumbers.scrollTop = e.target.scrollTop;
        }
    };

    if (!show) return null;

    // Determine number of numbers for next copy
    const nextCopyCount = copyCount % 2 === 0 ? 2 : 40;
    const remainingNumbersCount = phoneNumbers.split(',').filter(num => num.trim()).length;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content copy-numbers-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Copy Driver Phone Numbers</h3>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>
                <div className="modal-body">
                    <div className="form-group">
                        <label>Phone Numbers ({remainingNumbersCount} remaining numbers from {drivers ? drivers.length : 0} drivers):</label>
                        <div className="textarea-wrapper">
                            <div className="line-numbers">
                                {generateLineNumbers(phoneNumbers)}
                            </div>
                            <textarea
                                value={phoneNumbers}
                                onChange={(e) => setPhoneNumbers(e.target.value)}
                                onScroll={handleScroll}
                                placeholder="Phone numbers will appear here..."
                                rows={8}
                                readOnly={false}
                                className="phone-numbers-textarea"
                            />
                        </div>
                    </div>
                    <div className="copy-info">
                        <p><strong>Logic:</strong> Uses "Contact phone" if available, otherwise uses "Cell phone"</p>
                        <p><strong>Copy:</strong> Alternates between 2 and 40 numbers (2-40-2-40-2-40...)</p>
                        <p><strong>Remaining:</strong> Unused numbers will stay in the field for next copy</p>
                    </div>
                </div>
                <div className="modal-footer">
                    <button 
                        className="copy-btn" 
                        onClick={handleCopy}
                        disabled={!phoneNumbers.trim()}
                    >
                        {copySuccess ? 'Copied!' : `Copy Next ${nextCopyCount} Numbers (${Math.min(remainingNumbersCount, nextCopyCount)})`}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CopyNumbersModal; 