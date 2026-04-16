import "./globals.css";

export const metadata = { title: "JIRA Reporter Plugin" };

export default function RootLayout(
  { children }: { children: React.ReactNode }
) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans
                        antialiased">
        {children}
      </body>
    </html>
  );
}
