import { cn } from "@/lib/utils";

interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: "sm" | "md" | "lg" | "xl";
  variant?: "primary" | "secondary" | "accent" | "white";
}

export function Spinner({ className, size = "md", variant = "primary", ...props }: SpinnerProps) {
  const sizeClasses = {
    sm: "h-4 w-4 border-2",
    md: "h-8 w-8 border-3",
    lg: "h-12 w-12 border-4",
    xl: "h-16 w-16 border-4",
  };

  const variantClasses = {
    primary: "border-t-[var(--primary)] border-r-[var(--primary)]/30 border-b-[var(--primary)]/30 border-l-[var(--primary)]/30",
    secondary: "border-t-[var(--secondary)] border-r-[var(--secondary)]/30 border-b-[var(--secondary)]/30 border-l-[var(--secondary)]/30",
    accent: "border-t-[var(--accent)] border-r-[var(--accent)]/30 border-b-[var(--accent)]/30 border-l-[var(--accent)]/30",
    white: "border-t-white border-r-white/30 border-b-white/30 border-l-white/30",
  };

  return (
    <div
      className={cn(
        "animate-spin rounded-full",
        sizeClasses[size],
        variantClasses[variant],
        className
      )}
      role="status"
      {...props}
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
}
