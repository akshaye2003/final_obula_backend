import { useMobile } from '../hooks/useMobile.js';
import LandingDesktop from './LandingDesktop.jsx';
import LandingMobile from './LandingMobile.jsx';

/**
 * Main landing page router.
 * - Viewport > 768px → LandingDesktop (locked layout)
 * - Viewport ≤ 768px → LandingMobile (editable for mobile users)
 *
 * Edit LandingMobile.jsx without affecting the desktop layout.
 */
export default function Landing() {
  const isMobile = useMobile();
  return isMobile ? <LandingMobile /> : <LandingDesktop />;
}
