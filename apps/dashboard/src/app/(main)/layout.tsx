import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Power Dashboard',
  description: 'Monitor your smart plug power consumption',
};

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
