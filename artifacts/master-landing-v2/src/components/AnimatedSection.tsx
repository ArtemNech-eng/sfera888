import React, { useEffect, useRef, useState } from 'react';

interface AnimatedSectionProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  direction?: 'up' | 'left' | 'right' | 'fade';
}

const AnimatedSection: React.FC<AnimatedSectionProps> = ({
  children,
  className = '',
  delay = 0,
  direction = 'up',
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => setIsVisible(true), delay);
          observer.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [delay]);

  const directionStyles = {
    up: {
      initial: 'translateY(40px)',
      final: 'translateY(0)',
    },
    left: {
      initial: 'translateX(-40px)',
      final: 'translateX(0)',
    },
    right: {
      initial: 'translateX(40px)',
      final: 'translateX(0)',
    },
    fade: {
      initial: 'translateY(0)',
      final: 'translateY(0)',
    },
  };

  const style = {
    opacity: isVisible ? 1 : 0,
    transform: isVisible
      ? directionStyles[direction].final
      : directionStyles[direction].initial,
    transition: `opacity 0.7s ease, transform 0.7s ease`,
  };

  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  );
};

export default AnimatedSection;
