/** @file src/components/common/RadarIconButton.tsx — Icon-only control */
import React from 'react';
import { RadarButton, type RadarButtonProps } from './RadarButton';

export type RadarIconButtonProps = Omit<RadarButtonProps, 'variant' | 'children'> & {
  icon: React.ReactNode;
  accessibleLabel: string;
};

export const RadarIconButton: React.FC<RadarIconButtonProps> = ({ icon, accessibleLabel, size = 'md', ...rest }) => (
  <RadarButton variant="icon" size={size} accessibleLabel={accessibleLabel} {...rest}>
    {icon}
  </RadarButton>
);