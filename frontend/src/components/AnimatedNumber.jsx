import { useEffect, useRef, useState } from 'react';

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function AnimatedNumber({
  value,
  format = (current) => Math.round(current).toLocaleString('fr-FR'),
  duration = 700,
  as: Component = 'span',
  className,
}) {
  const target = Number(value) || 0;
  const currentValueRef = useRef(0);
  const [displayedValue, setDisplayedValue] = useState(() => (prefersReducedMotion() ? target : 0));

  useEffect(() => {
    if (prefersReducedMotion()) {
      currentValueRef.current = target;
      setDisplayedValue(target);
      return undefined;
    }

    const startValue = currentValueRef.current;
    const difference = target - startValue;
    if (difference === 0) {
      setDisplayedValue(target);
      return undefined;
    }

    const startTime = performance.now();
    let animationFrame;

    function update(now) {
      const progress = Math.min(1, (now - startTime) / duration);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      const nextValue = startValue + difference * easedProgress;
      currentValueRef.current = nextValue;
      setDisplayedValue(nextValue);

      if (progress < 1) {
        animationFrame = window.requestAnimationFrame(update);
      } else {
        currentValueRef.current = target;
        setDisplayedValue(target);
      }
    }

    animationFrame = window.requestAnimationFrame(update);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [duration, target]);

  return <Component className={className}>{format(displayedValue)}</Component>;
}

export default AnimatedNumber;
