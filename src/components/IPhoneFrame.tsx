import type { ReactNode } from 'react';

export default function IPhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="iphone-shell">
      <div className="iphone-bezel">
        <div className="iphone-status-bar" aria-hidden="true">
          <span className="iphone-time">9:41</span>
          <span className="iphone-island"/>
          <span className="iphone-status-end">
            <span className="iphone-signal"/>
            <span className="iphone-wifi"/>
            <span className="iphone-battery"/>
          </span>
        </div>
        <div className="iphone-screen">{children}</div>
        <div className="iphone-home-bar" aria-hidden="true"/>
      </div>
    </div>
  );
}
