import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { cloneElement } from 'react';
import { useScrollNav } from '../hooks/useScrollNav.js';

function NavDropdown({ label, children }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);
  const leaveTimerRef = useRef(null);

  const clearLeaveTimer = () => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  };

  const handleMouseLeave = () => {
    clearLeaveTimer();
    leaveTimerRef.current = setTimeout(() => setOpen(false), 150);
  };

  const handleMouseEnter = () => {
    clearLeaveTimer();
    setOpen(true);
  };

  useEffect(() => {
    if (!open || !triggerRef.current) return;

    const updatePosition = () => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setPosition({ top: rect.bottom + 4, left: rect.left });
      }
    };

    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open]);

  useEffect(() => {
    return () => clearLeaveTimer();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target) &&
          !e.target.closest('[data-dropdown-menu]')) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('click', handleClickOutside);
    }
    return () => document.removeEventListener('click', handleClickOutside);
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="flex items-center gap-1 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white text-sm font-medium transition"
      >
        {label}
        <svg
          className={`w-4 h-4 text-zinc-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open &&
        createPortal(
          <div
            data-dropdown-menu
            className="fixed py-2 w-48 bg-white dark:bg-[#141414] border border-zinc-200 dark:border-white/10 rounded-xl shadow-2xl z-[9999] animate-dropdown-in"
            style={{ top: position.top, left: position.left }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            {Array.isArray(children)
              ? children.map((child) =>
                  cloneElement(child, {
                    ...child.props,
                    onClick: (e) => {
                      setOpen(false);
                      child.props.onClick?.(e);
                    },
                  })
                )
              : cloneElement(children, {
                  ...children.props,
                  onClick: (e) => {
                    setOpen(false);
                    children.props.onClick?.(e);
                  },
                })}
          </div>,
          document.body
        )}
    </div>
  );
}

function DropdownLink({ to, children }) {
  return (
    <Link
      to={to}
      className="block px-4 py-2.5 text-zinc-600 dark:text-zinc-300 hover:bg-primary/10 hover:text-primary text-sm transition-colors"
    >
      {children}
    </Link>
  );
}

const HAS_GOOGLE = !!import.meta.env.VITE_GOOGLE_CLIENT_ID;

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { isAuthenticated, user, loginAsDev, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { visible, isScrollingUp } = useScrollNav();

  const scrollToCreate = (e) => {
    if (location.pathname === '/') {
      e?.preventDefault();
      document.getElementById('create')?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleGetStarted = () => {
    if (HAS_GOOGLE) navigate('/signin');
    else { loginAsDev(); navigate('/upload'); }
  };

  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <header 
      className={`fixed top-0 left-0 right-0 z-50 pt-3 px-3 sm:px-4 md:px-5 transition-all will-change-transform ${
        visible 
          ? 'translate-y-0 opacity-100' 
          : '-translate-y-[calc(100%+20px)] opacity-0 pointer-events-none'
      } ${
        isScrollingUp 
          ? 'duration-300 ease-out' 
          : 'duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]'
      }`}
    >
      <div className={`
        rounded-2xl px-4 py-3.5 sm:px-5 md:px-6 flex items-center justify-between gap-3 sm:gap-4
        transition-all duration-500
        ${visible 
          ? 'bg-[#141414]/80 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/20' 
          : 'bg-[#141414]/60 backdrop-blur-md border border-white/5'
        }
        ${isScrollingUp && visible ? 'shadow-[0_8px_32px_-8px_rgba(201,169,98,0.15)]' : ''}
      `}>
        <Link to="/" className="font-bold text-2xl text-zinc-900 dark:text-white hover:text-primary transition-colors shrink-0 font-display">
          OBULA
        </Link>

        <nav className="hidden md:flex items-center gap-5 lg:gap-7 shrink-0">
          <NavDropdown label="Tools">
            <DropdownLink to="/upload">Video Maker</DropdownLink>
            <DropdownLink to="/upload">Video Editor</DropdownLink>
            <DropdownLink to="/upload">Auto Captions</DropdownLink>
            <DropdownLink to="/upload">Resize Video</DropdownLink>
          </NavDropdown>
          <NavDropdown label="AI">
            <DropdownLink to="/upload">B-Roll Generator</DropdownLink>
            <DropdownLink to="/upload">AI Video Generator</DropdownLink>
            <DropdownLink to="/upload">Smart Expand</DropdownLink>
          </NavDropdown>
          <NavDropdown label="Solutions">
            <DropdownLink to="/upload">For Marketers</DropdownLink>
            <DropdownLink to="/upload">For Creators</DropdownLink>
            <DropdownLink to="/upload">For Educators</DropdownLink>
          </NavDropdown>
          <Link to="/" className="text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white text-base font-medium transition">Learn</Link>
          <Link
            to="/#pricing"
            onClick={(e) => {
              if (location.pathname === '/') {
                e.preventDefault();
                document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
              }
            }}
            className="text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white text-base font-medium transition"
          >
            Pricing
          </Link>
        </nav>

        <p className="hidden xl:block text-zinc-500 dark:text-zinc-400 text-sm text-center max-w-[220px] mx-1 truncate flex-shrink-0" title="AI-powered videos from a single prompt.">
          AI-powered videos from a single prompt.
        </p>

        {/* Mobile menu button */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden p-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-lg hover:bg-zinc-100 dark:hover:bg-white/10 transition"
          aria-label="Toggle menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {mobileMenuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>

        {/* Desktop CTAs */}
        <div className="hidden md:flex items-center gap-3">
          {isAuthenticated ? (
            <>
              <span className="text-zinc-500 dark:text-zinc-400 text-sm truncate max-w-[160px]" title={user?.email}>
                {user?.name || user?.email || 'User'}
              </span>
              <Link to="/upload" onClick={scrollToCreate} className="px-5 py-2.5 bg-primary text-white font-semibold rounded-lg hover:bg-primary-dark transition-colors text-sm">
                Create video
              </Link>
              <button type="button" onClick={() => logout()} className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white text-base font-medium">
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link to="/signin" className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white text-base font-medium">
                Sign in
              </Link>
              <button onClick={handleGetStarted} className="px-5 py-2.5 bg-primary text-white font-semibold rounded-lg hover:bg-primary-dark transition-colors text-sm" type="button">
                {HAS_GOOGLE ? 'Get started' : 'Enter'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden mt-2 rounded-2xl py-4 px-5 animate-slide-down bg-[#141414]/95 backdrop-blur-xl border border-white/10 max-w-[min(1280px,96vw)] mx-auto">
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-zinc-500 text-xs uppercase tracking-wider mb-2">Tools</p>
              <div className="pl-4 space-y-1">
                <Link to="/upload" className="block py-2 text-zinc-600 dark:text-zinc-300 hover:text-primary text-sm" onClick={closeMobileMenu}>Video Maker</Link>
                <Link to="/upload" className="block py-2 text-zinc-600 dark:text-zinc-300 hover:text-primary text-sm" onClick={closeMobileMenu}>Auto Captions</Link>
              </div>
            </div>
            <div>
              <p className="text-zinc-500 text-xs uppercase tracking-wider mb-2">AI</p>
              <div className="pl-4 space-y-1">
                <Link to="/upload" className="block py-2 text-zinc-600 dark:text-zinc-300 hover:text-primary text-sm" onClick={closeMobileMenu}>AI Video Generator</Link>
              </div>
            </div>
            <Link
                to="/#pricing"
                onClick={(e) => {
                  closeMobileMenu();
                  if (location.pathname === '/') {
                    e.preventDefault();
                    document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
                  }
                }}
                className="text-zinc-600 dark:text-zinc-300 py-2 text-sm"
              >
                Pricing
              </Link>
            {isAuthenticated ? (
              <>
                <div className="py-2 px-4 rounded-lg bg-white/5 border border-white/10">
                  <p className="text-white font-medium text-sm truncate">{user?.name || 'User'}</p>
                  <p className="text-white/50 text-xs truncate">{user?.email}</p>
                </div>
                <Link to="/upload" className="py-3 bg-primary text-white font-semibold text-center rounded-lg text-sm" onClick={closeMobileMenu}>Create clip</Link>
                <button type="button" onClick={() => { logout(); closeMobileMenu(); }} className="text-zinc-600 dark:text-zinc-400 py-2 text-sm text-left">Sign out</button>
              </>
            ) : (
              <button onClick={() => { handleGetStarted(); closeMobileMenu(); }} className="py-3 bg-primary text-white font-semibold text-center rounded-lg text-sm">
                Get started
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
