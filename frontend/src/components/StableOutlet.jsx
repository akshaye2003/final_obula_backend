import { useState } from 'react';
import { useOutlet } from 'react-router-dom';

/**
 * Freezes the outlet content at mount so it doesn't update during exit animations.
 * Required for AnimatePresence to show the correct page during page transitions.
 */
export default function StableOutlet() {
  const outlet = useOutlet();
  const [stable] = useState(outlet);
  return stable;
}
