import React, { useEffect, useState } from 'react';
import { apiClient } from '../utils/apiClient';
import { API_BASE_URL } from '../config';
import { setAppTimezone, getAppTimezone } from '../utils/timeUtils';
import { usePermissions } from '../context/PermissionsContext';

const TimezoneSettings = () => {
  const { has } = usePermissions();
  const [currentTz, setCurrentTz] = useState(getAppTimezone());
  const [newTz, setNewTz] = useState('');
  const [status, setStatus] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [lastChange, setLastChange] = useState(null);
  const continentalUsTimezones = [
    'America/New_York', // Eastern Time
    'America/Chicago',  // Central Time
    'America/Denver',   // Mountain Time
    'America/Los_Angeles' // Pacific Time
  ];

  useEffect(() => {
    const load = async () => {
      try {
        const resp = await apiClient(`${API_BASE_URL}/settings/timezone`);
        if (resp.ok) {
          const data = await resp.json();
          if (data?.timezone) {
            setCurrentTz(data.timezone);
            setNewTz(data.timezone);
            setAppTimezone(data.timezone);
          }
        }
        const lastResp = await apiClient(`${API_BASE_URL}/settings/timezone/last-change`);
        if (lastResp.ok) {
          const last = await lastResp.json();
          if (last?.last_change) setLastChange(last.last_change);
        }
      } catch (e) {
        // ignore
      }
    };
    load();
  }, []);

  const handleSave = async () => {
    if (!newTz || newTz === currentTz) return;
    if (!has('settings.timezone.update')) {
      setStatus('You do not have permission to update timezone.');
      return;
    }
    const confirmMsg = `Change application timezone from "${currentTz}" to "${newTz}"? This affects date displays, daily windows, and holds.`;
    const ok = window.confirm(confirmMsg);
    if (!ok) return;
    setIsSaving(true);
    setStatus('');
    try {
      const resp = await apiClient(`${API_BASE_URL}/settings/timezone`, {
        method: 'PUT',
        body: JSON.stringify({ timezone: newTz })
      });
      const data = await resp.json();
      if (resp.ok && data?.success) {
        setCurrentTz(data.timezone);
        setAppTimezone(data.timezone);
        setStatus('Timezone updated successfully');
      } else {
        setStatus(data?.message || 'Failed to update timezone');
      }
    } catch (e) {
      setStatus('Network error, please try again');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ padding: 16 }}>
      <h3>Timezone Settings</h3>
      <div style={{ marginBottom: 8 }}>Current timezone: <strong>{currentTz}</strong></div>
      {lastChange && (
        <div style={{ marginBottom: 8, color: '#555' }}>
          Last change: {lastChange.previous_timezone} → {lastChange.new_timezone} by {lastChange.changed_by_username || lastChange.changed_by_user_id || 'unknown'} at {lastChange.created_at}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
        <select
          className="edit-input"
          style={{ maxWidth: 320 }}
          value={newTz}
          onChange={(e) => setNewTz(e.target.value)}
        >
          <option value="" disabled>Select US timezone</option>
          {continentalUsTimezones.map(tz => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
        </select>
        <input
          className="edit-input"
          style={{ maxWidth: 320 }}
          placeholder="Or enter custom IANA timezone"
          value={newTz}
          onChange={(e) => setNewTz(e.target.value)}
        />
        <button className="btn btn-primary" onClick={handleSave} disabled={isSaving || !newTz || newTz === currentTz}>
          {isSaving ? 'Saving...' : 'Save'}
        </button>
      </div>
      {status && <div>{status}</div>}
      <div style={{ marginTop: 12, color: '#666' }}>
        Note: Changing timezone affects how dates are displayed and how "today" and hold windows are computed. Daylight Saving Time rules apply automatically. Recent changes are recorded in Activity Dashboard.
      </div>
    </div>
  );
};

export default TimezoneSettings;


