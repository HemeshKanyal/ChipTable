import { forwardRef } from "react";

export const inputClass =
  "h-12 w-full rounded-xl border gold-hairline bg-felt-950/60 px-4 text-base text-ivory placeholder:text-ivory-muted/50 outline-none transition focus:border-gold-400 focus:ring-2 focus:ring-gold-400/25";

export function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gold-300/80">
      {children}
    </label>
  );
}

export function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return <p className="mt-1.5 text-xs text-danger">{children}</p>;
}

export const TextInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function TextInput({ className = "", ...props }, ref) {
    return <input ref={ref} className={`${inputClass} ${className}`} {...props} />;
  },
);

interface ChoiceProps<T> {
  options: { value: T; label: React.ReactNode }[];
  value: T | null;
  onChange: (v: T) => void;
  label: string;
}

/** A row of pill buttons, used for presets. */
export function ChoicePills<T extends string | number>({ options, value, onChange, label }: ChoiceProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`h-9 rounded-full border px-3.5 text-sm font-semibold tabular-nums transition ${
              active
                ? "border-gold-400 bg-gold-400/15 text-gold-200"
                : "gold-hairline bg-felt-950/40 text-ivory-muted hover:text-ivory"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
