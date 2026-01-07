export const metadata = {
  title: 'Power',
};

export default function KioskLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bg-black min-h-screen overflow-hidden">{children}</div>
  );
}
