import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * Lightweight 3D background for the hero section.
 * Lazy-initializes when mounted; respects prefers-reduced-motion.
 */
export default function Hero3DBackground() {
  const containerRef = useRef(null);
  const frameRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (prefersReducedMotion) return;

    let scene, camera, renderer, meshes = [];

    try {
      const width = container.offsetWidth;
      const height = container.offsetHeight;

      scene = new THREE.Scene();

      camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100);
      camera.position.z = 8;

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(0x09090b, 0);
      container.appendChild(renderer.domElement);

      const accentViolet = new THREE.Color(0x8b5cf6);
      const accentIndigo = new THREE.Color(0x6366f1);

      const createMesh = (geometry, color, x, y, z, scale = 1) => {
        const material = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.05,
          wireframe: true,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x, y, z);
        mesh.scale.setScalar(scale);
        scene.add(mesh);
        return mesh;
      };

      const geo1 = new THREE.TorusKnotGeometry(0.8, 0.2, 32, 8);
      const geo2 = new THREE.IcosahedronGeometry(1, 0);
      const geo3 = new THREE.TorusGeometry(1, 0.25, 16, 32);

      meshes.push(createMesh(geo1, accentViolet, -4, 0.8, -6, 0.6));
      meshes.push(createMesh(geo2, accentIndigo, 4.2, -0.5, -7, 0.5));
      meshes.push(createMesh(geo3, accentViolet, -3.5, -1.2, -8, 0.35));

      const handleResize = () => {
        if (!container?.parentElement) return;
        const w = container.offsetWidth;
        const h = container.offsetHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };

      window.addEventListener('resize', handleResize);

      let time = 0;
      const animate = () => {
        frameRef.current = requestAnimationFrame(animate);
        time += 0.002;
        meshes.forEach((mesh, i) => {
          mesh.rotation.y = time * (0.2 + i * 0.05);
          mesh.rotation.x = Math.sin(time * 0.3) * 0.05;
        });
        renderer.render(scene, camera);
      };
      animate();

      return () => {
        window.removeEventListener('resize', handleResize);
        if (frameRef.current) cancelAnimationFrame(frameRef.current);
        renderer.dispose();
        meshes.forEach((m) => {
          m.geometry.dispose();
          m.material.dispose();
        });
        if (container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
        }
      };
    } catch (err) {
      console.warn('[Hero3D] Could not initialize:', err);
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden pointer-events-none"
      style={{ zIndex: 0 }}
      aria-hidden="true"
    />
  );
}
