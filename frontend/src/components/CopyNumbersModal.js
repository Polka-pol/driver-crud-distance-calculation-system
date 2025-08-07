import React, { useState, useEffect } from 'react';
import './CopyNumbersModal.css';

const CopyNumbersModal = ({ show, onClose, drivers }) => {
    const [phoneNumbers, setPhoneNumbers] = useState('');
    const [copySuccess, setCopySuccess] = useState(false);
    const [isFirstCopy, setIsFirstCopy] = useState(true);

    useEffect(() => {
        if (show && drivers) {
            const numbers = drivers.map(driver => {
                // Якщо є Contact phone, використовуємо його, інакше Cell phone
                return driver.contactphone || driver.CellPhone || '';
            }).filter(phone => phone && phone.trim() !== '' && phone !== 'N/A'); // Фільтруємо пусті номери та 'N/A'
            
            // Форматуємо номери для відображення (не більше 3 в рядку)
            const formattedNumbers = numbers.map((phone, index) => {
                const isLastInRow = (index + 1) % 3 === 0;
                const isLast = index === numbers.length - 1;
                return phone + (isLast ? '' : ',') + (isLastInRow && !isLast ? '\n' : '');
            }).join(' ');
            
            setPhoneNumbers(formattedNumbers);
            setIsFirstCopy(true); // Скидаємо стан при відкритті модального вікна
        }
    }, [show, drivers]);

    const handleCopy = () => {
        if (phoneNumbers) {
            // Отримуємо всі номери в одному рядку
            const allNumbers = phoneNumbers.replace(/\n/g, '').replace(/,\s*,/g, ',').replace(/,\s*$/g, '');
            const numbersArray = allNumbers.split(',').map(num => num.trim()).filter(num => num);
            
            // Визначаємо кількість номерів для копіювання
            const copyCount = isFirstCopy ? 2 : 40;
            
            // Беремо номери для копіювання з комою в кінці
            const numbersToCopy = numbersArray.slice(0, copyCount).join(', ') + ',';
            
            // Залишаємо тільки номери після скопійованих для відображення
            const remainingNumbers = numbersArray.slice(copyCount);
            
            navigator.clipboard.writeText(numbersToCopy).then(() => {
                setCopySuccess(true);
                setTimeout(() => setCopySuccess(false), 2000); // Hide success message after 2 seconds
                
                // Змінюємо стан після першого копіювання
                if (isFirstCopy) {
                    setIsFirstCopy(false);
                }
                
                // Оновлюємо текстове поле, залишаючи тільки невикористані номери
                if (remainingNumbers.length > 0) {
                    const formattedRemaining = remainingNumbers.map((phone, index) => {
                        const isLastInRow = (index + 1) % 3 === 0;
                        const isLast = index === remainingNumbers.length - 1;
                        return phone + (isLast ? '' : ',') + (isLastInRow && !isLast ? '\n' : '');
                    }).join(' ');
                    setPhoneNumbers(formattedRemaining);
                } else {
                    // Якщо номерів не залишилося, очищаємо поле
                    setPhoneNumbers('');
                }
            }).catch(err => {
                console.error('Failed to copy phone numbers:', err);
            });
        }
    };

    // Додаємо обробник клавіші Escape
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

    if (!show) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content copy-numbers-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Copy Driver Phone Numbers</h3>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>
                <div className="modal-body">
                    <div className="form-group">
                        <label>Phone Numbers ({phoneNumbers.split(',').filter(num => num.trim()).length} remaining numbers from {drivers ? drivers.length : 0} drivers):</label>
                        <textarea
                            value={phoneNumbers}
                            onChange={(e) => setPhoneNumbers(e.target.value)}
                            placeholder="Phone numbers will appear here..."
                            rows={8}
                            readOnly={false}
                            className="phone-numbers-textarea"
                        />
                    </div>
                    <div className="copy-info">
                        <p><strong>Logic:</strong> Uses "Contact phone" if available, otherwise uses "Cell phone"</p>
                        <p><strong>Copy:</strong> First copy: 2 numbers, subsequent copies: 40 numbers</p>
                        <p><strong>Remaining:</strong> Unused numbers will stay in the field for next copy</p>
                    </div>
                </div>
                <div className="modal-footer">
                    <button 
                        className="copy-btn" 
                        onClick={handleCopy}
                        disabled={!phoneNumbers.trim()}
                    >
                        {copySuccess ? 'Copied!' : `Copy First ${isFirstCopy ? '2' : '40'} Numbers (${Math.min(phoneNumbers.split(',').filter(num => num.trim()).length, isFirstCopy ? 2 : 40)})`}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CopyNumbersModal; 