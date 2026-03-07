import { createContext, useContext, useState, useCallback } from 'react';

const UploadSessionContext = createContext(null);

export function UploadSessionProvider({ children }) {
  const [videoFile, setVideoFileState] = useState(null);
  const [videoId, setVideoIdState] = useState(null);

  const setSession = useCallback((file, id) => {
    setVideoFileState(file ?? null);
    setVideoIdState(id ?? null);
  }, []);

  const value = {
    videoFile,
    videoId,
    setSession,
  };

  return (
    <UploadSessionContext.Provider value={value}>
      {children}
    </UploadSessionContext.Provider>
  );
}

export function useUploadSession() {
  const ctx = useContext(UploadSessionContext);
  if (!ctx) throw new Error('useUploadSession must be used within UploadSessionProvider');
  return ctx;
}
