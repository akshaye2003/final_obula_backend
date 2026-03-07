import { m } from 'framer-motion';

/**
 * Melboucierayane-style: Split headline into words, each animates with blur-to-focus.
 */
export default function SplitTextHero({ lines, gradientLineIndex = 1, inView = true, className = '' }) {
  const spring = { type: 'spring', stiffness: 280, damping: 24 };

  return (
    <div className={`w-full text-center ${className}`}>
      {lines.map((line, lineIdx) => {
        const words = line.split(/\s+/);
        const isGradient = lineIdx === gradientLineIndex;

        return (
          <div key={lineIdx} className="leading-[1.25]" style={{ overflow: 'visible' }}>
            <span className="inline-flex flex-wrap justify-center gap-x-[0.2em] gap-y-0.5">
              {words.map((word, wordIdx) => (
                <m.span
                  key={`${lineIdx}-${wordIdx}`}
                  initial={{ opacity: 0, y: 24 }}
                  animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
                  transition={{ ...spring, delay: 0.08 + lineIdx * 0.12 + wordIdx * 0.04 }}
                  className="inline-block"
                >
                  {isGradient ? (
                    <span
                      className="hero-accent-text"
                      style={{ textShadow: '0 0 30px rgba(255,215,0,0.6), 0 0 60px rgba(255,167,0,0.3), 0 1px 0 rgba(255,255,255,0.5), 0 2px 4px rgba(0,0,0,0.2)' }}
                    >
                      {word}
                    </span>
                  ) : (
                    <span className="text-white">{word}</span>
                  )}
                  {wordIdx < words.length - 1 ? '\u00A0' : null}
                </m.span>
              ))}
            </span>
            {lineIdx < lines.length - 1 && <br />}
          </div>
        );
      })}
    </div>
  );
}
