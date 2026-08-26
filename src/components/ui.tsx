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
 */

export type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'accent';

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-panel-sunken text-ink-soft border-line',
  good: 'bg-good-soft text-good border-good/25',
  warn: 'bg-warn-soft text-warn border-warn/25',
  bad: 'bg-bad-soft text-bad border-bad/25',
  accent: 'bg-accent-soft text-accent-strong border-accent/25',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${TONE_CLASS[tone]}`}
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
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line px-7 py-5">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2.5 text-[17px] font-semibold text-ink">
          {step !== undefined && (
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent-strong">
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
  primary:
    'bg-accent text-ink-invert border-accent-strong hover:bg-accent-strong disabled:bg-line-strong disabled:border-line-strong disabled:text-panel',
  secondary:
    'bg-panel-raised text-ink border-line-strong hover:bg-panel-sunken disabled:text-ink-faint',
  ghost: 'bg-transparent text-ink-soft border-transparent hover:bg-panel-sunken disabled:text-ink-faint',
  danger: 'bg-panel-raised text-bad border-bad/35 hover:bg-bad-soft disabled:text-ink-faint',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  children,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'md' }) {
  const pad = size === 'sm' ? 'px-3 py-1.5 text-[13px]' : 'px-4 py-2 text-sm';
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-lg border font-semibold transition-colors disabled:cursor-not-allowed ${pad} ${BUTTON_CLASS[variant]} ${className}`}
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
      {help && <p className="field-help mt-1.5">{help}</p>}
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
    <select {...rest} className={`control appearance-none bg-[length:0] pr-9 ${className}`}>
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
    <label className={`flex items-start gap-3 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors ${
          checked ? 'border-accent-strong bg-accent' : 'border-line-strong bg-panel-sunken'
        } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span
          className={`ml-0.5 size-4 rounded-full bg-panel-raised shadow-sm transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0'
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
    <div className="flex flex-col items-center gap-3 px-8 py-14 text-center">
      {icon && <div className="text-ink-faint">{icon}</div>}
      <p className="text-[15px] font-semibold text-ink-soft">{title}</p>
      <p className="max-w-md text-sm text-ink-faint">{body}</p>
    </div>
  );
}

export function StatTile({ label, value, tone = 'neutral' }: { label: string; value: ReactNode; tone?: Tone }) {
  const colour =
    tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : 'text-ink';
  return (
    <div className="rounded-xl border border-line bg-panel-raised px-4 py-3">
      <div className="text-xs font-semibold tracking-wide text-ink-faint uppercase">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${colour}`}>{value}</div>
    </div>
  );
}

export function ProgressBar({ value, total, tone = 'accent' }: { value: number; total: number; tone?: Tone }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  const fill = tone === 'good' ? 'bg-good' : tone === 'bad' ? 'bg-bad' : 'bg-accent';
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-panel-sunken"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={total}
    >
      <div className={`h-full rounded-full transition-[width] duration-300 ${fill}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Spinner({ className = 'size-4' }: { className?: string }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      aria-hidden="true"
    />
  );
}
