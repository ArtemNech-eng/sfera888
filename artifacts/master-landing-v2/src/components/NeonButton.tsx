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
  href = '/master-pwa/',
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
      bg-[#10B981] text-white font-semibold rounded-xl
      transition-all duration-200
      hover:bg-[#059669] hover:shadow-md
      active:scale-95 shadow-sm
    `,
    ghost: `
      border border-[#E2E8F0] text-[#0F172A] font-semibold rounded-xl
      transition-all duration-200
      hover:bg-[#F8FAFC] hover:border-[#CBD5E1]
      active:scale-95
    `,
    secondary: `
      border border-[#3B82F6]/40 text-[#3B82F6] font-semibold rounded-xl
      transition-all duration-200
      hover:bg-[#3B82F6]/5 hover:border-[#3B82F6]
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
    <a href={href} className={classes}>
      {children}
    </a>
  );
};

export default NeonButton;
