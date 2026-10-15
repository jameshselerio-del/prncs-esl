import type { ReactNode } from 'react';

/** Komorebi English brand copy (see the brand identity canvas). */
export const BRAND = {
  name: 'Komorebi English',
  wordmark: 'komorebi',
  sub: 'ENGLISH',
  nameJa: 'こもれび英会話',
  tagline: 'Gentle English, one-to-one.',
  taglineJa: 'やさしい、マンツーマン英会話',
  teacher: 'Princess Medida',
};

const LEAF = 'M18 102 C18 52 52 18 102 18 C102 68 68 102 18 102 Z';

/** The leaf mark. Colors follow the theme (Moss leaf in light mode, Sage in dark). */
export function LeafMark({ size = 40, className, label }: { size?: number; className?: string; label?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 120 120"
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      <path d={LEAF} style={{ fill: 'var(--logo-leaf, var(--accent))' }} />
      <path
        d="M26 94 C46 74 66 54 92 28"
        style={{ stroke: 'var(--logo-vein, var(--accent-soft))' }}
        strokeWidth="3.2"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="68" cy="40" r="5.5" style={{ fill: 'var(--logo-vein, var(--accent-soft))' }} />
      <circle cx="80" cy="58" r="3.6" style={{ fill: 'var(--logo-vein, var(--accent-soft))' }} opacity="0.85" />
      <circle cx="44" cy="62" r="2.6" style={{ fill: 'var(--logo-vein, var(--accent-soft))' }} opacity="0.7" />
    </svg>
  );
}

/** A plain leaf silhouette for background decoration. */
export function LeafShape({ className, color = 'var(--accent)' }: { className?: string; color?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 120" aria-hidden="true">
      <path d={LEAF} style={{ fill: color }} />
    </svg>
  );
}

/** Small horizontal logo for the top bar. */
export function Logo() {
  return (
    <span className="logo" aria-label={BRAND.name}>
      <LeafMark size={36} />
      <span className="logo-word" aria-hidden="true">
        <span className="logo-name">{BRAND.wordmark}</span>
        <span className="logo-sub">{BRAND.sub}</span>
      </span>
    </span>
  );
}

/** Full-page welcome layout used by the sign-in screens: lockup, tagline, then the sign-in controls. */
export function SignInLayout({ children }: { children: ReactNode }) {
  return (
    <main className="signin">
      <LeafShape className="signin-leaf top" />
      <LeafShape className="signin-leaf bottom" color="var(--bark)" />
      <div className="brand-lockup">
        <LeafMark className="mark" size={120} label="Komorebi English leaf mark" />
        <div className="word">
          <h1 className="name">
            {BRAND.wordmark}
            <span className="visually-hidden"> English</span>
          </h1>
          <div className="sub">
            <span className="en" aria-hidden="true">
              {BRAND.sub}
            </span>
            <span className="ja" lang="ja">
              {BRAND.nameJa}
            </span>
          </div>
        </div>
      </div>
      <hr className="divider" />
      <div className="tagline">
        <p className="lead">{BRAND.tagline}</p>
        <p className="sub">
          Private lessons with {BRAND.teacher} ·{' '}
          <span className="ja" lang="ja">
            {BRAND.taglineJa}
          </span>
        </p>
      </div>
      <div className="signin-card">{children}</div>
    </main>
  );
}

/** "English label · 日本語" for primary actions, as in the brand's buttons. */
export function Bilingual({ en, ja }: { en: string; ja: string }) {
  return (
    <span className="bilingual">
      {en} ·{' '}
      <span className="ja" lang="ja">
        {ja}
      </span>
    </span>
  );
}
