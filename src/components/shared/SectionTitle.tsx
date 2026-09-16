import { Icon, type IconName } from '../Icon';

interface SectionTitleProps {
  icon?: IconName;
  accent?: 'blue' | 'green' | 'amber';
  children: string;
}

export function SectionTitle({ icon, accent, children }: SectionTitleProps) {
  return (
    <div className={`section-title${accent ? ` accent-${accent}` : ''}`}>
      {icon && <Icon name={icon} size={12} />}
      {children}
    </div>
  );
}
