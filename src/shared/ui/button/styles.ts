export const buttonVariants = {
  ghost: 'border-0 bg-transparent text-ink enabled:hover:bg-hover',
  inverse: 'border-0 bg-transparent text-paper enabled:hover:bg-muted',
  primary: 'border-0 bg-accent text-accent-foreground enabled:hover:bg-accent-hover',
  outline: 'border border-line bg-transparent text-ink enabled:hover:bg-hover',
  text: 'border-0 bg-transparent text-accent enabled:hover:bg-soft',
  soft: 'border-0 bg-soft text-ink enabled:hover:bg-hover',
} as const

export const buttonSizes = {
  sm: 'min-h-8 px-2 py-1.5 text-xs',
  md: 'min-h-9 px-3 py-2 text-sm',
  icon: 'size-8 shrink-0 p-2 text-xs',
} as const

export type ButtonVariant = keyof typeof buttonVariants
export type ButtonSize = keyof typeof buttonSizes

export function buttonClasses(variant: ButtonVariant = 'ghost', size: ButtonSize = 'sm') {
  return [
    'inline-flex cursor-pointer items-center justify-center gap-2 rounded-control border-solid font-system leading-normal no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:shrink-0',
    buttonVariants[variant],
    buttonSizes[size],
  ].join(' ')
}
