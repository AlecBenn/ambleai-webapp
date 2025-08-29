import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge conditional class names with Tailwind-aware deduping
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
