import "./globals.css";

export const metadata = { title: "Bug Reporter for Jira" };

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
