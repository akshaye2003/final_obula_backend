/**
 * Example: How to integrate EffectsTabMobile into EditClip.jsx
 * 
 * This shows how to use the mobile Effects tab component in your existing
 * EditClip page. You can use this as a reference for integration.
 */

import { useState, useEffect } from 'react';
import EffectsTabMobile from './EffectsTabMobile.jsx';
import './EffectsTabMobile.css';

// Example usage within EditClip component
export function EditClipEffectsTabExample() {
  // These states would come from your existing EditClip component
  const [rotation, setRotation] = useState(0);
  const [colorGrade, setColorGrade] = useState('');
  const [roundedCorners, setRoundedCorners] = useState('medium');
  const [aspectRatio, setAspectRatio] = useState('');
  const [noiseIsolation, setNoiseIsolation] = useState(false);
  const [colorGradePreviews, setColorGradePreviews] = useState(null);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Fetch color grade previews (example)
  useEffect(() => {
    // This would be your existing API call
    // getColorGradePreviews(prepJobId).then(setColorGradePreviews);
  }, []);

  // For non-mobile, use the existing Effects tab UI
  if (!isMobile) {
    return <DesktopEffectsTab />;
  }

  // Mobile Effects Tab
  return (
    <div className="effects-tab-mobile min-h-screen bg-[#0a0a0a]">
      {/* Header - matching the image */}
      <div className="px-4 pt-4 pb-2">
        <h1 className="text-lg font-semibold text-white tracking-tight" style={{ fontFamily: 'Syne, DM Sans, system-ui' }}>
          Craft Your Clip
        </h1>
        <p className="text-white/45 text-xs mt-1">Refine words · Pick a style · Export</p>
      </div>

      {/* Tab Navigation - horizontal scrollable */}
      <div className="px-4 py-2">
        <TabBar activeTab="effects" onTabChange={(tab) => console.log('Switch to:', tab)} />
      </div>

      {/* Effects Tab Content */}
      <div className="px-4 py-4">
        <EffectsTabMobile
          rotation={rotation}
          onRotationChange={setRotation}
          colorGrade={colorGrade}
          onColorGradeChange={setColorGrade}
          roundedCorners={roundedCorners}
          onRoundedCornersChange={setRoundedCorners}
          aspectRatio={aspectRatio}
          onAspectRatioChange={setAspectRatio}
          noiseIsolation={noiseIsolation}
          onNoiseIsolationChange={setNoiseIsolation}
          colorGradePreviews={colorGradePreviews}
        />
      </div>
    </div>
  );
}

// Tab Bar Component (matches the image design)
function TabBar({ activeTab, onTabChange }) {
  const tabs = [
    { id: 'transcript', label: 'Transcript' },
    { id: 'captions', label: 'Captions' },
    { id: 'broll', label: 'B-Roll' },
    { id: 'effects', label: 'Effects' },
    { id: 'export', label: 'Export' },
  ];

  return (
    <div 
      className="flex gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06] overflow-x-auto"
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex-1 min-w-[72px] py-2.5 px-3 text-[11px] font-medium transition-all whitespace-nowrap rounded-lg ${
            activeTab === tab.id
              ? 'bg-[#C9A84C]/20 text-[#C9A84C]'
              : 'text-white/50 hover:text-white/75 hover:bg-white/[0.04]'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// Placeholder for desktop effects tab
function DesktopEffectsTab() {
  return (
    <div className="p-4">
      <p className="text-white/60">Desktop Effects tab UI here...</p>
    </div>
  );
}

// ============================================
// INTEGRATION GUIDE
// ============================================

/*
To integrate EffectsTabMobile into your existing EditClip.jsx:

1. IMPORT THE COMPONENT AND CSS:
   
   import EffectsTabMobile from '../components/EffectsTabMobile.jsx';
   import '../components/EffectsTabMobile.css';


2. ADD MOBILE DETECTION (if not already present):
   
   const [isMobile, setIsMobile] = useState(window.innerWidth < 640);
   
   useEffect(() => {
     const handleResize = () => setIsMobile(window.innerWidth < 640);
     window.addEventListener('resize', handleResize);
     return () => window.removeEventListener('resize', handleResize);
   }, []);


3. REPLACE THE EFFECTS TAB RENDER SECTION (around line 2097):
   
   Find this code:
   {activeTab === 'effects' && (
     <>
       <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-4">
         ... existing effects UI ...
       </section>
     </>
   )}

   Replace with:
   {activeTab === 'effects' && (
     <>
       {isMobile ? (
         <EffectsTabMobile
           rotation={rotation}
           onRotationChange={(value) => {
             setRotation(value);
             if (value !== 0) setRotationPopupSeen(true);
           }}
           colorGrade={colorGrade}
           onColorGradeChange={setColorGrade}
           roundedCorners={roundedCorners}
           onRoundedCornersChange={setRoundedCorners}
           aspectRatio={aspectRatio}
           onAspectRatioChange={setAspectRatio}
           noiseIsolation={noiseIsolation}
           onNoiseIsolationChange={setNoiseIsolation}
           colorGradePreviews={colorGradePreviews}
         />
       ) : (
         // ... keep existing desktop Effects UI here ...
       )}
     </>
   )}


4. OPTIONAL: Enhance with framer-motion for smooth animations:
   
   import { motion, AnimatePresence } from 'framer-motion';
   
   Then wrap sections with:
   <motion.section
     initial={{ opacity: 0, y: 20 }}
     animate={{ opacity: 1, y: 0 }}
     transition={{ duration: 0.3 }}
   >
     ...
   </motion.section>


5. STYLING NOTES:
   
   - The component uses Tailwind CSS classes
   - Gold accent color: #C9A84C
   - Background: #0a0a0a
   - Card backgrounds: bg-white/[0.02] with border-white/[0.06]
   - All touch targets are minimum 44px
   - Horizontal scroll on button groups with hidden scrollbar


6. PROPS REFERENCE:

   Prop                    Type       Default    Description
   ----------------------- ---------- ---------- ----------------------------------
   rotation               number     0          Current rotation value (0/90/180/270)
   onRotationChange       function   -          Called when rotation changes
   colorGrade             string     ''         Selected color grade value
   onColorGradeChange     function   -          Called when color grade changes
   roundedCorners         string     'medium'   Corner radius option
   onRoundedCornersChange function   -          Called when corners change
   aspectRatio            string     ''         Aspect ratio value
   onAspectRatioChange    function   -          Called when aspect ratio changes
   noiseIsolation         boolean    false      Noise reduction toggle state
   onNoiseIsolationChange function   -          Called when toggle changes
   colorGradePreviews     object     null       Preview images {before, cinematic, ...}

*/

export default EditClipEffectsTabExample;
