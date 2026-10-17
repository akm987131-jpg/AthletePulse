import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AthletePulse — Sports Injury-Awareness & Coach Platform",
  description: "Connected athlete training logbook, natural language discomfort reporting, clinical safety triage, and coach feedback loop.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
