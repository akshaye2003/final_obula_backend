/**
 * Frosted glass card with 3D depth – optional subtle glow, hover tilt.
 * Use for section cards, testimonials, pricing tiles, etc.
 */
export default function GlassCard({
  children,
  className = '',
  glow = false,
  depth3d = true,
  ...props
}) {
  const classes = glow ? 'glass-card-glow' : 'glass-card';
  return (
    <div
      className={`rounded-2xl ${classes} ${className} ${depth3d ? 'glass-card-3d' : ''}`}
      {...props}
    >
      {children}
    </div>
  );
}
