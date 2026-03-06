import React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showText?: boolean;
  partnerLogo?: string;
  partnerName?: string;
}

const MOIL_LOGO_URL = '/moil-196.png';

const Logo: React.FC<LogoProps> = ({ 
  size = 'md', 
  className,
  showText = true,
  partnerLogo,
  partnerName = 'Moil Partners'
}) => {
  const sizeClasses = {
    sm: {
      container: 'h-8',
      width: 100,
      height: 32,
    },
    md: {
      container: 'h-10',
      width: 125,
      height: 40,
    },
    lg: {
      container: 'h-14',
      width: 175,
      height: 56,
    }
  };

  const sizes = sizeClasses[size];
  const logoUrl = partnerLogo || MOIL_LOGO_URL;

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <Image
        src={logoUrl}
        alt={partnerName}
        width={sizes.width}
        height={sizes.height}
        className={cn(sizes.container, 'object-contain')}
        priority
      />
    </div>
  );
};

export default Logo;
