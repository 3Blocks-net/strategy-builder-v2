import logoLight from '@/assets/brand/pecunity-logo-light.svg';
import logoDark from '@/assets/brand/pecunity-logo-dark.svg';
import logoMonoLight from '@/assets/brand/pecunity-logo-mono-light.svg';
import logoMonoDark from '@/assets/brand/pecunity-logo-mono-dark.svg';
import { cn } from '@/lib/utils';

/**
 * The brand kit ships one logo file per background/ink pairing and forbids
 * recoloring, so choosing the file *is* the styling. "light"/"dark" names the
 * background the file was made for, never the ink on it.
 */
type LogoBackground = 'light' | 'dark';

/**
 * `color` is the full-color lockup; `mono` is the single-color cut the brand
 * kit provides for surfaces where the color symbol would sit on a low-contrast
 * field — the Brand Blue band being exactly that case.
 */
type LogoTone = 'color' | 'mono';

const sources: Record<LogoTone, Record<LogoBackground, string>> = {
  color: { light: logoLight, dark: logoDark },
  mono: { light: logoMonoLight, dark: logoMonoDark },
};

/**
 * Native proportions of every wordmark file (`viewBox="0 0 900.19 196.4"`),
 * handed to the browser so a height alone yields the exact width: never a
 * stretched logo, and no layout shift while the file loads.
 */
const LOGO_ASPECT_RATIO = '900.19 / 196.4';

/**
 * The Pecunity logo, rendered from the brand kit file instead of set as text.
 *
 * Size it with a height class (`h-5`); the width follows from the file's own
 * proportions. Clear space belongs to the surrounding layout: the brand kit
 * asks for at least the height of the "P" — 0.627 × the rendered height — free
 * on every side. Each call site notes the arithmetic; the measurement behind
 * the number is in `src/assets/brand/README.md`.
 */
export function BrandLogo({
  background = 'light',
  tone = 'color',
  className,
}: {
  background?: LogoBackground;
  tone?: LogoTone;
  className?: string;
}) {
  return (
    <img
      src={sources[tone][background]}
      alt="Pecunity"
      style={{ aspectRatio: LOGO_ASPECT_RATIO }}
      className={cn('block w-auto', className)}
    />
  );
}
