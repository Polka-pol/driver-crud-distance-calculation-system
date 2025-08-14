import React, { createContext, useContext, useMemo } from 'react';

const PermissionsContext = createContext({ permissions: [], has: () => false });

export function PermissionsProvider({ permissions, children }) {
  const value = useMemo(() => ({
    permissions: Array.isArray(permissions) ? permissions : [],
    has: (key) => {
      if (!Array.isArray(permissions)) return false;
      // Admin wildcard support
      if (permissions.includes('*')) return true;
      return permissions.includes(key);
    },
  }), [permissions]);

  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  return useContext(PermissionsContext);
}


