"use client";

import { CalendarDays } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** YYYY-MM-DD as a local date, so the calendar shows the day the user picked, in any time zone. */
const toDate = (iso: string) => {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year!, month! - 1, day);
};

const toIso = (date: Date) =>
  [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, "0"))
    .join("-");

const longDate = (iso: string) =>
  toDate(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

interface DateFieldProps {
  id: string;
  value: string;
  /** The earliest date that can be picked, YYYY-MM-DD. */
  min: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  "aria-describedby"?: string;
}

export function DateField({ id, value, min, disabled, onChange, ...aria }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className="h-8 w-full min-w-0 justify-start px-2.5 font-normal"
          {...aria}
        >
          <CalendarDays aria-hidden />
          <span className="truncate">{longDate(value)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          weekStartsOn={1}
          selected={toDate(value)}
          defaultMonth={toDate(value)}
          disabled={{ before: toDate(min) }}
          onSelect={(date) => {
            if (!date) return;
            onChange(toIso(date));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
