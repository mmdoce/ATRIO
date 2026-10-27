import { useState } from "react";
import type { CSSProperties } from "react";

type Props = { size?: number; showName?: boolean; className?: string };

export function LogoAtrio({ size = 76, showName = true, className = "" }: Props) {
  const [failed, setFailed] = useState(false);
  return <span className={`atrio-logo ${className}`} style={{ "--logo-size": `${size}px` } as CSSProperties}>
    {failed ? <span className="atrio-logo-fallback" aria-hidden="true">A</span> : <img src="/logo.png" alt="" onError={() => setFailed(true)} />}
    {showName && <span className="atrio-logo-name">Átrio</span>}
  </span>;
}
