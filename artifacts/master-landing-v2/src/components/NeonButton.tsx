import React from 'react';

interface NeonButtonProps {
  children: React.ReactNode;
  href?: string;
  variant?: 'primary' | 'ghost' | 'secondary';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  onClick?: () => void;
}

const NeonButton: React.FC<NeonButtonProps> = ({
  children,
  href = 'https://t.me/ChestnyMasterBot',
  variant = 'primary',
  size = 'md',
  className = '',
  onClick,
}) => {
  const sizeClasses = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-3 text-base',
    lg: 'px-8 py-4 text-lg',
    xl: 'px-10 py-5 text-xl',
  };

  const variantClasses = {
    primary: `
      bg-[#34F5A3] text-[#0B0F14] font-bold rounded-xl
      transition-all duration-300 ease-out
      hover:bg-[#28e892] hover:scale-105
      shadow-[0_0_20px_rgba(52,245,163,0.4),0_0_40px_rgba(52,245,163,0.15)]
      hover:shadow-[0_0_30px_rgba(52,245,163,0.7),0_0_60px_rgba(52,245,163,0.3)]
      active:scale-95
    `,
    ghost: `
      border border-[#34F5A3]/50 text-[#34F5A3] font-semibold rounded-xl
      transition-all duration-300 ease-out
      hover:bg-[#34F5A3]/10 hover:border-[#34F5A3] hover:scale-105
      active:scale-95
    `,
    secondary: `
      bg-[#111827] border border-[#38BDF8]/40 text-[#38BDF8] font-semibold rounded-xl
      transition-all duration-300 ease-out
      hover:bg-[#38BDF8]/10 hover:border-[#38BDF8] hover:scale-105
      shadow-[0_0_15px_rgba(56,189,248,0.2)]
      hover:shadow-[0_0_25px_rgba(56,189,248,0.4)]
      active:scale-95
    `,
  };

  const classes = `
    inline-flex items-center justify-center gap-2 cursor-pointer
    ${sizeClasses[size]}
    ${variantClasses[variant]}
    ${className}
  `;

  if (onClick) {
    return (
      <button className={classes} onClick={onClick}>
        {children}
      </button>
    );
  }

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={classes}>
      {children}
    </a>
  );
};

export default NeonButton;
