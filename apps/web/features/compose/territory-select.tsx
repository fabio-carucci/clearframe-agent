"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Every territory the catalog licenses anything in; a request anywhere else returns nothing. */
const TERRITORIES = [
  "AR",
  "AU",
  "CA",
  "CO",
  "DE",
  "ES",
  "FR",
  "GB",
  "IT",
  "JP",
  "KR",
  "MX",
  "PT",
  "SG",
  "US",
];

const regionName = new Intl.DisplayNames(["en"], { type: "region" });
const byName = [...TERRITORIES].sort((a, b) =>
  (regionName.of(a) ?? a).localeCompare(regionName.of(b) ?? b),
);

interface TerritorySelectProps {
  id: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  "aria-describedby"?: string;
}

export function TerritorySelect({ id, value, disabled, onChange, ...aria }: TerritorySelectProps) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} className="h-8 w-full min-w-0" {...aria}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {byName.map((code) => (
          <SelectItem key={code} value={code}>
            <span className="w-6 font-mono text-xs text-muted-foreground">{code}</span>
            {regionName.of(code)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
