import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useScrollContext } from '../context/ScrollContext.jsx';

export default function Global3DBackground({ isMobile = false }) {
  const containerRef = useRef(null);
  const frameRef = useRef(null);
  const scrollCtx = useScrollContext();
  const scrollYRef = scrollCtx?.scrollYRef;
  const scrollHeightRef = scrollCtx?.scrollHeightRef;
  const scrollClientHeightRef = scrollCtx?.scrollClientHeightRef;
  const scrollContainerRef = scrollCtx?.scrollContainerRef;
  const mouse = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (prefersReducedMotion) return;

    let scene, camera, renderer, meshes = [];
    const toDispose = [];

    try {
      const width = window.innerWidth;
      const height = window.innerHeight;

      scene = new THREE.Scene();

      camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
      camera.position.z = 28;

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(0x000000, 0);
      container.appendChild(renderer.domElement);

      // Theme colors: accent (#C9A962), accent-warm (#D4AF37), accent-dim (#B8A988), cream highlight (#F5E6B3)
      const accent = new THREE.Color(0xc9a962);    // champagne – primary
      const accentWarm = new THREE.Color(0xd4af37); // gold
      const accentDim = new THREE.Color(0xb8a988);  // muted
      const cream = new THREE.Color(0xf5e6b3);       // soft cream from gradient

      const add = (mesh) => {
        scene.add(mesh);
        meshes.push(mesh);
      };

      // —— INTERSTELLAR INFINITE DEPTH STARS (full viewport coverage) ——
      const starCount = 28000;
      const starRadius = isMobile ? 0.42 : 0.6;
      const starGeo = new THREE.SphereGeometry(starRadius, 6, 6);
      const stars = [];
      const spread = 5200;

      const randInSpread = () => (Math.random() - 0.5) * spread;
      
      for (let i = 0; i < starCount; i++) {
        const t = Math.random();
        const c = t < 0.55 ? accent : t < 0.85 ? accentWarm : t < 0.95 ? accentDim : cream;
        
        const starMat = new THREE.MeshBasicMaterial({
          color: c,
          transparent: true,
          opacity: 0.8 + Math.random() * 0.2,
        });
        
        const star = new THREE.Mesh(starGeo, starMat);
        
        const x = randInSpread();
        const y = randInSpread();
        const z = -80 - Math.random() * 340;
        star.position.set(x, y, z);
        const depth = Math.max(0.15, (z + 450) / 450);
        
        star.userData = {
          originalX: x,
          originalY: y,
          baseZ: z,
          depth,
          speed: 0.3 + Math.random() * 0.4,
          isStar: true,
        };
        
        add(star);
        stars.push(star);
        toDispose.push(starMat);
      }
      toDispose.push(starGeo);

      // —— ORBITAL RINGS – thin LineLoop (desktop & mobile) ——
      const orbitalRings = [];
      const ringConfigs = [
        [120, 80, -100, -30, 0, Math.PI * 0.25, 0, 0],
        [100, 100, 50, 20, -80, Math.PI * 0.4, Math.PI * 0.2, 0],
        [90, 60, -40, -50, -160, Math.PI * 0.15, Math.PI * 0.5, Math.PI * 0.1],
        [140, 50, 80, -20, -220, Math.PI * 0.5, Math.PI * 0.3, 0],
        [70, 110, -80, 40, -120, Math.PI * 0.35, -Math.PI * 0.2, Math.PI * 0.15],
        [85, 95, 30, -60, -40, Math.PI * 0.2, Math.PI * 0.4, Math.PI * 0.08],
        [110, 70, -70, 50, -200, Math.PI * 0.45, -Math.PI * 0.1, Math.PI * 0.2],
        [95, 85, 60, 30, -140, Math.PI * 0.1, Math.PI * 0.6, 0],
        [65, 75, -50, -70, -260, Math.PI * 0.3, Math.PI * 0.25, Math.PI * 0.12],
        [130, 45, 0, 0, -100, Math.PI * 0.55, Math.PI * 0.15, 0],
      ];

      const tubeRadius = 0.1;
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xc9a962,
        transparent: true,
        opacity: 0.14,
        side: THREE.DoubleSide,
      });
      ringConfigs.forEach(([rx, ry, ox, oy, oz, rotX, rotY, rotZ]) => {
        const ellipse = new THREE.EllipseCurve(0, 0, rx, ry, 0, Math.PI * 2, false, 0);
        const pts = ellipse.getPoints(96).map((p) => new THREE.Vector3(p.x, p.y, 0));
        const path = new THREE.CatmullRomCurve3(pts);
        const geo = new THREE.TubeGeometry(path, 64, tubeRadius, 8, true);
        const ring = new THREE.Mesh(geo, ringMat);
        ring.position.set(ox, oy, oz);
        ring.rotation.set(rotX, rotY, rotZ);
        ring.userData = { rotSpeed: (Math.random() - 0.5) * 0.006 };
        orbitalRings.push(ring);
        add(ring);
        toDispose.push(geo);
      });
      toDispose.push(ringMat);

      const handleResize = () => {
        if (!container?.parentElement) return;
        const w = window.innerWidth;
        const h = window.innerHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };

      const mouseTarget = { x: 0, y: 0 };
      let prevMouseY = null;
      let cursorVelY = 0;
      const lerp = (a, b, t) => a + (b - a) * t;
      let currentRecedeSpeed = 0.025;
      const handleMouse = (e) => {
        const ny = -(e.clientY / window.innerHeight - 0.5) * 2;
        if (prevMouseY !== null) cursorVelY += (ny - prevMouseY) * 10;
        prevMouseY = ny;
        mouseTarget.x = (e.clientX / window.innerWidth - 0.5) * 2;
        mouseTarget.y = ny;
      };
      window.addEventListener('resize', handleResize);
      window.addEventListener('mousemove', handleMouse, { capture: true, passive: true });
      document.addEventListener('mousemove', handleMouse, { capture: true, passive: true });

      let time = 0;
      let lastTime = performance.now();
      let smoothScrollProgress = 0;
      let smoothScroll = 0;
      const getScrollEl = () => {
        const el = scrollContainerRef?.current ?? document.querySelector('[data-scroll-container]');
        return el?.isConnected ? el : null;
      };

      const animate = (now = 0) => {
        frameRef.current = requestAnimationFrame(animate);
        const dt = Math.min((now - lastTime) / 1000, 0.1);
        lastTime = now;
        time += dt * 0.5;

        mouse.current.x = lerp(mouse.current.x, mouseTarget.x, 0.12);
        mouse.current.y = lerp(mouse.current.y, mouseTarget.y, 0.12);

        cursorVelY *= 0.92;
        if (Math.abs(cursorVelY) < 0.01) cursorVelY = 0;

        const scrollEl = getScrollEl();
        const sy = scrollEl ? scrollEl.scrollTop : (scrollYRef?.current ?? 0);
        const sh = scrollEl ? Math.max(scrollEl.scrollHeight, window.innerHeight) : (scrollHeightRef?.current ?? 3000);
        const ch = scrollEl ? scrollEl.clientHeight : (scrollClientHeightRef?.current ?? window.innerHeight);
        const maxScrollable = Math.max(1, sh - ch);
        const rawProgress = Math.min(sy / maxScrollable, 1);
        smoothScrollProgress = rawProgress;

        const maxScroll = 60;
        const scrollCurve = Math.pow(Math.min(sy / maxScroll, 1) + 0.02, 0.06);
        const idleSpeed = 0.02;
        const maxScrollBoost = 0.22;
        const targetFromScroll = idleSpeed + scrollCurve * maxScrollBoost;
        const cursorDepth = -cursorVelY * 0.35;
        const targetSpeed = Math.max(0.02, targetFromScroll + cursorDepth);
        currentRecedeSpeed = lerp(currentRecedeSpeed, targetSpeed, 0.45);

        const cameraScrollRange = 450;
        const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        const rawScroll = smoothScrollProgress * cameraScrollRange;
        smoothScroll = lerp(smoothScroll, rawScroll, 0.88);
        const mx = mouse.current.x * 18;
        const my = mouse.current.y * 14;
        const scrollScale = isTouch ? 1.15 : 1.1;
        camera.position.set(mx - smoothScroll * 0.35 * scrollScale, my - smoothScroll * 0.6 * scrollScale, 28 + smoothScroll * 1.2 * scrollScale);
        camera.lookAt(mx * 0.14, my * 0.14 - smoothScroll * 0.18 * scrollScale, -80);
        camera.updateProjectionMatrix();

        orbitalRings.forEach((ring) => {
          ring.rotation.y += ring.userData.rotSpeed || 0.001;
          ring.scale.setScalar(1);
        });

        stars.forEach((star) => {
          const p = star.userData;
          const depthFactor = 0.5 + 1.1 * p.depth;
          
          star.position.z -= currentRecedeSpeed * depthFactor;
          
          if (star.position.z < -420) {
            p.originalX = randInSpread();
            p.originalY = randInSpread();
            star.position.z = -60 - Math.random() * 60;
            p.baseZ = star.position.z;
            p.depth = Math.max(0.15, (star.position.z + 450) / 450);
          }
          if (star.position.z > 10) {
            p.originalX = randInSpread();
            p.originalY = randInSpread();
            star.position.z = -350 - Math.random() * 70;
            p.baseZ = star.position.z;
            p.depth = Math.max(0.15, (star.position.z + 450) / 450);
          }
          
          const cursorParallaxX = mouse.current.x * 22;
          const cursorParallaxY = mouse.current.y * 18;
          star.position.x = p.originalX + cursorParallaxX * (0.35 + 0.7 * p.depth);
          star.position.y = p.originalY + cursorParallaxY * (0.35 + 0.7 * p.depth);
          
          const depthNorm = Math.max(0.12, (star.position.z + 430) / 430);
          const baseScale = 0.45 + 0.9 * depthNorm;
          const scale = isMobile ? baseScale : baseScale * 1.5;
          star.scale.setScalar(scale);
          
          const depthOpacity = 0.5 + 0.5 * depthNorm;
          star.material.opacity = (0.75 + Math.sin(time * p.speed) * 0.05) * depthOpacity;
        });

        renderer.render(scene, camera);
      };
      animate();

      return () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('mousemove', handleMouse, { capture: true });
        document.removeEventListener('mousemove', handleMouse, { capture: true });
        if (frameRef.current) cancelAnimationFrame(frameRef.current);
        renderer.dispose();
        toDispose.forEach((d) => d?.dispose?.());
        if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      };
    } catch (err) {
      console.warn('[Global3D] Could not initialize:', err);
    }
  }, [scrollYRef, scrollHeightRef, scrollClientHeightRef, scrollContainerRef, isMobile]);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 overflow-hidden pointer-events-none"
      style={{ zIndex: 0, willChange: 'transform' }}
      aria-hidden="true"
    />
  );
}
