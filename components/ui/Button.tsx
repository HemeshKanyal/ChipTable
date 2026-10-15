import { forwardRef } from "react";

type Variant = "gold" | "felt" | "ghost";
type Size = "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  gold:
    "bg-linear-to-b from-gold-300 via-gold-500 to-gold-600 text-felt-950 shadow-[inset_0_1px_0_rgb(255_255_255/0.6),0_6px_16px_-6px_rgb(0_0_0/0.8)] hover:brightness-105 active:brightness-95",
  felt:
    "bg-felt-700/80 text-ivory border gold-hairline shadow-[inset_0_1px_0_rgb(255_255_255/0.08)] hover:bg-felt-600/80",
  ghost: "text-ivory-muted hover:text-ivory hover:bg-white/5",
};

const SIZES: Record<Size, string> = {
  md: "h-10 px-4 text-sm rounded-xl gap-2",
  lg: "h-13 px-6 text-base rounded-2xl gap-3",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "gold", size = "md", className = "", type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex select-none items-center justify-center font-semibold transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    />
  );
});
