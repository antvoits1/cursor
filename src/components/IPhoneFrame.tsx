import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  status?: string;
}

export default function IPhoneFrame({ children, status }: Props) {
  return (
    <aside className="link-dock">
      <div className="link-dock-kicker">
        <strong>Phone Link</strong>
        {status ? <em>{status}</em> : null}
      </div>
      <div className="link-dock-body">{children}</div>
    </aside>
  );
}
