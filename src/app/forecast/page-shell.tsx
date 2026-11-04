"use client";
import { PageTitle } from "@/components/ui";
export { monthLabel } from "./pickers";

// Shared chrome for every /forecast/* sub-page. Takes a custom picker
// (month, quarter, or none) as a prop so each sub-route can show the
// right control without conditional logic here.

export function ForecastPageHeader({
  title,
  description,
  picker,
  width = "7xl",
}: {
  title: string;
  description: string;
  picker?: React.ReactNode;
  width?: "6xl" | "7xl";
}) {
  // The bar above ("‹ Forecast", from the page) and this title follow the site's look (components/ui.tsx).
  return (
    <div className={`mx-auto ${width === "6xl" ? "max-w-6xl" : "max-w-7xl"} px-4 pt-8 sm:px-6 sm:pt-10`}>
      <PageTitle title={title} actions={picker}>{description}</PageTitle>
    </div>
  );
}
