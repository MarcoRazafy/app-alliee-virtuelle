import { useEffect, useMemo, useRef, useState } from 'react';
import Lottie from 'lottie-react';
import useThemeStore from '../store/themeStore';

// Convertit une couleur CSS ("rgb(184, 196, 217)" ou "#256bff") en [r,g,b] normalisé 0..1
// (format attendu par les couleurs Lottie).
function cssColorToRgb01(str) {
  if (!str) return null;
  const m = str.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const parts = m[1].split(',').map((v) => parseFloat(v));
    return [parts[0] / 255, parts[1] / 255, parts[2] / 255];
  }
  const hex = str.trim().replace('#', '');
  if (hex.length === 3) {
    return [0, 1, 2].map((i) => parseInt(hex[i] + hex[i], 16) / 255);
  }
  if (hex.length >= 6) {
    return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  }
  return null;
}

// Clone l'animation et force toutes les couleurs de remplissage (fl) et de contour (st)
// vers `rgb`. Rend l'icône monochrome et theme-aware, comme un SVG en currentColor.
function colorize(data, rgb) {
  const clone = structuredClone(data);
  const applyTo = (c) => {
    if (!c) return;
    if (c.a === 0 && Array.isArray(c.k)) {
      c.k = [rgb[0], rgb[1], rgb[2], c.k[3] ?? 1];
    } else if (Array.isArray(c.k)) {
      // couleur animée par keyframes
      c.k.forEach((kf) => {
        if (kf && Array.isArray(kf.s)) kf.s = [rgb[0], rgb[1], rgb[2], kf.s[3] ?? 1];
      });
    }
  };
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === 'object') {
      if ((node.ty === 'fl' || node.ty === 'st') && node.c) applyTo(node.c);
      Object.values(node).forEach(walk);
    }
  };
  walk(clone);
  return clone;
}

// Joue une animation Lottie servie depuis /public (ex. src="/icone/message.json").
// - `fallback` s'affiche tant que le JSON n'est pas prêt (aucun saut visuel).
// - `color` (optionnel) recolore l'animation :
//     • "currentColor" → suit la couleur héritée (donc le thème clair/sombre, comme un SVG)
//     • une couleur CSS ("#256bff") → force cette couleur
//     • absent → couleurs d'origine conservées (ex. le vert du badge succès)
// - Déclencheurs : "mount" (défaut, joue une fois), "hover" (au survol), ou `loop`.
export default function LottieIcon({
  src,
  className,
  style,
  loop = false,
  trigger = 'mount',
  color,
  fallback = null,
}) {
  const [data, setData] = useState(null);
  const [rgb, setRgb] = useState(null);
  const wrapperRef = useRef(null);
  const lottieRef = useRef(null);
  const theme = useThemeStore((state) => state.theme); // re-résout la couleur au changement de thème

  useEffect(() => {
    let cancelled = false;
    fetch(src)
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [src]);

  // Résout la couleur cible (explicite ou currentColor du wrapper), re-calculée au changement de thème.
  useEffect(() => {
    if (!color) {
      setRgb(null);
      return;
    }
    let resolved = color;
    if (color === 'currentColor') {
      if (!wrapperRef.current) return;
      resolved = getComputedStyle(wrapperRef.current).color;
    }
    setRgb(cssColorToRgb01(resolved));
  }, [color, theme, data]);

  const animationData = useMemo(() => {
    if (!data) return null;
    if (color && rgb) return colorize(data, rgb);
    return data;
  }, [data, color, rgb]);

  const hover = trigger === 'hover' && !loop;
  const ready = animationData && (!color || rgb);

  return (
    <span ref={wrapperRef} className={`lottie-icon${className ? ` ${className}` : ''}`} style={style}>
      {ready ? (
        <Lottie
          lottieRef={lottieRef}
          animationData={animationData}
          loop={loop}
          autoplay={!hover}
          style={{ width: '100%', height: '100%' }}
          onMouseEnter={hover ? () => lottieRef.current?.goToAndPlay(0) : undefined}
        />
      ) : (
        fallback
      )}
    </span>
  );
}
