import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";

export const metadata: Metadata = {
  title: { default: "Panzutti Admin", template: "%s · Panzutti Admin" },
  description: "Orders, payments, menu and reports for Panzutti staff.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#1F6348" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
