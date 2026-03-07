import { Link } from 'react-router-dom';

const SIZES = {
  sm: { logo: 'h-5 w-5', text: 'text-base' },   // footer, compact
  md: { logo: 'h-6 w-6', text: 'text-lg' },
  lg: { logo: 'h-7 w-7', text: 'text-xl' },     // nav – same on web + mobile
  xl: { logo: 'h-8 w-8', text: 'text-2xl' },
};

/**
 * Consistent Obula logo + text for web and mobile.
 * Use the same size on both breakpoints so logo and wordmark always match.
 */
export default function ObulaLogo({ size = 'lg', asLink = true, className = '' }) {
  const { logo, text } = SIZES[size];

  const content = (
    <span className={`inline-flex items-center gap-2 font-bold tracking-tight text-white whitespace-nowrap leading-none ${className}`}>
      <img src="/logo.png" alt="" className={`${logo} shrink-0 object-contain block`} />
      <span className={`${text} shrink-0 leading-none relative -top-px`}>OBULA</span>
    </span>
  );

  if (asLink) {
    return (
      <Link to="/" className={`inline-flex items-center hover:text-accent-start transition-colors ${className}`}>
        {content}
      </Link>
    );
  }
  return content;
}
