import type { HTMLAttributes, ReactNode } from "react";

type Props = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  variant?: "glass" | "surface";
};

export default function GlassCard({ children, className = "", variant = "surface", ...rest }: Props) {
  const base = variant === "glass" ? "glass-card" : "surface-card";
  return (
    <div className={`${base} ${className}`} {...rest}>
      {children}
    </div>
  );
}
