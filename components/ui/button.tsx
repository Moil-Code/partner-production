import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cn } from "@/lib/utils"
import { Spinner } from "@/components/ui/spinner"

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean
  variant?: "primary" | "secondary" | "outline" | "ghost" | "glass" | "danger" | "link"
  size?: "sm" | "md" | "lg" | "icon"
  loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", asChild = false, loading = false, disabled, children, ...props }, ref) => {
    // If we're using Radix Slot (for polymorphism), we can't easily inject the Spinner logic inside without composition issues.
    // For simplicity in this project (assuming standard buttons mostly), we'll handle loading state here.
    const Comp = asChild ? Slot : "button"

    const baseStyles = "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium ring-offset-[var(--light)] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]"
    
    const variants = {
      primary: "bg-[var(--primary)] text-white hover:bg-[var(--primary)]/90 shadow-md hover:shadow-lg",
      secondary: "bg-[var(--secondary)] text-white hover:bg-[var(--secondary)]/90 shadow-md hover:shadow-lg",
      outline: "border border-[var(--glass-border)] bg-transparent hover:bg-[var(--surface-subtle)] text-[var(--text-primary)]",
      ghost: "hover:bg-[var(--surface-subtle)] text-[var(--text-primary)]",
      glass: "bg-[var(--glass)] backdrop-blur-md border border-[var(--glass-border)] text-[var(--text-primary)] hover:bg-[var(--glass-hover)] shadow-sm",
      danger: "bg-red-500 text-white hover:bg-red-600 shadow-md",
      link: "text-[var(--primary)] underline-offset-4 hover:underline",
    }

    const sizes = {
      sm: "h-8 px-3 text-xs",
      md: "h-10 px-4 py-2",
      lg: "h-12 px-8 text-base",
      icon: "h-10 w-10",
    }

    return (
      <Comp
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <Spinner 
            size="sm" 
            className="mr-2" 
            variant={variant === "outline" || variant === "ghost" || variant === "glass" ? "primary" : "white"} 
          />
        )}
        {children}
      </Comp>
    )
  }
)
Button.displayName = "Button"

export { Button }
