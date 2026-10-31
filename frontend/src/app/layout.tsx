import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Skin & AMR Research Studio",
  description: "Educational skin lesion classification and AMR prediction demo.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
