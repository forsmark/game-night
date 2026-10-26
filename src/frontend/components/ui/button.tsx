import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-[var(--wobble-sm)] text-sm font-semibold whitespace-nowrap transition-[transform,box-shadow,background-color] outline-none cursor-pointer active:translate-y-[2px] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "border-2 border-ink bg-primary text-primary-foreground shadow-[0_3px_0_var(--ink)] hover:bg-primary/90 active:shadow-[0_1px_0_var(--ink)]",
        destructive:
          "border-2 border-ink bg-destructive text-white shadow-[0_3px_0_var(--ink)] hover:bg-destructive/90 active:shadow-[0_1px_0_var(--ink)] focus-visible:ring-destructive/20",
        outline:
          "border-2 border-ink bg-card shadow-[0_3px_0_var(--ink)] hover:bg-accent hover:text-accent-foreground active:shadow-[0_1px_0_var(--ink)]",
        secondary:
          "border-2 border-ink bg-secondary text-secondary-foreground shadow-[0_3px_0_var(--ink)] hover:bg-secondary/80 active:shadow-[0_1px_0_var(--ink)]",
        ghost:
          "hover:bg-accent hover:text-accent-foreground active:translate-y-0",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
