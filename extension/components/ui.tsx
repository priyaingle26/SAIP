/**
 * SAIP UI Primitives — light theme, token-driven.
 * All style values reference CSS variables from lib/theme/tokens.css.
 * No hardcoded hex colors or pixel values.
 */
import React from 'react';

// ─── Icons (normalised SVG family, 2px stroke, round caps/joins) ─────────────

export const MicIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" style={{ flexShrink: 0 }}>
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" x2="12" y1="19" y2="22" />
  </svg>
);

export const FileTextIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" style={{ flexShrink: 0 }}>
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    <path d="M10 9H8" /><path d="M16 13H8" /><path d="M16 17H8" />
  </svg>
);

export const HistoryIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" style={{ flexShrink: 0 }}>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" /><path d="M12 7v5l4 2" />
  </svg>
);

export const LogOutIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" style={{ flexShrink: 0 }}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" x2="9" y1="12" y2="12" />
  </svg>
);

export const AlertIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" style={{ flexShrink: 0 }}>
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <line x1="12" x2="12" y1="9" y2="13" /><line x1="12" x2="12.01" y1="17" y2="17" />
  </svg>
);

export const CheckIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" style={{ flexShrink: 0 }}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export const WandIcon = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" style={{ flexShrink: 0 }}>
    <path d="M15 4V2" /><path d="M15 16v-2" /><path d="M8 9h2" /><path d="M20 9h2" />
    <path d="M17.8 11.8 19 13" /><path d="M15 9h0" /><path d="M17.8 6.2 19 5" />
    <path d="m3 21 9-9" /><path d="M12.2 6.2 11 5" />
  </svg>
);

export const FillIcon = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" style={{ flexShrink: 0 }}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
);

export const ScanIcon = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" style={{ flexShrink: 0 }}>
    <path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" />
    <path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" />
    <line x1="7" x2="17" y1="12" y2="12" />
  </svg>
);

export const RefreshIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" style={{ flexShrink: 0 }}>
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
    <path d="M8 16H3v5" />
  </svg>
);

export const BugIcon = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" style={{ flexShrink: 0 }}>
    <path d="M8 2l1.88 1.88" /><path d="M14.12 3.88 16 2" />
    <path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1" />
    <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6z" />
    <path d="M12 20v-9" /><path d="M6.53 9C4.6 8.8 3 7.1 3 5" />
    <path d="M6 13H2" /><path d="M3 21c0-2.1 1.7-3.9 3.8-4" />
    <path d="M20.97 5c0 2.1-1.6 3.8-3.5 4" />
    <path d="M22 13h-4" /><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4" />
  </svg>
);

export const ClipboardIcon = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" style={{ flexShrink: 0 }}>
    <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
  </svg>
);

// ─── Spinner ─────────────────────────────────────────────────────────────────

export const Spinner = ({ size = 14, color = 'var(--color-primary)' }: { size?: number; color?: string }) => (
  <div
    aria-label="Loading"
    role="status"
    style={{
      width: size,
      height: size,
      borderRadius: '50%',
      border: `2px solid ${color}22`,
      borderTopColor: color,
      animation: 'saip-spin 0.7s linear infinite',
      flexShrink: 0,
    }}
  />
);

// ─── Button ──────────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'success';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  fullWidth?: boolean;
}

const BUTTON_BASE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--space-2)',
  border: 'none',
  borderRadius: 'var(--radius-md)',
  cursor: 'pointer',
  fontFamily: 'var(--font-body)',
  fontWeight: 600,
  letterSpacing: '0.01em',
  transition: 'background var(--motion-fast), opacity var(--motion-fast), box-shadow var(--motion-fast)',
  outline: 'none',
  textDecoration: 'none',
  userSelect: 'none',
  WebkitUserSelect: 'none',
};

const BUTTON_VARIANTS: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    background: 'var(--color-primary)',
    color: 'var(--color-primary-fg)',
    boxShadow: '0 2px 8px rgba(59,39,106,0.28)',
  },
  secondary: {
    background: 'var(--color-primary-subtle)',
    color: 'var(--color-primary)',
    border: '1px solid var(--color-primary-subtle-border)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--color-muted)',
    border: '1px solid var(--color-border)',
  },
  destructive: {
    background: 'var(--color-destructive)',
    color: 'var(--color-destructive-fg)',
    boxShadow: '0 2px 8px rgba(185,28,28,0.22)',
  },
  success: {
    background: 'var(--color-success)',
    color: 'var(--color-success-fg)',
    boxShadow: '0 2px 8px rgba(4,120,87,0.22)',
  },
};

const BUTTON_SIZES: Record<ButtonSize, React.CSSProperties> = {
  sm: { padding: '6px 12px', fontSize: 'var(--text-sm)', minHeight: 32, minWidth: 32 },
  md: { padding: '10px 16px', fontSize: 'var(--text-base)', minHeight: 40, minWidth: 40 },
  lg: { padding: '13px 20px', fontSize: 'var(--text-md)', minHeight: 48, minWidth: 48 },
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  iconLeft,
  iconRight,
  fullWidth = false,
  children,
  style,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <button
      {...props}
      disabled={isDisabled}
      style={{
        ...BUTTON_BASE,
        ...BUTTON_VARIANTS[variant],
        ...BUTTON_SIZES[size],
        ...(fullWidth ? { width: '100%' } : {}),
        ...(isDisabled ? { opacity: 0.5, cursor: 'not-allowed', boxShadow: 'none' } : {}),
        ...style,
      }}
    >
      {loading ? <Spinner size={14} color={variant === 'primary' || variant === 'destructive' || variant === 'success' ? '#fff' : 'var(--color-primary)'} /> : iconLeft}
      {children}
      {!loading && iconRight}
    </button>
  );
}

// ─── Chip ────────────────────────────────────────────────────────────────────

type ChipVariant = 'primary' | 'accent' | 'muted' | 'success' | 'warning' | 'destructive';

interface ChipProps {
  variant?: ChipVariant;
  children: React.ReactNode;
  style?: React.CSSProperties;
  title?: string;
}

const CHIP_VARIANTS: Record<ChipVariant, React.CSSProperties> = {
  primary: {
    background: 'var(--color-primary-subtle)',
    color: 'var(--color-primary)',
    border: '1px solid var(--color-primary-subtle-border)',
  },
  accent: {
    background: 'var(--color-accent-subtle)',
    color: 'var(--color-accent)',
    border: '1px solid var(--color-accent-subtle-border)',
  },
  muted: {
    background: 'var(--color-surface-2)',
    color: 'var(--color-muted)',
    border: '1px solid var(--color-border)',
  },
  success: {
    background: 'var(--color-success-bg)',
    color: 'var(--color-success)',
    border: '1px solid var(--color-success-border)',
  },
  warning: {
    background: 'var(--color-warning-bg)',
    color: 'var(--color-warning)',
    border: '1px solid var(--color-warning-border)',
  },
  destructive: {
    background: 'var(--color-destructive-bg)',
    color: 'var(--color-destructive)',
    border: '1px solid var(--color-destructive-border)',
  },
};

export function Chip({ variant = 'primary', children, style, title }: ChipProps) {
  return (
    <span
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-1)',
        padding: '2px 10px',
        borderRadius: 'var(--radius-full)',
        fontSize: 'var(--text-xs)',
        fontWeight: 600,
        letterSpacing: '0.03em',
        whiteSpace: 'nowrap',
        ...CHIP_VARIANTS[variant],
        ...style,
      }}
    >
      {children}
    </span>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────────

interface CardProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
  padding?: string | number;
}

export function Card({ children, style, padding = 'var(--space-3)' }: CardProps) {
  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        padding,
        boxShadow: 'var(--shadow-sm)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ─── Section label ────────────────────────────────────────────────────────────

export function Label({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <span
      style={{
        fontSize: 'var(--text-xs)',
        fontWeight: 700,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.07em',
        color: 'var(--color-muted)',
        ...style,
      }}
    >
      {children}
    </span>
  );
}

// ─── Field (label + control + helper) ────────────────────────────────────────

interface FieldProps {
  id: string;
  label: string;
  error?: string;
  helper?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function Field({ id, label, error, helper, children, style }: FieldProps) {
  return (
    <div role="group" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', ...style }}>
      <label
        htmlFor={id}
        style={{
          fontSize: 'var(--text-xs)',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: error ? 'var(--color-destructive)' : 'var(--color-muted)',
        }}
      >
        {label}
      </label>
      {children}
      {helper && !error && (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted-2)' }}>{helper}</span>
      )}
      {error && (
        <span role="alert" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-destructive)' }}>
          {error}
        </span>
      )}
    </div>
  );
}

// ─── Input / Textarea shared styles ──────────────────────────────────────────

export const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
  color: 'var(--color-foreground)',
  fontSize: 'var(--text-md)',
  fontFamily: 'var(--font-body)',
  outline: 'none',
  transition: 'border-color var(--motion-fast), box-shadow var(--motion-fast)',
};

// ─── Tabs ────────────────────────────────────────────────────────────────────

interface TabItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

interface TabBarProps {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
}

export function TabBar({ tabs, active, onChange }: TabBarProps) {
  return (
    <nav
      role="tablist"
      aria-label="Main navigation"
      style={{
        display: 'flex',
        borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-surface)',
        padding: '0 var(--space-3)',
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            id={`saip-tab-${tab.id}`}
            role="tab"
            aria-selected={isActive}
            aria-controls={`saip-panel-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.id)}
            style={{
              flex: 1,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 'var(--space-1)',
              padding: '10px var(--space-2)',
              border: 'none',
              borderBottom: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
              marginBottom: '-1px',
              background: 'transparent',
              color: isActive ? 'var(--color-primary)' : 'var(--color-muted)',
              fontSize: 'var(--text-sm)',
              fontWeight: isActive ? 600 : 500,
              cursor: 'pointer',
              transition: 'color var(--motion-fast), border-color var(--motion-fast)',
              outline: 'none',
              whiteSpace: 'nowrap',
              minHeight: 44,
            }}
            onFocus={(e) => {
              (e.target as HTMLElement).style.outline = '2px solid var(--color-ring)';
              (e.target as HTMLElement).style.outlineOffset = '-2px';
            }}
            onBlur={(e) => {
              (e.target as HTMLElement).style.outline = 'none';
            }}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

// ─── StatusDots ──────────────────────────────────────────────────────────────

interface StatusStep {
  label: string;
  active: boolean;
}

interface StatusDotsProps {
  steps: StatusStep[];
}

export function StatusDots({ steps }: StatusDotsProps) {
  return (
    <div
      role="status"
      aria-label="Progress"
      style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' as const }}
    >
      {steps.map((step, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              flexShrink: 0,
              background: step.active ? 'var(--color-accent)' : 'var(--color-border)',
              transition: 'background var(--motion-slow)',
            }}
            aria-hidden="true"
          />
          <span
            style={{
              fontSize: 'var(--text-xs)',
              color: step.active ? 'var(--color-accent)' : 'var(--color-muted-2)',
              fontWeight: step.active ? 600 : 400,
              transition: 'color var(--motion-slow)',
            }}
          >
            {step.label}
          </span>
          {i < steps.length - 1 && (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-border)', marginLeft: 2 }}>›</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── RecordButton ────────────────────────────────────────────────────────────

interface RecordButtonProps {
  isRecording: boolean;
  onStart: () => void;
  onStop: () => void;
  disabled?: boolean;
}

export function RecordButton({ isRecording, onStart, onStop, disabled }: RecordButtonProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--space-5)',
        padding: 'var(--space-4) 0',
      }}
    >
      {/* Animated ring */}
      <div
        style={{
          width: 120,
          height: 120,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: isRecording
            ? 'var(--color-destructive-bg)'
            : 'var(--color-primary-subtle)',
          border: `2px solid ${isRecording ? 'var(--color-destructive)' : 'var(--color-primary-subtle-border)'}`,
          animation: isRecording ? 'saip-pulse-ring-rec 1.6s ease-in-out infinite' : 'none',
          transition: 'background var(--motion-slow), border-color var(--motion-slow)',
        }}
      >
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: '50%',
            background: 'var(--color-surface)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'var(--shadow-md)',
            color: isRecording ? 'var(--color-destructive)' : 'var(--color-primary)',
          }}
        >
          <MicIcon size={32} />
        </div>
      </div>

      {/* Action button */}
      {!isRecording ? (
        <Button
          variant="primary"
          size="lg"
          disabled={disabled}
          onClick={onStart}
          iconLeft={<MicIcon size={16} />}
          id="saip-start-btn"
          style={{ minWidth: 180 }}
        >
          Start Recording
        </Button>
      ) : (
        <Button
          variant="destructive"
          size="lg"
          onClick={onStop}
          id="saip-stop-btn"
          style={{ minWidth: 180 }}
        >
          Stop &amp; Process
        </Button>
      )}
    </div>
  );
}

// ─── Banner (success / error / info) ─────────────────────────────────────────

type BannerVariant = 'success' | 'error' | 'warning' | 'info';

interface BannerProps {
  variant: BannerVariant;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

const BANNER_VARS: Record<BannerVariant, { bg: string; border: string; color: string }> = {
  success: { bg: 'var(--color-success-bg)', border: 'var(--color-success-border)', color: 'var(--color-success)' },
  error:   { bg: 'var(--color-destructive-bg)', border: 'var(--color-destructive-border)', color: 'var(--color-destructive)' },
  warning: { bg: 'var(--color-warning-bg)', border: 'var(--color-warning-border)', color: 'var(--color-warning)' },
  info:    { bg: 'var(--color-primary-subtle)', border: 'var(--color-primary-subtle-border)', color: 'var(--color-primary)' },
};

export function Banner({ variant, children, style }: BannerProps) {
  const v = BANNER_VARS[variant];
  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--space-2)',
        padding: 'var(--space-2) var(--space-3)',
        borderRadius: 'var(--radius-sm)',
        background: v.bg,
        border: `1px solid ${v.border}`,
        color: v.color,
        fontSize: 'var(--text-sm)',
        lineHeight: 'var(--leading-normal)',
        animation: 'saip-fade-in var(--motion-fast)',
        ...style,
      }}
    >
      <div style={{ flexShrink: 0, marginTop: 1 }}>
        {variant === 'success' ? <CheckIcon size={13} /> : <AlertIcon size={13} />}
      </div>
      <span>{children}</span>
    </div>
  );
}

// ─── Divider ─────────────────────────────────────────────────────────────────

export function Divider({ style }: { style?: React.CSSProperties }) {
  return (
    <hr
      style={{
        border: 'none',
        borderTop: '1px solid var(--color-border-2)',
        margin: 0,
        ...style,
      }}
    />
  );
}
