import { createContext, useContext, useRef, useState, useCallback } from 'react';

const ScrollContext = createContext(null);

export function ScrollProvider({ children }) {
  const scrollContainerRef = useRef(null);
  const scrollYRef = useRef(0);
  const scrollHeightRef = useRef(3000);
  const scrollClientHeightRef = useRef(window.innerHeight);
  const [scrollContainer, setScrollContainer] = useState(null);

  const setScrollContainerElement = useCallback((el) => {
    scrollContainerRef.current = el;
    setScrollContainer(el);
    if (el) {
      scrollHeightRef.current = el.scrollHeight;
      scrollClientHeightRef.current = el.clientHeight;
      scrollYRef.current = el.scrollTop;
    }
  }, []);

  return (
    <ScrollContext.Provider value={{ scrollContainerRef, scrollYRef, scrollHeightRef, scrollClientHeightRef, scrollContainer, setScrollContainerElement }}>
      {children}
    </ScrollContext.Provider>
  );
}

export function useScrollContext() {
  return useContext(ScrollContext);
}
