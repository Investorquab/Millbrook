import { Link } from "react-router-dom";
import type { CSSProperties, ReactNode } from "react";
import { color, font, primaryButtonShadow, radius } from "../theme/tokens";

interface ButtonProps {
  to?: string;
  onClick?: () => void;
  children: ReactNode;
  variant?: "primary" | "secondary";
  trailing?: ReactNode;
  style?: CSSProperties;
  ariaLabel?: string;
}

const base: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  textDecoration: "none",
  border: "none",
  fontFamily: font.body,
  width: "100%",
};

const primary: CSSProperties = {
  ...base,
  padding: "16px 20px",
  background: color.wheat,
  color: color.millstone,
  borderRadius: radius.md,
  fontWeight: 700,
  fontSize: 19,
  boxShadow: primaryButtonShadow,
};

const secondary: CSSProperties = {
  ...base,
  padding: "13px 20px",
  background: "rgba(47,54,64,0.92)",
  color: color.linen,
  border: "1px solid rgba(217,164,65,0.55)",
  borderRadius: radius.md - 2,
  fontWeight: 600,
  fontSize: 17,
};

/** A primary (wheat) or secondary (signboard) button, as a link or action. */
export function Button({ to, onClick, children, variant = "secondary", trailing, style, ariaLabel }: ButtonProps) {
  const css = { ...(variant === "primary" ? primary : secondary), ...style };
  const inner = (
    <>
      <span>{children}</span>
      {trailing}
    </>
  );
  if (to) {
    return (
      <Link to={to} style={css} aria-label={ariaLabel}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} style={css} aria-label={ariaLabel}>
      {inner}
    </button>
  );
}

export function PlayArrow() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M6 4l9 6-9 6z" fill={color.millstone} />
    </svg>
  );
}
