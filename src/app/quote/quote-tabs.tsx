"use client";
import { useState } from "react";
import { QuoteForm } from "./quote-form";
import { ReverseCommissionCalculator } from "./reverse-commission";
import { ForwardRentalCalculator } from "./forward-rental";
import { Tabs } from "@/components/ui";

type Tab = "forward" | "reverse" | "rental-uplift";

export function QuoteTabs({ models }: { models: string[] }) {
  const [tab, setTab] = useState<Tab>("forward");
  return (
    <>
      <div className="mb-6">
        <Tabs label="Quote tools" value={tab} onChange={setTab}
          items={[{ key: "forward", label: "Rank funders" }, { key: "reverse", label: "Reverse commission" }, { key: "rental-uplift", label: "Rental uplift" }]} />
      </div>
      {tab === "forward" ? (
        <QuoteForm models={models} />
      ) : tab === "reverse" ? (
        <ReverseCommissionCalculator />
      ) : (
        <ForwardRentalCalculator />
      )}
    </>
  );
}
