import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  Ref,
  SelectHTMLAttributes,
} from 'react';

/**
 * The small set of primitives every screen is built from. Keeping them in one
 * place is what makes spacing, radii, and type scale identical across the app.
 *
 * All of them target the dark "Obsidian / Iris" system defined in index.css:
 * surfaces are separated by luminance *and* a hairline, depth comes from a cast
 * shadow plus a 1px top highlight, and the accent is the only saturated colour
 * on screen unless something is telling you about state.
 */

export type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'accent';

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-panel-sunken text-ink-soft border-line',
  good: 'bg-good-soft text-good border-good-border',
  warn: 'bg-warn-soft text-warn border-warn-border',
  bad: 'bg-bad-soft text-bad border-bad-border',
  accent: 'bg-accent-soft text-accent-strong border-accent-border',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-xs leading-4 font-semibold tabular-nums whitespace-nowrap ${TONE_CLASS[tone]}`}
    >
      {children}
    </span>
  );
}

export function Panel({
  children,
  className = '',
  as: Tag = 'section',
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'aside';
}) {
  return <Tag className={`panel ${className}`}>{children}</Tag>;
}

export function PanelHeader({
  title,
  step,
  description,
  actions,
}: {
  title: string;
  step?: number;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 border-b border-line px-7 py-5">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2.5 text-lg font-semibold text-ink">
          {step !== undefined && (
            <span className="grid size-6 shrink-0 place-items-center rounded-lg border border-accent-border bg-accent-soft font-mono text-[11px] leading-none font-semibold text-accent-strong">
              {step}
            </span>
          )}
          {title}
        </h2>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-ink-faint">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const BUTTON_CLASS: Record<ButtonVariant, string> = {
  /* The only filled control in the system: iris ground, near-black type, a 1px
   * top highlight and a tinted cast shadow so it sits above the panel. */
  primary: [
    'border-accent-muted bg-accent text-on-accent shadow-accent',
    'enabled:hover:border-accent enabled:hover:bg-accent-strong',
    'enabled:active:translate-y-px enabled:active:bg-accent-muted enabled:active:shadow-xs',
    'disabled:border-line disabled:bg-panel-raised disabled:text-ink-faint disabled:shadow-none',
  ].join(' '),
  secondary: [
    'border-line-strong bg-panel-raised text-ink shadow-raise',
    'enabled:hover:border-line-strong enabled:hover:bg-panel-overlay',
    'enabled:active:translate-y-px enabled:active:bg-panel-raised enabled:active:shadow-xs',
    'disabled:border-line disabled:bg-panel-sunken disabled:text-ink-faint disabled:shadow-none',
  ].join(' '),
  ghost: [
    'border-transparent bg-transparent text-ink-soft',
    'enabled:hover:border-line enabled:hover:bg-panel-raised enabled:hover:text-ink',
    'enabled:active:translate-y-px enabled:active:bg-panel-sunken',
    'disabled:text-ink-faint',
  ].join(' '),
  danger: [
    'border-bad-border bg-bad-soft text-bad',
    'enabled:hover:border-bad/55 enabled:hover:bg-bad/22',
    'enabled:active:translate-y-px enabled:active:bg-bad/28',
    'disabled:border-line disabled:bg-panel-sunken disabled:text-ink-faint',
  ].join(' '),
};

export function Button({
  variant = 'secondary',
  size = 'md',
  children,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'md' }) {
  const pad =
    size === 'sm'
      ? 'h-8 gap-1.5 rounded-lg px-3 text-[13px]'
      : 'h-9.5 gap-2 rounded-control px-4 text-sm';
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex items-center justify-center border font-semibold tracking-[-0.004em] whitespace-nowrap transition-[background-color,border-color,color,box-shadow,translate] duration-(--duration-fast) ease-smooth select-none disabled:cursor-not-allowed ${pad} ${BUTTON_CLASS[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  help,
  htmlFor,
  children,
}: {
  label: string;
  help?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="field-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {help && <p className="field-help mt-2">{help}</p>}
    </div>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  const { className = '', ...rest } = props;
  return <input {...rest} className={`control ${className}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = '', children, ...rest } = props;
  return (
    <select {...rest} className={`control control-select ${className}`}>
      {children}
    </select>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  help,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  help?: string;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-start gap-3 ${disabled ? 'opacity-55' : 'cursor-pointer'}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`mt-0.5 inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full border p-px transition-[background-color,border-color,box-shadow] duration-(--duration-base) ease-smooth ${
          checked
            ? 'border-accent-muted bg-accent shadow-[inset_0_1px_0_rgb(255_255_255/0.22)]'
            : 'border-line-strong bg-rail shadow-[inset_0_1px_2px_rgb(0_0_0/0.45)]'
        } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span
          className={`size-[18px] rounded-full shadow-sm transition-[translate,background-color] duration-(--duration-base) ease-smooth ${
            checked ? 'translate-x-4 bg-on-accent' : 'translate-x-0 bg-ink-soft'
          }`}
        />
      </button>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">{label}</span>
        {help && <span className="field-help mt-0.5 block">{help}</span>}
      </span>
    </label>
  );
}

export function EmptyState({
  title,
  body,
  icon,
}: {
  title: string;
  body: string;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-8 py-16 text-center">
      {icon && (
        <div className="mb-1 grid size-12 place-items-center rounded-2xl border border-line bg-panel-sunken text-ink-faint shadow-[inset_0_1px_0_rgb(255_255_255/0.03)]">
          {icon}
        </div>
      )}
      <p className="text-base font-semibold tracking-[-0.008em] text-ink">{title}</p>
      <p className="max-w-md text-sm text-ink-faint">{body}</p>
    </div>
  );
}

export function StatTile({ label, value, tone = 'neutral' }: { label: string; value: ReactNode; tone?: Tone }) {
  const colour =
    tone === 'good'
      ? 'text-good'
      : tone === 'bad'
        ? 'text-bad'
        : tone === 'warn'
          ? 'text-warn'
          : tone === 'accent'
            ? 'text-accent-strong'
            : 'text-ink';
  return (
    <div className="rounded-xl border border-line bg-panel-raised px-4 py-3.5 shadow-[inset_0_1px_0_rgb(255_255_255/0.035)]">
      <div className="text-2xs font-bold tracking-[0.1em] text-ink-faint uppercase">{label}</div>
      <div className={`mt-1.5 font-mono text-2xl leading-none font-semibold tabular-nums ${colour}`}>
        {value}
      </div>
    </div>
  );
}

export function ProgressBar({ value, total, tone = 'accent' }: { value: number; total: number; tone?: Tone }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  // Text colour is set alongside the fill so the glow underneath picks up the
  // same hue via currentColor.
  const fill =
    tone === 'good'
      ? 'bg-good text-good'
      : tone === 'bad'
        ? 'bg-bad text-bad'
        : tone === 'warn'
          ? 'bg-warn text-warn'
          : 'bg-accent text-accent';
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full border border-line bg-rail shadow-[inset_0_1px_2px_rgb(0_0_0/0.5)]"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={total}
    >
      <div
        className={`h-full rounded-full shadow-[0_0_12px_-2px_currentColor] transition-[width] duration-(--duration-slow) ease-smooth ${fill}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Spinner({ className = 'size-4' }: { className?: string }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-current/25 border-t-current ${className}`}
      aria-hidden="true"
    />
  );
}
