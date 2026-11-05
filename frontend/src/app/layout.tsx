import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Skin & AMR Research Studio",
  description: "Explore two independent research models: dermatoscopic lesion classification and MDR prediction from historical case records. View their inputs, evidence, and limitations.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
